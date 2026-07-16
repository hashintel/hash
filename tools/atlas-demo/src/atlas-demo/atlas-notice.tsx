import type { AtlasClientError } from "../atlas-client";
import type { ReactNode } from "react";

interface AtlasNoticeProps {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly detail?: string;
  readonly title: string;
}

/** Centered actionable state shown only when the field cannot explain itself. */
export const AtlasNotice = ({
  actions,
  children,
  detail,
  title,
}: AtlasNoticeProps) => (
  <section className="atlas-notice" role="status" aria-live="polite">
    <h2>{title}</h2>
    <p>{children}</p>
    {detail === undefined ? null : (
      <p className="atlas-notice-detail">
        <code>{detail}</code>
      </p>
    )}
    {actions === undefined ? null : (
      <div className="atlas-notice-actions">{actions}</div>
    )}
  </section>
);

/** User-facing explanation for a validated Atlas boundary failure. */
export const atlasErrorCopy = (
  error: AtlasClientError,
): { readonly body: string; readonly title: string } => {
  switch (error.kind) {
    case "no-active-generation":
      return {
        title: "No active Atlas generation",
        body: "Serve or activate a generation, then retry this bootstrap request.",
      };
    case "network":
      return {
        title: "Atlas API unavailable",
        body: "Start the Atlas server or correct the Vite proxy target, then retry.",
      };
    case "stale-generation":
      return {
        title: "Atlas generation changed",
        body: "Reload bootstrap state before requesting more immutable tiles.",
      };
    case "invalid-tile":
      return {
        title: "Malformed Atlas tile",
        body: "The response violated the ATLTILE2 route, identity, or count contract.",
      };
    case "invalid-json":
    case "invalid-manifest":
      return {
        title: "Unsupported Atlas response",
        body: "The live bootstrap data does not match the current manifest contract.",
      };
    case "http":
      return {
        title: "Atlas request failed",
        body: "The server rejected the request. Check its serving state and retry.",
      };
  }
};
