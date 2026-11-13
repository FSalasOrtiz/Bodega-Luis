import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Si una pantalla falla al dibujarse, muestra un aviso con opción de recargar en vez de dejar la página en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override componentDidCatch(error: Error, info: ErrorInfo) { console.error('Error de pantalla', error, info.componentStack); }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="login"><div className="box" role="alert">
        <h2>Algo no se pudo mostrar</h2>
        <p className="muted">Tus datos están guardados. Recarga la página; si se repite, avisa a Luis.</p>
        <button className="btn pri big" onClick={() => location.reload()}>Recargar</button>
      </div></div>
    );
  }
}
