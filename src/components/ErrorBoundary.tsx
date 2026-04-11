import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button, Card } from './ui/Base';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <Card className="max-w-md w-full p-8 text-center space-y-6 bg-white dark:bg-slate-900 border-red-100 dark:border-red-900/30 shadow-xl">
            <div className="mx-auto w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Hoppá, valami elromlott!</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Váratlan hiba történt az oldal megjelenítése közben.
              </p>
              {this.state.error && (
                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-left overflow-auto max-h-32">
                  <code className="text-[10px] text-red-600 dark:text-red-400 font-mono">
                    {this.state.error.message}
                  </code>
                </div>
              )}
            </div>
            <Button 
              onClick={this.handleReset} 
              className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Oldal Újratöltése
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
