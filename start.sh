#!/usr/bin/env bash
# start.sh — Start both backend and frontend

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       QuizCraft — PDF Quiz App       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Backend setup ──────────────────────────────────────────────
echo "▶  Setting up Python backend…"
cd "$BACKEND"

if [ ! -d "venv" ]; then
  echo "   Creating virtual environment…"
  python3 -m venv venv
fi

source venv/bin/activate
echo "   Installing Python packages…"
pip install -q -r requirements.txt

echo "   Starting Flask server on http://localhost:5001"
python app.py &
BACKEND_PID=$!

# ── Frontend setup ─────────────────────────────────────────────
echo ""
echo "▶  Setting up React frontend…"
cd "$FRONTEND"

if [ ! -d "node_modules" ]; then
  echo "   Installing npm packages (this may take a minute)…"
  npm install
fi

echo "   Starting React app on http://localhost:3000"
npm start &
FRONTEND_PID=$!

echo ""
echo "✓  Both servers started."
echo "   Backend  → http://localhost:5001"
echo "   Frontend → http://localhost:3000"
echo ""
echo "   Press Ctrl+C to stop."

wait $BACKEND_PID $FRONTEND_PID
