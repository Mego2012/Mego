import { Component, type ReactNode } from 'react';
import { translate } from '../lib/i18n';

/** Prevents blank screens: shows a recovery screen; data is stored separately and is never affected. */
export class ErrorBoundary extends Component<{ children: ReactNode; lang: 'ar' | 'en' }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('UI error', error); }
  render() {
    if (!this.state.error) return this.props.children;
    const t = (k: string) => translate(this.props.lang, k);
    return (
      <div className="error-screen card" role="alert" data-testid="error-screen">
        <div aria-hidden="true" style={{ width: 44, height: 44, margin: "0 auto", color: "var(--warn)" }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01" /></svg></div>
        <h2>{t('errorTitle')}</h2>
        <p className="muted small">{t('errorBody')}</p>
        <p className="tiny muted" dir="ltr">{this.state.error.message}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => this.setState({ error: null })}>{t('retry')}</button>
          <button className="btn primary" onClick={() => { location.hash = '#/'; location.reload(); }}>{t('reload')}</button>
        </div>
      </div>
    );
  }
}
