import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './QuizPage.css';

export default function QuizPage({ rawQuestions, quizData, onQuizReady, onSubmit }) {
  const [session, setSession] = useState(quizData);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(!quizData);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(null);          // null = off
  const [timeLeft, setTimeLeft] = useState(0);
  const [showTimerModal, setShowTimerModal] = useState(!quizData);
  const [timerInput, setTimerInput] = useState('');
  const [questionCountInput, setQuestionCountInput] = useState('');
  const [selectedQuestionCount, setSelectedQuestionCount] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const intervalRef = useRef(null);
  const answersRef = useRef(answers);
  const sessionRef = useRef(session);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /* ── Start quiz session ──────────────────────────────────── */
  const startSession = useCallback(async (timerSeconds = null, questionLimit = null) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/quiz/start', {
        questions: rawQuestions,
        question_limit: questionLimit
      });
      const data = res.data;
      setSession(data);
      onQuizReady(data);
      setCurrentIdx(0);
      setAnswers({});
      if (timerSeconds) {
        setTimer(timerSeconds);
        setTimeLeft(timerSeconds);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start quiz.');
    } finally {
      setLoading(false);
    }
  }, [rawQuestions, onQuizReady]);

  /* ── Timer tick ──────────────────────────────────────────── */
  useEffect(() => {
    if (!timer || !session) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current);
          handleSubmit(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [timer, session]);

  /* ── Handle timer modal ──────────────────────────────────── */
  const handleTimerChoice = (withTimer) => {
    setShowTimerModal(false);
    const secs = withTimer && timerInput ? parseInt(timerInput, 10) * 60 : null;
    const parsedQuestionCount = parseInt(questionCountInput, 10);
    const clampedQuestionCount = Number.isFinite(parsedQuestionCount)
      ? Math.min(Math.max(parsedQuestionCount, 1), rawQuestions.length)
      : rawQuestions.length;
    setSelectedQuestionCount(clampedQuestionCount);
    startSession(secs, clampedQuestionCount);
  };

  /* ── Select answer ───────────────────────────────────────── */
  const selectAnswer = (qId, label) => {
    setAnswers((prev) => ({ ...prev, [String(qId)]: label }));
  };

  /* ── Navigation ──────────────────────────────────────────── */
  const goTo = (idx) => setCurrentIdx(idx);
  const goPrev = () => setCurrentIdx((i) => Math.max(0, i - 1));
  const goNext = () => setCurrentIdx((i) => Math.min(session.questions.length - 1, i + 1));

  /* ── Submit ──────────────────────────────────────────────── */
  const handleSubmit = useCallback(async (auto = false) => {
    const activeSession = sessionRef.current;
    if (!auto && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    if (!activeSession?.session_id) {
      setError('Quiz session expired. Please start again.');
      return;
    }
    setShowConfirm(false);
    clearInterval(intervalRef.current);
    setSubmitting(true);
    try {
      const res = await axios.post('/api/quiz/submit', {
        session_id: activeSession.session_id,
        answers: answersRef.current
      });
      onSubmit(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed.');
      setSubmitting(false);
    }
  }, [onSubmit, showConfirm]);

  useEffect(() => {
    if (!sessionRef.current) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      const targetTag = event.target.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') {
        return;
      }

      const activeSession = sessionRef.current;
      const currentQuestion = activeSession?.questions?.[currentIdx];
      if (!currentQuestion) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (currentIdx < activeSession.questions.length - 1) {
          goNext();
        } else {
          handleSubmit(false);
        }
        return;
      }

      if (!currentQuestion.options?.length) {
        return;
      }

      const normalizedKey = event.key.toUpperCase();
      const optionIndex = Number.parseInt(event.key, 10) - 1;
      if (Number.isInteger(optionIndex) && currentQuestion.options[optionIndex]) {
        event.preventDefault();
        selectAnswer(currentQuestion.id, currentQuestion.options[optionIndex].label);
        return;
      }

      const matchedOption = currentQuestion.options.find((option) => option.label === normalizedKey);
      if (matchedOption) {
        event.preventDefault();
        selectAnswer(currentQuestion.id, matchedOption.label);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIdx, handleSubmit, session]);

  /* ── Format timer ────────────────────────────────────────── */
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  /* ── Timer modal ─────────────────────────────────────────── */
  if (showTimerModal) {
    return (
      <div className="modal-overlay">
        <div className="timer-modal">
          <h2>Quiz Settings</h2>
          <p className="modal-sub">{rawQuestions.length} questions detected</p>

          <div className="timer-option">
            <label className="option-label">
              <span>Questions to include</span>
              <input
                type="number"
                min="1"
                max={rawQuestions.length}
                placeholder={String(rawQuestions.length)}
                value={questionCountInput}
                onChange={(e) => setQuestionCountInput(e.target.value)}
                className="timer-input"
              />
            </label>
          </div>

          <div className="timer-option">
            <label className="option-label">
              <span>Add a timer? (optional)</span>
              <input
                type="number"
                min="1"
                max="180"
                placeholder="Minutes"
                value={timerInput}
                onChange={(e) => setTimerInput(e.target.value)}
                className="timer-input"
              />
            </label>
          </div>

          <div className="modal-actions">
            <button
              className="btn-primary"
              onClick={() => handleTimerChoice(!!timerInput)}
            >
              Start Quiz →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="quiz-loading">
      <div className="spinner" />
      <p>Building your quiz…</p>
    </div>
  );

  if (error) return (
    <div className="quiz-error">
      <p>{error}</p>
      <button
        className="btn-primary"
        onClick={() => startSession(null, selectedQuestionCount)}
      >
        Retry
      </button>
    </div>
  );

  if (!session) return null;

  const questions = session.questions;
  const total = questions.length;
  const q = questions[currentIdx];
  const answered = Object.keys(answers).length;
  const progressPct = Math.round((answered / total) * 100);
  const timerWarning = timer && timeLeft <= 60;

  return (
    <div className="quiz-page">
      {/* ── Top bar ── */}
      <div className="quiz-topbar">
        <div className="quiz-meta">
          <span className="quiz-count">
            Question <strong>{currentIdx + 1}</strong> / {total}
          </span>
          <span className="quiz-answered">{answered} answered</span>
        </div>
        {timer > 0 && (
          <div className={`quiz-timer ${timerWarning ? 'timer-warn' : ''}`}>
            ⏱ {formatTime(timeLeft)}
          </div>
        )}
      </div>

      <div className="quiz-shortcuts">
        Use `1-4` or `A-D` to answer, `←` and `→` to move.
      </div>

      {/* ── Progress bar ── */}
      <div className="quiz-progress-bar">
        <div className="qpb-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* ── Question card ── */}
      <div className="question-card">
        <p className="question-number">Q{currentIdx + 1}</p>
        <h2 className="question-text">{q.question}</h2>

        {/* Options */}
        {q.options && q.options.length > 0 ? (
          <div className="options-list">
            {q.options.map((opt) => {
              const selected = answers[String(q.id)] === opt.label;
              return (
                <button
                  key={opt.label}
                  className={`option-btn ${selected ? 'opt-selected' : ''}`}
                  onClick={() => selectAnswer(q.id, opt.label)}
                >
                  <span className="opt-label">{opt.label}</span>
                  <span className="opt-text">{opt.text}</span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Short-answer input for Q&A-only questions */
          <div className="short-answer">
            <textarea
              className="short-input"
              placeholder="Type your answer…"
              value={answers[String(q.id)] || ''}
              onChange={(e) => selectAnswer(q.id, e.target.value)}
              rows={3}
            />
          </div>
        )}
      </div>

      {/* ── Nav buttons ── */}
      <div className="quiz-nav">
        <button
          className="btn-ghost"
          onClick={goPrev}
          disabled={currentIdx === 0}
        >← Prev</button>

        {currentIdx < total - 1 ? (
          <button className="btn-primary btn-next" onClick={goNext}>
            Next →
          </button>
        ) : (
          <button
            className="btn-primary btn-submit"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Quiz ✓'}
          </button>
        )}
      </div>

      {/* ── Question dot navigator ── */}
      <div className="dot-nav">
        {questions.map((qq, idx) => (
          <button
            key={qq.id}
            title={`Q${idx + 1}`}
            className={`dot ${idx === currentIdx ? 'dot-current' : ''} ${answers[String(qq.id)] ? 'dot-answered' : ''}`}
            onClick={() => goTo(idx)}
          />
        ))}
      </div>

      {/* ── Confirm submit modal ── */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Submit Quiz?</h3>
            <p>
              You have answered <strong>{answered}</strong> of <strong>{total}</strong> questions.
              {answered < total && (
                <> <span className="warn-text">{total - answered} unanswered.</span></>
              )}
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowConfirm(false)}>
                Go Back
              </button>
              <button className="btn-primary" onClick={() => handleSubmit(true)}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
