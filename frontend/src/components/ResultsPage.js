import React, { useState } from 'react';
import './ResultsPage.css';

export default function ResultsPage({ results, onRetake, onHome }) {
  const {
    total,
    correct,
    wrong,
    unanswered,
    answered,
    percentage,
    flagged_ids: flaggedIds = [],
    results: details
  } = results;
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const answeredCount = answered ?? (total - unanswered);
  const accuracy = answeredCount > 0 ? Math.round((correct / answeredCount) * 100) : 0;
  const skippedRate = total > 0 ? Math.round((unanswered / total) * 100) : 0;
  const flaggedSet = new Set(flaggedIds.map(String));

  const grade = () => {
    if (percentage >= 90) return { label: 'Excellent', cls: 'grade-a' };
    if (percentage >= 75) return { label: 'Good', cls: 'grade-b' };
    if (percentage >= 50) return { label: 'Average', cls: 'grade-c' };
    return { label: 'Needs Work', cls: 'grade-d' };
  };
  const g = grade();

  const filtered = details.filter((r) => {
    if (filter === 'correct') return r.is_correct;
    if (filter === 'wrong') return !r.is_correct && !!r.user_answer;
    if (filter === 'skipped') return !r.user_answer;
    if (filter === 'flagged') return flaggedSet.has(String(r.id));
    return true;
  }).filter((r) => {
    if (!query.trim()) return true;
    const text = `${r.question} ${r.explanation || ''}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  /* Helper: get option text from label */
  const getOptionText = (options, label) => {
    if (!options || !options.length) return label;
    const found = options.find((o) => o.label.toUpperCase() === label.toUpperCase());
    return found ? `${found.label}. ${found.text}` : label;
  };

  const exportResults = () => {
    const rows = [
      ['Question No', 'Question', 'Your Answer', 'Correct Answer', 'Result', 'Explanation'],
      ...details.map((item) => ([
        item.id,
        item.question,
        item.user_answer ? getOptionText(item.options, item.user_answer) : 'Not answered',
        getOptionText(item.options, item.correct_answer),
        item.is_correct ? 'Correct' : item.user_answer ? 'Incorrect' : 'Skipped',
        item.explanation || ''
      ]))
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quizcraft-results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="results-page">
      {/* ── Score card ── */}
      <div className="score-card">
        <div className={`grade-badge ${g.cls}`}>{g.label}</div>
        <div className="score-ring">
          <svg viewBox="0 0 120 120" className="ring-svg">
            <circle cx="60" cy="60" r="52" className="ring-bg" />
            <circle
              cx="60" cy="60" r="52"
              className="ring-fill"
              strokeDasharray={`${(percentage / 100) * 327} 327`}
              strokeDashoffset="0"
            />
          </svg>
          <div className="ring-label">
            <span className="ring-pct">{percentage}%</span>
            <span className="ring-sub">score</span>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat-box">
            <span className="stat-num">{correct}</span>
            <span className="stat-lbl">Correct</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-box">
            <span className="stat-num">{wrong}</span>
            <span className="stat-lbl">Wrong</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-box">
            <span className="stat-num">{unanswered}</span>
            <span className="stat-lbl">Skipped</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-box">
            <span className="stat-num">{total}</span>
            <span className="stat-lbl">Total</span>
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="results-actions">
        <button className="btn-ghost" onClick={onHome}>← New PDF</button>
        <button className="btn-primary" onClick={onRetake}>Retake Quiz ↺</button>
        <button className="btn-ghost" onClick={exportResults}>Export CSV</button>
      </div>

      <div className="results-summary">
        <div className="summary-card">
          <span className="summary-value">{answeredCount}/{total}</span>
          <span className="summary-label">Questions Attempted</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{accuracy}%</span>
          <span className="summary-label">Accuracy On Attempted</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{skippedRate}%</span>
          <span className="summary-label">Skipped Rate</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{flaggedIds.length}</span>
          <span className="summary-label">Marked For Review</span>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="filter-tabs">
        {['all', 'correct', 'wrong', 'skipped', 'flagged'].map((f) => (
          <button
            key={f}
            className={`tab-btn ${filter === f ? 'tab-active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' && `All (${total})`}
            {f === 'correct' && `✓ Correct (${correct})`}
            {f === 'wrong' && `✗ Wrong (${wrong})`}
            {f === 'skipped' && `○ Skipped (${unanswered})`}
            {f === 'flagged' && `⚑ Review (${flaggedIds.length})`}
          </button>
        ))}
      </div>

      <div className="results-tools">
        <input
          className="results-search"
          type="search"
          placeholder="Search questions or explanations"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* ── Detail list ── */}
      <div className="detail-list">
        {filtered.map((item) => (
          <div key={item.id} className={`detail-card ${item.is_correct ? 'dc-correct' : 'dc-wrong'}`}>
            <div className="dc-header">
              <span className="dc-num">
                Q{item.id}
                {flaggedSet.has(String(item.id)) ? ' • Review' : ''}
              </span>
              <span className={`dc-badge ${item.is_correct ? 'badge-correct' : 'badge-wrong'}`}>
                {item.is_correct ? '✓ Correct' : item.user_answer ? '✗ Incorrect' : '○ Skipped'}
              </span>
            </div>
            <p className="dc-question">{item.question}</p>

            <div className="dc-answers">
              {item.user_answer ? (
                <div className={`dc-ans ${item.is_correct ? 'ans-correct' : 'ans-wrong'}`}>
                  <span className="dc-ans-label">Your answer</span>
                  <span className="dc-ans-val">
                    {getOptionText(item.options, item.user_answer)}
                  </span>
                </div>
              ) : (
                <div className="dc-ans ans-skip">
                  <span className="dc-ans-label">Your answer</span>
                  <span className="dc-ans-val dc-skipped">Not answered</span>
                </div>
              )}

              {!item.is_correct && (
                <div className="dc-ans ans-correct">
                  <span className="dc-ans-label">Correct answer</span>
                  <span className="dc-ans-val">
                    {getOptionText(item.options, item.correct_answer)}
                  </span>
                </div>
              )}
            </div>

            {item.explanation && (
              <p className="dc-explanation">{item.explanation}</p>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="results-empty">
            No questions match this filter.
          </div>
        )}
      </div>
    </div>
  );
}
