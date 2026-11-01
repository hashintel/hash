/**
 * The source card at the bottom of every generated layer page: how many files
 * resolve to the layer and where they are rooted.
 */

import "./layer-cards.css";

export interface LayerSourceProps {
  files: number;
  root: string;
  rootUrl: string;
}

export const LayerSource = ({ files, root, rootUrl }: LayerSourceProps) => (
  <section className="arch-card arch-source">
    <span className="arch-label">Source</span>
    <p className="arch-source-line">
      {files.toLocaleString("en-US")} file{files === 1 ? "" : "s"} rooted at{" "}
      <a href={rootUrl}>
        <code>{root}</code>
      </a>
    </p>
    <p className="arch-source-note">
      Files under a sub-layer's folder belong to that sub-layer. The full list
      is in <code>architecture.json</code>.
    </p>
  </section>
);
