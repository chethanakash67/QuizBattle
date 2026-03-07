import os
import json
import re
import random
import uuid
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
import pdfplumber
import PyPDF2

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# In-memory store for quiz sessions
sessions = {}
auth_tokens = {}
user_histories = {}


def get_auth_token():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return ""


def get_current_user():
    token = get_auth_token()
    return auth_tokens.get(token)


def extract_text_pdfplumber(filepath):
    text = ""
    try:
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        print(f"pdfplumber failed: {e}")
    return text


def extract_text_pypdf2(filepath):
    text = ""
    try:
        with open(filepath, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        print(f"PyPDF2 failed: {e}")
    return text


def parse_questions(text):
    """
    Parse questions from extracted PDF text.
    Supports multiple formats:
    Format 1: Q1. Question? A) opt B) opt C) opt D) opt Answer: A
    Format 2: 1. Question? a. opt b. opt Answer: a
    Format 3: Question\nA. opt\nB. opt\nAnswer: B
    """
    questions = []
    lines = text.split("\n")
    lines = [l.strip() for l in lines if l.strip()]

    def match_question_line(line):
        patterns = [
            r'^(?:Q\.?\s*)?(\d+)[.)]\s*(.+)',
            r'^(?:Question\s+)?(\d+)[.)]\s*(.+)',
            r'^(?:Q\.?\s*)?(\d+)\s+(.+)',
        ]
        for pattern in patterns:
            m = re.match(pattern, line, re.IGNORECASE)
            if m:
                return m
        return None

    def match_answer_line(line):
        return re.match(
            r'^(?:Answer|Ans|Correct Answer)\s*[:.\-]?\s*(.+)',
            line,
            re.IGNORECASE
        )

    i = 0
    while i < len(lines):
        line = lines[i]

        # Detect question line patterns
        q_match = match_question_line(line)

        if q_match:
            q_num = int(q_match.group(1))
            q_text = q_match.group(2).strip()

            # Collect continuation of question on next lines
            j = i + 1
            options = []
            answer = None
            answer_explanation = ""

            # Grab more lines for q_text if next line doesn't look like option/answer
            while j < len(lines):
                next_line = lines[j]
                opt_match = re.match(
                    r'^([A-Da-d])[.)]\s+(.+)', next_line
                )
                ans_match = match_answer_line(next_line)
                next_q_match = match_question_line(next_line)

                if opt_match or ans_match or next_q_match:
                    break
                else:
                    q_text += " " + next_line
                    j += 1

            i = j  # Move past question lines

            # Collect options
            while i < len(lines):
                next_line = lines[i]
                opt_match = re.match(r'^([A-Da-d])[.)]\s+(.+)', next_line)
                if opt_match:
                    options.append({
                        "label": opt_match.group(1).upper(),
                        "text": opt_match.group(2).strip()
                    })
                    i += 1
                else:
                    break

            # Collect answer
            while i < len(lines):
                next_line = lines[i]
                ans_match = match_answer_line(next_line)
                if ans_match:
                    answer = ans_match.group(1).strip()
                    i += 1
                    # Check for explanation on next line(s)
                    while i < len(lines):
                        exp_line = lines[i]
                        if match_question_line(exp_line):
                            break
                        if re.match(r'^([A-Da-d])[.)]\s+', exp_line):
                            break
                        if match_answer_line(exp_line):
                            break
                        answer_explanation += " " + exp_line
                        i += 1
                    break
                else:
                    break

            if q_text and answer:
                # Normalize answer to label if it matches option text
                answer_label = answer.upper().strip(".")
                if len(answer_label) == 1 and answer_label in "ABCD":
                    correct = answer_label
                else:
                    # Try to match answer text to option text
                    correct = answer
                    for opt in options:
                        if answer.lower().strip() == opt["text"].lower().strip():
                            correct = opt["label"]
                            break

                questions.append({
                    "id": q_num,
                    "question": q_text.strip(),
                    "options": options,
                    "answer": correct,
                    "explanation": answer_explanation.strip()
                })
        else:
            i += 1

    return questions


def parse_questions_fallback(text):
    """
    Fallback parser: tries to detect Q&A pairs with flexible formats
    including True/False questions and simple Q: A: format.
    """
    questions = []
    blocks = re.split(r'\n\s*\n', text)
    q_id = 1

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        # Format: Q: ... A: ...
        qa_match = re.search(
            r'Q[.:]?\s*(.+?)\s*A[.:]?\s*(.+)', block, re.IGNORECASE | re.DOTALL
        )
        if qa_match:
            q_text = qa_match.group(1).strip()
            a_text = qa_match.group(2).strip()
            questions.append({
                "id": q_id,
                "question": q_text,
                "options": [],
                "answer": a_text,
                "explanation": ""
            })
            q_id += 1

    return questions


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json or {}
    username = str(data.get("username", "")).strip()

    if not username:
        return jsonify({"error": "Username is required"}), 400

    token = uuid.uuid4().hex
    auth_tokens[token] = username
    user_histories.setdefault(username, [])

    return jsonify({
        "token": token,
        "username": username
    })


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    token = get_auth_token()
    if token and token in auth_tokens:
        del auth_tokens[token]
    return jsonify({"success": True})


@app.route("/api/history", methods=["GET"])
def get_history():
    username = get_current_user()
    if not username:
        return jsonify({"error": "Unauthorized"}), 401

    history = user_histories.get(username, [])
    return jsonify({
        "username": username,
        "history": history
    })


@app.route("/api/upload", methods=["POST"])
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "" or not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Please upload a valid PDF file"}), 400

    filename = f"{uuid.uuid4().hex}.pdf"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    # Try pdfplumber first, fallback to PyPDF2
    text = extract_text_pdfplumber(filepath)
    if not text.strip():
        text = extract_text_pypdf2(filepath)

    if not text.strip():
        os.remove(filepath)
        return jsonify({"error": "Could not extract text from PDF"}), 400

    # Parse questions
    questions = parse_questions(text)
    if not questions:
        questions = parse_questions_fallback(text)

    if not questions:
        os.remove(filepath)
        return jsonify({
            "error": "No questions found. Please ensure your PDF has numbered questions (e.g., '1. Question?') with answers (e.g., 'Answer: A')."
        }), 400

    # Clean up file
    os.remove(filepath)

    return jsonify({
        "success": True,
        "question_count": len(questions),
        "questions": questions
    })


@app.route("/api/quiz/start", methods=["POST"])
def start_quiz():
    data = request.json
    questions = data.get("questions", [])
    question_limit = data.get("question_limit")

    if not questions:
        return jsonify({"error": "No questions provided"}), 400

    normalized_limit = len(questions)
    if question_limit is not None:
        try:
            normalized_limit = int(question_limit)
        except (TypeError, ValueError):
            return jsonify({"error": "question_limit must be a number"}), 400
        if normalized_limit < 1:
            return jsonify({"error": "question_limit must be at least 1"}), 400
        normalized_limit = min(normalized_limit, len(questions))

    session_id = uuid.uuid4().hex

    # Shuffle questions
    shuffled_questions = questions.copy()
    random.shuffle(shuffled_questions)
    shuffled_questions = shuffled_questions[:normalized_limit]

    # Shuffle options for each question and assign unique IDs per quiz session.
    # This avoids collisions when source PDFs reuse numbering across sections (e.g., Unit 1 and Unit 2 both start at 1).
    quiz_questions = []
    for idx, q in enumerate(shuffled_questions, start=1):
        opts = q.get("options", [])
        if opts:
            shuffled_opts = opts.copy()
            random.shuffle(shuffled_opts)
            quiz_questions.append({
                "id": idx,
                "source_id": q.get("id"),
                "question": q["question"],
                "options": shuffled_opts,
                "answer": q["answer"],
                "explanation": q.get("explanation", "")
            })
        else:
            quiz_questions.append({
                "id": idx,
                "source_id": q.get("id"),
                "question": q.get("question", ""),
                "options": q.get("options", []),
                "answer": q.get("answer", ""),
                "explanation": q.get("explanation", "")
            })

    sessions[session_id] = {
        "questions": quiz_questions,
        "answers": {}
    }

    # Return questions without answers to the client
    client_questions = []
    for q in quiz_questions:
        client_questions.append({
            "id": q["id"],
            "question": q["question"],
            "options": q["options"]
        })

    return jsonify({
        "session_id": session_id,
        "questions": client_questions,
        "total": len(client_questions)
    })


@app.route("/api/quiz/submit", methods=["POST"])
def submit_quiz():
    data = request.json
    session_id = data.get("session_id")
    user_answers = data.get("answers", {})

    if not session_id or session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    questions = session["questions"]
    username = get_current_user()

    correct = 0
    wrong = 0
    results = []

    for q in questions:
        q_id = str(q["id"])
        user_ans = user_answers.get(q_id, "").strip().upper()
        correct_ans = q["answer"].strip().upper()

        # Handle label-based answers
        is_correct = False
        if len(correct_ans) == 1 and correct_ans in "ABCD":
            is_correct = user_ans == correct_ans
        else:
            is_correct = user_ans.lower() == correct_ans.lower()

        if is_correct:
            correct += 1
        else:
            wrong += 1

        results.append({
            "id": q["id"],
            "question": q["question"],
            "options": q["options"],
            "user_answer": user_ans,
            "correct_answer": q["answer"],
            "is_correct": is_correct,
            "explanation": q.get("explanation", "")
        })

    total = len(questions)
    percentage = round((correct / total) * 100, 1) if total > 0 else 0

    # Clean up session
    del sessions[session_id]

    if username:
        history_item = {
            "id": uuid.uuid4().hex,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "total": total,
            "correct": correct,
            "wrong": wrong,
            "unanswered": total - correct - wrong,
            "percentage": percentage
        }
        user_histories.setdefault(username, []).insert(0, history_item)

    return jsonify({
        "total": total,
        "correct": correct,
        "wrong": wrong,
        "unanswered": total - correct - wrong,
        "percentage": percentage,
        "results": results
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
