import React from 'react';
import './Assistant.css';

// Sprint 10.3: Assistant placeholder. The real surface (locally-
// deployed small-param LLM + RAG/function-calling hybrid against the
// hotel's own data) is planned for Sprint 11+ — see the locked
// design decisions section of claude-instructions/part2.md and the
// 10-series brainstorm history for context. This page exists so the
// admin nav has a slot for it now; the empty-state content sets
// expectations (no auto-prompts to imaginary endpoints).

const SUGGESTED_QUESTIONS = [
  'Who worked yesterday?',
  'How many hours did Sarah work this week?',
  'Which staff are nearing overtime this period?',
  'Any handoff notes about housekeeping issues today?',
  'What\'s our payroll total so far this pay period?',
];

const Assistant = () => {
  return (
    <div className="assistant-page">
      <header className="assistant-header">
        <h1 className="assistant-title">Assistant</h1>
        <span className="assistant-badge">Under construction</span>
      </header>

      <p className="assistant-lede">
        A property-private assistant for natural-language questions
        about your staff, shifts, hours, and handoffs. Runs locally
        on the deployment — no employee data leaves the property.
      </p>

      <section className="assistant-empty">
        <div className="assistant-empty-icon" aria-hidden>🤖</div>
        <div className="assistant-empty-title">Not wired up yet</div>
        <div className="assistant-empty-desc">
          The Assistant model + RAG pipeline is planned for the next
          sprint cycle. This page is intentionally empty for now so
          the nav has a slot to grow into.
        </div>
      </section>

      <section className="assistant-preview">
        <h2 className="assistant-section-title">What you'll be able to ask</h2>
        <ul className="assistant-preview-list">
          {SUGGESTED_QUESTIONS.map(q => (
            <li key={q} className="assistant-preview-item">
              <span className="assistant-preview-quote">"{q}"</span>
            </li>
          ))}
        </ul>
        <p className="assistant-preview-note">
          Implementation plan: structured questions go through SQL
          tool-calls against a read-only role; free-text queries
          ("any notes about this weekend?") go through RAG over the
          handoff-notes corpus. Local model so PII never leaves the
          property.
        </p>
      </section>
    </div>
  );
};

export default Assistant;
