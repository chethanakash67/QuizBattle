import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import './UploadPage.css';

export default function UploadPage({ onParsed, isLoggedIn, username, history }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const inputRef = useRef();
  const attemptCount = history.length;
  const bestScore = attemptCount ? Math.max(...history.map((item) => item.percentage || 0)) : 0;
  const averageScore = attemptCount
    ? Math.round(history.reduce((sum, item) => sum + (item.percentage || 0), 0) / attemptCount)
    : 0;
  const latestAttempt = history[0] || null;

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted.');
      return;
    }
    setError('');
    setFile(f);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    handleFile(f);
  }, []);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (ev) => {
          if (!ev.total) {
            return;
          }
          setProgress(Math.round((ev.loaded * 100) / ev.total));
        }
      });
      onParsed(res.data.questions);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Failed to process PDF. Check the file format and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-page">
      {/* Hero */}
      <div className="upload-hero">
        <h1 className="upload-title">Generate a Quiz from PDF</h1>
        <p className="upload-sub">
          Upload a PDF with numbered questions and answers.
          The app extracts, shuffles, and turns them into an interactive quiz.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`drop-zone ${dragging ? 'dz-over' : ''} ${file ? 'dz-filled' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !file && inputRef.current.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !file && inputRef.current.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {!file ? (
          <>
            <div className="dz-icon">⬆</div>
            <p className="dz-text">Drag & drop your PDF here</p>
            <p className="dz-hint">or click to browse</p>
          </>
        ) : (
          <div className="dz-preview">
            <span className="dz-file-icon">📄</span>
            <div className="dz-file-info">
              <span className="dz-file-name">{file.name}</span>
              <span className="dz-file-size">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
            <button
              className="dz-remove"
              onClick={(e) => { e.stopPropagation(); setFile(null); setError(''); }}
              title="Remove file"
            >✕</button>
          </div>
        )}
      </div>

      {/* Progress */}
      {loading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-label">
            {progress < 100 ? `Uploading… ${progress}%` : 'Parsing PDF…'}
          </p>
        </div>
      )}

      {/* Error */}
      {error && <div className="upload-error">{error}</div>}

      {/* Upload button */}
      <button
        className="btn-primary upload-btn"
        onClick={handleUpload}
        disabled={!file || loading}
      >
        {loading ? 'Processing…' : 'Generate Quiz →'}
      </button>

      {/* Format hint */}
      <details className="format-hint">
        <summary>Expected PDF format</summary>
        <pre>{`1. What is the capital of France?
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
Answer: C`}</pre>
      </details>

      {isLoggedIn && (
        <div className="history-card">
          <h3 className="history-title">{username}'s Previous Attempts</h3>
          {attemptCount > 0 && (
            <div className="history-stats">
              <div className="history-stat">
                <span className="history-stat-value">{attemptCount}</span>
                <span className="history-stat-label">Attempts</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">{bestScore}%</span>
                <span className="history-stat-label">Best Score</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">{averageScore}%</span>
                <span className="history-stat-label">Average</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">{latestAttempt?.percentage ?? 0}%</span>
                <span className="history-stat-label">Latest</span>
              </div>
            </div>
          )}
          {history.length === 0 ? (
            <p className="history-empty">No history yet. Complete a quiz to start tracking.</p>
          ) : (
            <div className="history-list">
              {history.slice(0, 10).map((item) => (
                <div key={item.id} className="history-item">
                  <div className="history-main">
                    <span className="history-score">{item.percentage}%</span>
                    <span className="history-meta">
                      {item.correct}/{item.total} correct
                    </span>
                  </div>
                  <span className="history-time">
                    {new Date(item.submitted_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
