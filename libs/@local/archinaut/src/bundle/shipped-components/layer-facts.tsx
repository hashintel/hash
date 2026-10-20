/**
 * The facts card at the top of every generated layer page: package, layer id,
 * size, and the annotation that declared the layer. The generator emits the
 * values as props, so a host restyles the card rather than re-parsing prose.
 */

import "./layer-cards.css";
import type { ReactNode } from "react";

export interface LayerFactsProps {
  package: string;
  layerId: string;
  files: number;
  lines: number;
  declaredIn: string;
  declaredInUrl: string;
}

const Cell = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="arch-facts-cell">
    <span className="arch-label">{label}</span>
    <span className="arch-facts-value">{value}</span>
  </div>
);

export const LayerFacts = ({
  // `package` is a reserved word, so it cannot be a plain binding.
  package: packageName,
  layerId,
  files,
  lines,
  declaredIn,
  declaredInUrl,
}: LayerFactsProps) => (
  <section className="arch-card arch-facts">
    <div className="arch-facts-grid">
      <Cell label="Package" value={<code>{packageName}</code>} />
      <Cell label="Layer id" value={<code>{layerId}</code>} />
      <Cell label="Files" value={files.toLocaleString("en-US")} />
      <Cell label="Lines" value={lines.toLocaleString("en-US")} />
    </div>
    <div className="arch-facts-source">
      <span className="arch-label">Declared in</span>
      <a href={declaredInUrl}>
        <code>{declaredIn}</code>
      </a>
    </div>
  </section>
);
