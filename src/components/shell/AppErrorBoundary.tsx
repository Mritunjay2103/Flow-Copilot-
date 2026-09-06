"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, EmptyState } from "@/components/ui";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex min-h-dvh items-center justify-center bg-hf-bg px-4"
          data-testid="error-boundary"
        >
          <EmptyState
            title="Something went wrong"
            description="The studio hit an unexpected error. Your last saved workflow may still be in this browser’s local storage."
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.reload();
                }}
              >
                Reload app
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
