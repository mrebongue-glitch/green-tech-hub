import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="max-w-md mx-auto px-4 py-24 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          {this.props.title ?? 'Une erreur inattendue s\'est produite'}
        </h2>
        {this.state.error?.message && (
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
        )}
        <Button variant="outline" onClick={this.reset} className="mt-2">
          Réessayer
        </Button>
      </div>
    );
  }
}
