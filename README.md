# QuizCraft — PDF Quiz Generator

A full-stack web application that generates randomized, interactive quizzes from PDF files.

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Python 3, Flask (port 5001), pdfplumber, PyPDF2 |
| Frontend | React 18, CSS (minimal B&W theme)   |

---

## Quick Start

### Option 1 — One command (macOS / Linux)

```bash
chmod +x start.sh
./start.sh
```

Then open [http://localhost:3000](http://localhost:3000).

---

### Option 2 — Manual

#### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

#### Frontend (new terminal)

```bash
cd frontend
npm install
npm start
```

---

## PDF Format

The app recognises PDFs with numbered Q&A blocks:

```
1. What is the capital of France?
A) London
B) Paris
C) Berlin
D) Rome
Answer: B

2. Which planet is closest to the sun?
A) Earth
B) Venus
C) Mercury
D) Mars
Answer: C
```

> Supported answer prefixes: `Answer:`, `Ans:`, `Correct Answer:`  
> Supported option prefixes: `A)`, `A.`, `a)`, `a.`

---

## Features

- **PDF upload** with drag-and-drop
- **Auto-extraction** of questions, options, and answers
- **Shuffled questions & options** on every quiz start
- **One question at a time** with dot-navigator
- **Optional countdown timer** (set in minutes)
- **Confirmation dialog** before submitting
- **Detailed results**: score, %, correct/wrong/skipped per question
- **Retake** or **start fresh** at any time
- Minimal **black & white** design

---

## Project Structure

```
Quizzapp/
├── backend/
│   ├── app.py              # Flask API
│   ├── requirements.txt
│   └── uploads/            # Temp upload dir (auto-created)
├── frontend/
│   ├── public/index.html
│   ├── src/
│   │   ├── App.js / App.css
│   │   ├── index.js / index.css
│   │   └── components/
│   │       ├── UploadPage.js / .css
│   │       ├── QuizPage.js  / .css
│   │       └── ResultsPage.js / .css
│   └── package.json
├── start.sh
└── README.md
```
