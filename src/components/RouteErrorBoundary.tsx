import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Human title for the page — shown in the error UI. */
  title?: string;
  /** Reset key — when it changes, the boundary clears its error state. */
  resetKey?: string;
}

interface State { error: Error | null }

/**
 * Route-level boundary. Catches any runtime error thrown by children and
 * renders an inline retry UI. Does NOT show the app-wide "Update required"
 * screen for non-chunk runtime errors.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RouteErrorBoundary]", this.props.title || "", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h2 className="text-xl font-semibold">Couldn't load {this.props.title || "this page"}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Something went wrong while rendering this page. You can retry without reloading the app.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => this.setState({ error: null })}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
