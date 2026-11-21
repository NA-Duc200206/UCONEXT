import React, { useEffect, useState } from 'react';
import {
  Check,
  Minus,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';

const AIProductInsights = ({ productId, productName, reviewCount = 0 }) => {
  const [insights, setInsights] = useState(null);
  const [errorState, setErrorState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;

    const loadInsights = async () => {
      setLoading(true);
      setErrorState(null);
      try {
        const res = await api.ai.getProductSummary(productId);
        if (!cancelled) {
          setInsights(res);
        }
      } catch (err) {
        if (!cancelled) {
          setInsights(null);
          setErrorState({
            message: err.message || 'Unable to load product summary.',
            code: err.code || 'AI_ERROR',
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInsights();
    return () => {
      cancelled = true;
    };
  }, [productId, reviewCount, retryTick]);

  const handleAskAI = (question) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('uconext:open-ai-chat', {
        detail: { prompt: question },
      })
    );
  };

  if (loading) {
    return (
      <div className="uc-insights-skeleton" aria-hidden="true">
        <div className="uc-insights-shimmer" />
        <style>{insightsStyles}</style>
      </div>
    );
  }

  if (errorState) {
    return (
      <section className="uc-insights-card" aria-label="Buyer summary status">
        <div className="uc-insights-error-row">
          <div className="uc-insights-error-copy">
            <AlertCircle size={15} className="uc-insights-error-icon" />
            <div>
              <div className="uc-insights-eyebrow">Buyer Summary</div>
              <p className="uc-insights-error-msg">{errorState.message}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setRetryTick((t) => t + 1)}
            className="uc-insights-retry-btn"
          >
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        </div>
        <style>{insightsStyles}</style>
      </section>
    );
  }

  if (!insights) return null;

  return (
    <section className="uc-insights-card" aria-label={`Buyer summary for ${productName || 'product'}`}>
      <div className="uc-insights-header">
        <div className="uc-insights-heading-wrap">
          <div className="uc-insights-eyebrow-row">
            <span className="uc-insights-eyebrow">Buyer Summary</span>
            {insights.reviewCount > 0 && (
              <span className="uc-insights-metric">
                {insights.sentimentScore}% positive · {insights.reviewCount}{' '}
                {insights.reviewCount === 1 ? 'review' : 'reviews'}
              </span>
            )}
          </div>
          <h3 className="uc-insights-headline">{insights.headline}</h3>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="uc-insights-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse summary' : 'Expand summary'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="uc-insights-body">
          <div className="uc-insights-grid">
            <div className="uc-insights-col is-left">
              <h4 className="uc-insights-col-title">
                <span className="uc-insights-marker is-pro" aria-hidden="true">
                  <Check size={11} strokeWidth={2.75} />
                </span>
                <span>Strengths</span>
              </h4>
              <ul className="uc-insights-list">
                {(insights.pros || []).map((pro, idx) => (
                  <li key={idx}>{pro}</li>
                ))}
              </ul>
            </div>

            <div className="uc-insights-col is-right">
              <h4 className="uc-insights-col-title">
                <span className="uc-insights-marker is-con" aria-hidden="true">
                  <Minus size={11} strokeWidth={2.75} />
                </span>
                <span>Considerations</span>
              </h4>
              <ul className="uc-insights-list">
                {(insights.cons || []).map((con, idx) => (
                  <li key={idx}>{con}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="uc-insights-footer">
            <div className="uc-insights-meta">
              <strong>Best for:</strong> {insights.bestFor}
            </div>
            <div className="uc-insights-meta">
              <strong>Verdict:</strong> {insights.verdict}
            </div>

            {Array.isArray(insights.suggestedQuestions) && insights.suggestedQuestions.length > 0 && (
              <div className="uc-insights-chips">
                {insights.suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAskAI(q)}
                    className="uc-insights-chip"
                  >
                    <span>{q}</span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{insightsStyles}</style>
    </section>
  );
};

const insightsStyles = `
  .uc-insights-skeleton {
    border-radius: 12px;
    border: 1px solid var(--glass-border);
    background: var(--bg-primary);
    padding: 22px;
  }

  .uc-insights-shimmer {
    height: 60px;
    border-radius: 8px;
    background: var(--skeleton-base);
  }

  .uc-insights-card {
    border-radius: 12px;
    border: 1px solid var(--glass-border);
    background: var(--bg-primary);
    padding: 22px;
  }

  .uc-insights-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .uc-insights-heading-wrap {
    min-width: 0;
  }

  .uc-insights-eyebrow-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 6px;
  }

  .uc-insights-eyebrow {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #2454F4;
    background: rgba(36, 84, 244, 0.1);
    border: 1px solid rgba(36, 84, 244, 0.22);
    padding: 3px 9px;
    border-radius: 6px;
  }

  .uc-insights-metric {
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }

  .uc-insights-headline {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.015em;
    color: var(--text-primary);
    line-height: 1.4;
    text-wrap: balance;
  }

  .uc-insights-toggle {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color 140ms ease, color 140ms ease, transform 120ms ease;
  }

  .uc-insights-toggle:hover {
    border-color: #2454F4;
    color: #2454F4;
  }

  .uc-insights-toggle:active {
    transform: scale(0.95);
  }

  .uc-insights-body {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--glass-border);
  }

  .uc-insights-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .uc-insights-col.is-left {
    padding-right: 18px;
    border-right: 1px solid var(--glass-border);
  }

  .uc-insights-col.is-right {
    padding-left: 18px;
  }

  .uc-insights-col-title {
    margin: 0 0 10px 0;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .uc-insights-marker {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .uc-insights-marker.is-pro {
    background: rgba(16, 185, 129, 0.14);
    color: #10b981;
  }

  .uc-insights-marker.is-con {
    background: rgba(245, 158, 11, 0.14);
    color: #f59e0b;
  }

  .uc-insights-list {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .uc-insights-footer {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--glass-border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .uc-insights-meta {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .uc-insights-meta strong {
    color: var(--text-primary);
    font-weight: 700;
  }

  .uc-insights-chips {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .uc-insights-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 140ms ease, color 140ms ease, transform 120ms ease;
  }

  .uc-insights-chip:hover {
    border-color: #2454F4;
    color: #2454F4;
  }

  .uc-insights-chip:active {
    transform: scale(0.97);
  }

  .uc-insights-error-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .uc-insights-error-copy {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
  }

  .uc-insights-error-icon {
    color: #f59e0b;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .uc-insights-error-msg {
    margin: 6px 0 0 0;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.45;
    text-wrap: pretty;
  }

  .uc-insights-retry-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color 140ms ease, color 140ms ease, transform 120ms ease;
  }

  .uc-insights-retry-btn:hover {
    border-color: #2454F4;
    color: #2454F4;
  }

  .uc-insights-retry-btn:active {
    transform: scale(0.96);
  }

  @media (max-width: 720px) {
    .uc-insights-grid {
      grid-template-columns: 1fr;
    }

    .uc-insights-col.is-left {
      padding-right: 0;
      padding-bottom: 14px;
      border-right: none;
      border-bottom: 1px solid var(--glass-border);
    }

    .uc-insights-col.is-right {
      padding-left: 0;
      padding-top: 14px;
    }
  }
`;

export default AIProductInsights;
