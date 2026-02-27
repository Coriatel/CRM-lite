import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
            textAlign: "center",
            direction: "rtl",
            fontFamily: "Rubik, sans-serif",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>
            :(
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>
            משהו השתבש
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#666",
              marginBottom: "24px",
              maxWidth: "300px",
            }}
          >
            אירעה שגיאה בלתי צפויה. נסה לרענן את הדף.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              border: "none",
              background: "#1a5f7a",
              color: "#fff",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            רענן דף
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
