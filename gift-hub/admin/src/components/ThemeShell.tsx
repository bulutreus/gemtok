import type { ReactNode } from "react";

export function ThemeShell(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", padding: "20px 16px 48px", maxWidth: 1100, margin: "0 auto" }}>
      <header
        style={{
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: "1px solid rgba(0,212,255,0.12)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "var(--accent)" }}>{props.title}</h1>
        {props.subtitle ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>{props.subtitle}</p>
        ) : null}
      </header>
      {props.children}
    </div>
  );
}
