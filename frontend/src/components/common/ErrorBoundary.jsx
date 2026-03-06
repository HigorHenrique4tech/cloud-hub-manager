import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * ErrorBoundary — captura erros de renderização do React e exibe UI amigável.
 *
 * Uso:
 *   <ErrorBoundary>
 *     <MinhaPage />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Erro capturado:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center animate-fade-in">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl
                          bg-red-50 dark:bg-red-900/20">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Algo deu errado
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm">
            {this.state.error?.message || 'Ocorreu um erro inesperado nesta seção.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold
                       rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300
                       hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-[0.97]"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
