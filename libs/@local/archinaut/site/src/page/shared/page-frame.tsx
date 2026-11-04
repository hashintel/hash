import type { ReactNode } from "react";

/** The main pane: the title in its own panel, then the content in the markdown frame. */
export const PageFrame = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className="main-pane">
    <main>
      <div className="content-panel">
        <div className="sl-container">
          <h1 id="_top">{title}</h1>
        </div>
      </div>
      <div className="content-panel">
        <div className="sl-container">
          <div className="sl-markdown-content">{children}</div>
        </div>
      </div>
    </main>
  </div>
);
