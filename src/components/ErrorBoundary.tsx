import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = this.state.error?.message || "Ka ndodhur një gabim i papritur.";
      if (errorMessage.includes('Unauthorized')) {
        errorMessage = "Nuk keni të drejta të mjaftueshme për të kryer këtë veprim.";
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-exclamation-triangle text-2xl"></i>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">Ndjesë!</h1>
            <p className="text-gray-500 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full bg-black text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
            >
              Rifresko Faqen
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
