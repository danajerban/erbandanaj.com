import React from "react";

export class SceneErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("3D Scene Error:", error, errorInfo);
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
            height: "100dvh",
            padding: "2rem",
            textAlign: "center",
            backgroundColor: "#faeaea",
          }}
        >
          <h1 style={{ fontSize: "2rem", marginBottom: "1rem", color: "#1a202c" }}>
            Oops! Something went wrong
          </h1>
          <p style={{ fontSize: "1rem", marginBottom: "1.5rem", color: "#555" }}>
            The 3D scene encountered an error. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              backgroundColor: "#4668ee",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Refresh Page
          </button>
          {import.meta.env.DEV && (
            <details style={{ marginTop: "2rem", textAlign: "left", maxWidth: "600px" }}>
              <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>
                Error Details (Dev Only)
              </summary>
              <pre
                style={{
                  backgroundColor: "#f5f5f5",
                  padding: "1rem",
                  borderRadius: "4px",
                  overflow: "auto",
                  fontSize: "0.875rem",
                }}
              >
                {this.state.error?.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}