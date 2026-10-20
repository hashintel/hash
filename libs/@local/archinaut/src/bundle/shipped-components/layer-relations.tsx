/**
 * The relations card on generated layer pages: what the layer depends on and
 * what depends on it, both directions in one card. Import edges carry a count
 * badge; declared `@talksTo` edges carry their protocol in a dashed label.
 */

import "./layer-cards.css";

export interface LayerRelation {
  /** Layer id of the other endpoint. */
  id: string;
  name: string;
  /** Relative URL of the other endpoint's page. */
  href: string;
  provenance: "imports" | "declared";
  crossesPackage: boolean;
  /** File-level import count, for `imports` provenance. */
  imports?: number;
  /** The annotation's protocol text, for `declared` provenance. */
  protocol?: string;
}

export interface LayerRelationsProps {
  dependsOn: LayerRelation[];
  dependedOnBy: LayerRelation[];
}

const Direction = ({
  title,
  entries,
}: {
  title: string;
  entries: LayerRelation[];
}) => (
  <div className="arch-rel-direction">
    <div className="arch-label">{title}</div>
    {entries.length === 0 ? (
      <p className="arch-rel-empty">—</p>
    ) : (
      <ul className="arch-rel-list">
        {entries.map((entry) => (
          <li className="arch-rel-row" key={entry.id}>
            <a className="arch-rel-name" href={entry.href} title={entry.id}>
              {entry.name}
            </a>
            {entry.protocol === undefined ? null : (
              <span
                className="arch-rel-protocol"
                title={`via ${entry.protocol}. Declared with @talksTo; only the endpoints are checked.`}
              >
                <span className="arch-rel-via">via</span> {entry.protocol}
              </span>
            )}
            <span className="arch-rel-badges">
              {entry.imports === undefined ? null : (
                <span
                  className="arch-rel-count"
                  title={`${entry.imports} file-level import${entry.imports === 1 ? "" : "s"}`}
                >
                  {entry.imports}
                </span>
              )}
              {entry.crossesPackage ? (
                <span
                  className="arch-rel-pkg"
                  title="Crosses a package boundary"
                >
                  pkg
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const LayerRelations = ({
  dependsOn,
  dependedOnBy,
}: LayerRelationsProps) => (
  // Left to right matches the diagrams: consumers first, then dependencies.
  <section className="arch-card arch-rel">
    <Direction title="Depended on by" entries={dependedOnBy} />
    <Direction title="Depends on" entries={dependsOn} />
    <p className="arch-rel-note">
      Counts are file-level imports, aggregated across every covered package.
      Dashed labels are <code>@talksTo</code> declarations: the protocol text is
      the annotation's claim, and only the endpoints are checked.
    </p>
  </section>
);
