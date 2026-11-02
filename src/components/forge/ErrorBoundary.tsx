import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ForgeErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error("[Project Forge]", error);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="glass-panel max-w-md rounded-2xl p-8 text-center">
            <h1 className="text-lg font-semibold text-foreground">Terjadi kesalahan.</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Data proyek lokal Anda tidak sengaja dihapus.
            </p>
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
            <div className="mt-6 flex justify-center gap-3">
              <button
                className="btn-forge btn-primary-forge"
                onClick={() => this.setState({ error: null })}
              >
                Coba Lagi
              </button>
              <button
                className="btn-forge btn-ghost-forge"
                onClick={() => window.location.reload()}
              >
                Kembali ke Proyek
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
