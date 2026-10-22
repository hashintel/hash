/**
 * The left rail: domain tags, audience, which edge kinds to draw, and the
 * legend, drawn from the model so a new layer family needs no edit here.
 */

import { classFor, layerPalette } from "../../../../src/bundle/shared/palette";
import {
  clearFilters,
  setAudience,
  toggleEdgeKind,
  toggleTag,
} from "../view-state";
import { useNavigator } from "./navigator-context";

import type { Audience } from "../../../../src/model";
import type { EdgeKinds } from "../model/projections";

const audienceLabels: Record<Audience, { label: string; hint: string }> = {
  user: { label: "User", hint: "Uses the editor" },
  integrator: {
    label: "Integrator",
    hint: "Embeds, extends or scripts Petrinaut",
  },
  contributor: { label: "Contributor", hint: "Changes Petrinaut itself" },
};

const edgeKindLabels: Record<keyof EdgeKinds, { label: string; hint: string }> =
  {
    imports: {
      label: "Imports",
      hint: "Aggregated from the real import graph",
    },
    declared: { label: "Declared", hint: "@talksTo edges" },
    interfaces: {
      label: "Interfaces",
      hint: "Participation in a modelled interface",
    },
  };

export const Filters = () => {
  const { index, state, update } = useNavigator();
  const tagCounts = new Map<string, number>();
  for (const node of index.nodes.values()) {
    for (const tag of node.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const active =
    state.tags.length > 0 || state.audience !== null || state.query !== "";
  return (
    <aside className="nav-filters">
      <section>
        <h2>
          Domains
          {active ? (
            <button
              type="button"
              className="nav-link"
              onClick={() => update(clearFilters)}
            >
              clear
            </button>
          ) : null}
        </h2>
        <div className="nav-chips">
          {index.model.tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              title={tag.description}
              className={`nav-chip${state.tags.includes(tag.id) ? " active" : ""}`}
              onClick={() => update((current) => toggleTag(current, tag.id))}
            >
              #{tag.id}{" "}
              <span className="nav-count">{tagCounts.get(tag.id) ?? 0}</span>
            </button>
          ))}
        </div>
        <p className="nav-hint-text">
          A domain dims everything outside the tag; the layer tree stays as a
          backdrop.
        </p>
      </section>
      <section>
        <h2>Audience</h2>
        <div className="nav-chips">
          {(Object.keys(audienceLabels) as Audience[]).map((audience) => (
            <button
              key={audience}
              type="button"
              title={audienceLabels[audience].hint}
              className={`nav-chip audience-${audience}${state.audience === audience ? " active" : ""}`}
              onClick={() =>
                update((current) => setAudience(current, audience))
              }
            >
              {audienceLabels[audience].label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Edges</h2>
        {(Object.keys(edgeKindLabels) as (keyof EdgeKinds)[]).map((kind) => (
          <label
            key={kind}
            className="nav-check"
            title={edgeKindLabels[kind].hint}
          >
            <input
              type="checkbox"
              checked={state.edgeKinds[kind]}
              onChange={() =>
                update((current) => toggleEdgeKind(current, kind))
              }
            />
            <span className={`nav-swatch kind-${kind}`} />
            {edgeKindLabels[kind].label}
          </label>
        ))}
      </section>
      <section className="nav-legend">
        <h2>Legend</h2>
        {index.roots.map((root) => {
          const family = classFor(root.id);
          const palette = layerPalette[family] ?? {
            fill: "#f2f2f2",
            stroke: "#777",
          };
          return (
            <div key={root.id} className="nav-legend-row">
              <span
                className="nav-swatch-box"
                style={{
                  background: `var(--pnd-diagram-${family}-fill, ${palette.fill})`,
                  borderColor: `var(--pnd-diagram-${family}-stroke, ${palette.stroke})`,
                }}
              />
              {root.name}
            </div>
          );
        })}
        <div className="nav-legend-row">
          <span className="nav-swatch-box interface" /> interface
        </div>
        <div className="nav-legend-row">
          <span className="nav-swatch-box external" /> external party
        </div>
        <p className="nav-hint-text">
          Arrow: consumes. Circle: provides or implements. Thick line without
          marker: defines.
        </p>
      </section>
    </aside>
  );
};
