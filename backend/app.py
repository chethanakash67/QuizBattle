import os
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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# In-memory store for quiz sessions
sessions = {}
auth_tokens = {}
user_histories = {}


def remove_file_safely(filepath):
    try:
        os.remove(filepath)
    except FileNotFoundError:
        pass


def get_auth_token():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return ""


def get_current_user():
    token = get_auth_token()
    return auth_tokens.get(token)


def normalize_text(value):
    return re.sub(r"\s+", " ", str(value or "").strip())


def normalize_choice_token(value):
    normalized = normalize_text(value).upper().rstrip(".):")
    if normalized in {"TRUE", "T"}:
        return "TRUE"
    if normalized in {"FALSE", "F"}:
        return "FALSE"
    return normalized


def build_choice_map(options):
    choice_map = {}
    for option in options or []:
        label = normalize_choice_token(option.get("label"))
        text = normalize_choice_token(option.get("text"))
        if label:
            choice_map[label] = label
        if text:
            choice_map[text] = label or text
    return choice_map


def resolve_correct_answer(raw_answer, options):
    normalized_answer = normalize_choice_token(raw_answer)
    choice_map = build_choice_map(options)
    return choice_map.get(normalized_answer, normalized_answer)


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
                    r'^([A-Fa-f]|True|False|T|F)[.)]?\s+(.+)', next_line, re.IGNORECASE
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
                opt_match = re.match(r'^([A-Fa-f]|True|False|T|F)[.)]?\s+(.+)', next_line, re.IGNORECASE)
                if opt_match:
                    options.append({
                        "label": normalize_choice_token(opt_match.group(1)),
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
                        if re.match(r'^([A-Fa-f]|True|False|T|F)[.)]?\s+', exp_line, re.IGNORECASE):
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
                correct = resolve_correct_answer(answer, options)

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
            option_matches = re.findall(
                r'(?:^|\n)([A-Fa-f]|True|False|T|F)[.)]?\s+([^\n]+)',
                block,
                re.IGNORECASE,
            )
            options = [
                {"label": normalize_choice_token(label), "text": normalize_text(option_text)}
                for label, option_text in option_matches
            ]
            questions.append({
                "id": q_id,
                "question": q_text,
                "options": options,
                "answer": resolve_correct_answer(a_text, options),
                "explanation": ""
            })
            q_id += 1

    return questions


def relabel_options(options, correct_answer):
    if not options:
        return options, normalize_choice_token(correct_answer)

    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    normalized_correct = resolve_correct_answer(correct_answer, options)
    relabeled_options = []
    mapped_answer = normalized_correct

    for idx, option in enumerate(options):
        new_label = letters[idx]
        original_label = normalize_choice_token(option.get("label"))
        relabeled_options.append({
            "label": new_label,
            "text": normalize_text(option.get("text")),
        })
        if original_label == normalized_correct:
            mapped_answer = new_label

    return relabeled_options, mapped_answer


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
    try:
        file.save(filepath)

        # Try pdfplumber first, fallback to PyPDF2
        text = extract_text_pdfplumber(filepath)
        if not text.strip():
            text = extract_text_pypdf2(filepath)

        if not text.strip():
            return jsonify({"error": "Could not extract text from PDF"}), 400

        # Parse questions
        questions = parse_questions(text)
        if not questions:
            questions = parse_questions_fallback(text)

        if not questions:
            return jsonify({
                "error": "No questions found. Please ensure your PDF has numbered questions (e.g., '1. Question?') with answers (e.g., 'Answer: A')."
            }), 400
    finally:
        remove_file_safely(filepath)

    return jsonify({
        "success": True,
        "question_count": len(questions),
        "questions": questions
    })


@app.route("/api/quiz/start", methods=["POST"])
def start_quiz():
    data = request.get_json(silent=True) or {}
    questions = data.get("questions", [])
    question_limit = data.get("question_limit")
    shuffle_questions = bool(data.get("shuffle_questions", True))
    shuffle_options = bool(data.get("shuffle_options", True))

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
    prepared_questions = questions.copy()
    if shuffle_questions:
        random.shuffle(prepared_questions)
    prepared_questions = prepared_questions[:normalized_limit]

    # Shuffle options for each question and assign unique IDs per quiz session.
    # This avoids collisions when source PDFs reuse numbering across sections (e.g., Unit 1 and Unit 2 both start at 1).
    quiz_questions = []
    for idx, q in enumerate(prepared_questions, start=1):
        opts = q.get("options", [])
        if opts:
            shuffled_opts = [
                {
                    "label": normalize_choice_token(opt.get("label")),
                    "text": normalize_text(opt.get("text")),
                }
                for opt in opts
            ]
            if shuffle_options:
                random.shuffle(shuffled_opts)
            shuffled_opts, resolved_answer = relabel_options(shuffled_opts, q["answer"])
            quiz_questions.append({
                "id": idx,
                "source_id": q.get("id"),
                "question": normalize_text(q["question"]),
                "options": shuffled_opts,
                "answer": resolved_answer,
                "explanation": normalize_text(q.get("explanation", ""))
            })
        else:
            quiz_questions.append({
                "id": idx,
                "source_id": q.get("id"),
                "question": normalize_text(q.get("question", "")),
                "options": q.get("options", []),
                "answer": normalize_text(q.get("answer", "")),
                "explanation": normalize_text(q.get("explanation", ""))
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
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    user_answers = data.get("answers", {})

    if not session_id or session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = sessions[session_id]
    questions = session["questions"]
    username = get_current_user()

    correct = 0
    wrong = 0
    unanswered = 0
    results = []

    for q in questions:
        q_id = str(q["id"])
        user_ans = normalize_text(user_answers.get(q_id, ""))
        correct_ans = normalize_text(q["answer"])
        was_answered = bool(user_ans)

        # Handle label-based answers
        is_correct = False
        if was_answered and q["options"]:
            resolved_user_answer = resolve_correct_answer(user_ans, q["options"])
            is_correct = resolved_user_answer == resolve_correct_answer(correct_ans, q["options"])
        elif was_answered:
            is_correct = normalize_choice_token(user_ans) == normalize_choice_token(correct_ans)

        if is_correct:
            correct += 1
        elif was_answered:
            wrong += 1
        else:
            unanswered += 1

        results.append({
            "id": q["id"],
            "question": q["question"],
            "options": q["options"],
            "user_answer": resolve_correct_answer(user_ans, q["options"]) if was_answered and q["options"] else user_ans,
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
            "unanswered": unanswered,
            "answered": total - unanswered,
            "percentage": percentage
        }
        user_histories.setdefault(username, []).insert(0, history_item)

    return jsonify({
        "total": total,
        "correct": correct,
        "wrong": wrong,
        "unanswered": unanswered,
        "answered": total - unanswered,
        "percentage": percentage,
        "results": results
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
