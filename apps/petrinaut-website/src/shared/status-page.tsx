import type { CSSProperties, ReactNode } from "react";

const pageStyle: CSSProperties = {
  alignItems: "center",
  background: "#f6f7f8",
  color: "#1f2933",
  display: "flex",
  fontFamily: "Inter, system-ui, sans-serif",
  height: "100vh",
  justifyContent: "center",
  padding: 24,
  width: "100vw",
};

const panelStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d7dce1",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(31, 41, 51, 0.08)",
  maxWidth: 560,
  padding: 24,
};

const headingStyle: CSSProperties = {
  fontSize: 20,
  lineHeight: "28px",
  margin: "0 0 8px",
};

const bodyStyle: CSSProperties = {
  color: "#4b5563",
  fontSize: 14,
  lineHeight: "20px",
  margin: "0 0 16px",
};

const linkStyle: CSSProperties = {
  color: "#2563eb",
  fontSize: 14,
  fontWeight: 600,
};

/** A full-page notice with a way back to the Petrinaut home page. */
export const StatusPage = ({
  body,
  detail,
  homeLink = (style) => (
    <a href="/" style={style}>
      Back to Petrinaut
    </a>
  ),
  title,
}: {
  body: string;
  detail?: string;
  homeLink?: (style: CSSProperties) => ReactNode;
  title: string;
}) => (
  <main style={pageStyle}>
    <div style={panelStyle}>
      <h1 style={headingStyle}>{title}</h1>
      <p style={bodyStyle}>{body}</p>
      {detail ? <p style={bodyStyle}>{detail}</p> : null}
      {homeLink(linkStyle)}
    </div>
  </main>
);
