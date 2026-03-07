import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import UploadPage from './components/UploadPage';
import QuizPage from './components/QuizPage';
import ResultsPage from './components/ResultsPage';
import './App.css';

const VIEWS = { UPLOAD: 'upload', QUIZ: 'quiz', RESULTS: 'results' };

export default function App() {
  const [auth, setAuth] = useState(() => {
    const stored = localStorage.getItem('quizcraft_auth');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });
  const [history, setHistory] = useState([]);
  const [view, setView] = useState(VIEWS.UPLOAD);
  const [rawQuestions, setRawQuestions] = useState([]);
  const [quizData, setQuizData] = useState(null);   // { session_id, questions, total }
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (auth?.token) {
      axios.defaults.headers.common.Authorization = `Bearer ${auth.token}`;
      localStorage.setItem('quizcraft_auth', JSON.stringify(auth));
    } else {
      delete axios.defaults.headers.common.Authorization;
      localStorage.removeItem('quizcraft_auth');
    }
  }, [auth]);

  const fetchHistory = useCallback(async () => {
    if (!auth?.token) {
      setHistory([]);
      return;
    }
    try {
      const res = await axios.get('/api/history');
      setHistory(res.data.history || []);
    } catch {
      setHistory([]);
    }
  }, [auth]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handlePdfParsed = (questions) => {
    setRawQuestions(questions);
    setView(VIEWS.QUIZ);
  };

  const handleQuizReady = (data) => {
    setQuizData(data);
  };

  const handleQuizSubmit = (resultsData) => {
    setResults(resultsData);
    setView(VIEWS.RESULTS);
    fetchHistory();
  };

  const handleRetake = () => {
    setQuizData(null);
    setResults(null);
    setView(VIEWS.QUIZ);
  };

  const handleReset = () => {
    setRawQuestions([]);
    setQuizData(null);
    setResults(null);
    setView(VIEWS.UPLOAD);
  };

  const handleLogin = async () => {
    const usernameInput = window.prompt('Enter username');
    const username = usernameInput ? usernameInput.trim() : '';
    if (!username) return;
    try {
      const res = await axios.post('/api/auth/login', { username });
      setAuth({ username: res.data.username, token: res.data.token });
    } catch {
      window.alert('Login failed');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch {
      // Ignore network errors during logout.
    }
    setAuth(null);
    setHistory([]);
  };

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="app-header">
        <button className="logo-btn" onClick={handleReset}>
          <span className="logo-icon">◈</span>
          <span className="logo-text">QuizCraft</span>
        </button>
        <nav className="breadcrumb">
          <span className={view === VIEWS.UPLOAD ? 'bc-active' : ''}>Upload</span>
          <span className="bc-sep">›</span>
          <span className={view === VIEWS.QUIZ ? 'bc-active' : ''}>Quiz</span>
          <span className="bc-sep">›</span>
          <span className={view === VIEWS.RESULTS ? 'bc-active' : ''}>Results</span>
        </nav>
        <div className="auth-controls">
          {auth ? (
            <>
              <span className="user-chip">{auth.username}</span>
              <button className="auth-btn" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <button className="auth-btn" onClick={handleLogin}>Login</button>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">
        {view === VIEWS.UPLOAD && (
          <UploadPage
            onParsed={handlePdfParsed}
            isLoggedIn={!!auth}
            username={auth?.username || ''}
            history={history}
          />
        )}
        {view === VIEWS.QUIZ && (
          <QuizPage
            rawQuestions={rawQuestions}
            quizData={quizData}
            onQuizReady={handleQuizReady}
            onSubmit={handleQuizSubmit}
          />
        )}
        {view === VIEWS.RESULTS && results && (
          <ResultsPage
            results={results}
            onRetake={handleRetake}
            onHome={handleReset}
          />
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="app-footer">
        <span>QuizCraft — PDF Quiz Generator</span>
      </footer>
    </div>
  );
}
