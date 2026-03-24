"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type ReqRuntimeErrorBoundaryProps = {
  children: ReactNode;
};

type ReqRuntimeErrorBoundaryState = {
  hasError: boolean;
  errorMessage?: string;
  componentStack?: string;
};

export class ReqRuntimeErrorBoundary extends Component<
  ReqRuntimeErrorBoundaryProps,
  ReqRuntimeErrorBoundaryState
> {
  private readonly showDebugDetails = process.env.NODE_ENV !== "production";

  state: ReqRuntimeErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): ReqRuntimeErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      componentStack: errorInfo.componentStack ?? undefined,
    });

    console.error("[ReqAgent Runtime Error]", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      time: new Date().toISOString(),
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      errorMessage: undefined,
      componentStack: undefined,
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "var(--reqagent-bg)",
          color: "var(--reqagent-text)",
        }}
      >
        <section
          style={{
            width: "min(560px, 100%)",
            display: "grid",
            gap: "14px",
            padding: "22px",
            border: "1px solid var(--reqagent-line)",
            borderRadius: "24px",
            background: "rgba(255,255,255,0.92)",
          }}
        >
          <span
            style={{
              width: "fit-content",
              minHeight: "26px",
              display: "inline-flex",
              alignItems: "center",
              padding: "0 10px",
              border: "1px solid rgba(130, 50, 70, 0.16)",
              borderRadius: "999px",
              background: "rgba(130, 50, 70, 0.08)",
              color: "#823246",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Runtime Error
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: "28px",
              letterSpacing: "-0.04em",
            }}
          >
            对话界面发生异常
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              lineHeight: 1.75,
              color: "var(--reqagent-text-soft)",
            }}
          >
            前端已拦截本次运行时错误，并写入浏览器控制台。刷新或重试后可以继续使用。
          </p>
          {this.showDebugDetails && this.state.errorMessage ? (
            <pre
              style={{
                margin: 0,
                padding: "14px",
                border: "1px solid var(--reqagent-line)",
                borderRadius: "16px",
                background: "rgba(246,246,245,0.96)",
                fontFamily: "var(--reqagent-mono)",
                fontSize: "12px",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {this.state.errorMessage}
            </pre>
          ) : null}
          {this.showDebugDetails && this.state.componentStack ? (
            <pre
              style={{
                margin: 0,
                padding: "14px",
                border: "1px solid var(--reqagent-line)",
                borderRadius: "16px",
                background: "rgba(246,246,245,0.96)",
                fontFamily: "var(--reqagent-mono)",
                fontSize: "12px",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {this.state.componentStack}
            </pre>
          ) : null}
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={this.handleReset}
              style={{
                minHeight: "36px",
                padding: "0 14px",
                border: "1px solid var(--reqagent-line)",
                borderRadius: "999px",
                background: "var(--reqagent-text)",
                color: "#fff",
                cursor: "pointer",
                font: "inherit",
              }}
              type="button"
            >
              重试渲染
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                minHeight: "36px",
                padding: "0 14px",
                border: "1px solid var(--reqagent-line)",
                borderRadius: "999px",
                background: "rgba(17,17,17,0.04)",
                color: "var(--reqagent-text)",
                cursor: "pointer",
                font: "inherit",
              }}
              type="button"
            >
              刷新页面
            </button>
          </div>
        </section>
      </main>
    );
  }
}
