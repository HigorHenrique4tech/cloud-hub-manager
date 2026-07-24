import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Lightweight ErrorBoundary for dashboard widgets.
 * Shows a compact error card instead of crashing the whole page.
 */
class WidgetErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(`[Widget "${this.props.name || 'unknown'}"] Erro:`, error, info);
  }

  handleRetry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Erro ao carregar {this.props.name || 'widget'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Este módulo encontrou um problema. Os demais continuam funcionando.
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Tentar novamente"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default WidgetErrorBoundary;
