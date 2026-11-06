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
        <div style={{ fontSize: 40 }}>⚠️</div>
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
