import { Link } from "@tanstack/react-router";

export const NotFound = () => (
  <div className="main-pane">
    <main>
      <div className="content-panel">
        <div className="sl-container">
          <h1 id="_top">Page not found</h1>
        </div>
      </div>
      <div className="content-panel">
        <div className="sl-container">
          <div className="sl-markdown-content">
            <p>
              Nothing lives at this address.{" "}
              <Link to="/">Start from the front page.</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
);
