/**
 * The strip above the drawing: where the selection sits in the taxonomy,
 * search, the map/focus and projection switches, and the way back to the
 * docs.
 */

import { useState } from "react";

import { CloseIcon } from "../../shell/icons";
import {
  ancestorIds,
  displayName,
  isInterface,
  isLayer,
  regionOf,
} from "../model/graph";
import { searchMatches, type Projection } from "../model/projections";
import {
  exitFocus,
  focusOn,
  reveal,
  select,
  setProjection,
  setQuery,
} from "../view-state";
import { useNavigator } from "./navigator-context";

const Breadcrumb = () => {
  const { index, state, update } = useNavigator();
  const id = state.selected ?? state.focus;
  const node = id === null ? undefined : index.nodes.get(id);
  if (node === undefined) {
    return <div className="nav-breadcrumb nav-muted">Nothing selected</div>;
  }
  const trail = isLayer(node)
    ? [...ancestorIds(node.id).reverse(), node.id]
    : isInterface(node)
      ? [node.definedBy, node.id]
      : [node.id];
  return (
    <div className="nav-breadcrumb">
      {trail.map((step, position) => (
        <span key={step}>
          {position > 0 ? <span className="nav-crumb-sep">›</span> : null}
          <button
            type="button"
            className={`nav-crumb${step === id ? " current" : ""}`}
            onClick={() => update((current) => select(current, step))}
          >
            {step === node.id
              ? displayName(node)
              : (step.split(".").pop() ?? step)}
          </button>
        </span>
      ))}
    </div>
  );
};

const Search = () => {
  const { index, state, update } = useNavigator();
  const [listOpen, setListOpen] = useState(false);
  const matches = searchMatches(index, state.query);
  const needle = state.query.trim().toLowerCase();
  const results =
    matches === null
      ? []
      : [...matches]
          .filter((id) => {
            const node = index.nodes.get(id);
            return (
              node !== undefined &&
              (node.id.toLowerCase().includes(needle) ||
                node.name.toLowerCase().includes(needle))
            );
          })
          .sort((left, right) => left.length - right.length)
          .slice(0, 8);
  return (
    <div className="nav-search">
      <input
        id="nav-search"
        type="search"
        placeholder="Search layers, interfaces, tags…  /"
        value={state.query}
        onChange={(event) =>
          update((current) => setQuery(current, event.target.value))
        }
        onFocus={() => setListOpen(true)}
        onBlur={() => setListOpen(false)}
        onKeyDown={(event) => {
          const first = results[0];
          if (event.key === "Enter" && first !== undefined) {
            // The query has done its job once a result is picked; leaving it
            // would keep dimming everything else.
            update((current) =>
              setQuery(
                event.shiftKey
                  ? focusOn(current, first)
                  : reveal(current, first, regionOf(index, first)),
                "",
              ),
            );
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            update((current) => setQuery(current, ""));
            event.currentTarget.blur();
          }
        }}
      />
      {listOpen && results.length > 0 ? (
        <ul className="nav-search-results">
          {results.map((id) => {
            const node = index.nodes.get(id);
            return node === undefined ? null : (
              <li key={id}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    update((current) =>
                      setQuery(reveal(current, id, regionOf(index, id)), ""),
                    )
                  }
                >
                  <span
                    className={`nav-dot ${isInterface(node) ? "interface" : isLayer(node) ? "layer" : "external"}`}
                  />
                  {displayName(node)}
                  <span className="nav-muted">
                    {" "}
                    {isInterface(node)
                      ? "interface"
                      : isLayer(node)
                        ? "layer"
                        : "external"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};

const projections: { id: Projection; label: string; title: string }[] = [
  {
    id: "hypergraph",
    label: "Hypergraph",
    title: "An interface is a node with a spoke to each participant",
  },
  {
    id: "pairwise",
    label: "Pairwise",
    title: "An interface expands into consumer → provider edges",
  },
];

export const Toolbar = ({
  showFilters,
  onToggleFilters,
}: {
  showFilters: boolean;
  onToggleFilters: () => void;
}) => {
  const { state, update, close } = useNavigator();
  return (
    <div className="nav-toolbar">
      <button
        type="button"
        className="nav-button"
        aria-pressed={showFilters}
        onClick={onToggleFilters}
        title="Domains, audience, edge kinds and the legend"
      >
        Filters
      </button>
      <Breadcrumb />
      <Search />
      <div className="nav-segments">
        <div className="nav-segment-group" role="group" aria-label="View">
          <button
            type="button"
            className={state.mode === "map" ? "active" : ""}
            onClick={() => update(exitFocus)}
          >
            Overview
          </button>
          <button
            type="button"
            className={state.mode === "focus" ? "active" : ""}
            disabled={state.selected === null && state.focus === null}
            title="Centre the selected node and its neighbourhood (F)"
            onClick={() =>
              update((current) =>
                current.selected === null
                  ? current
                  : focusOn(current, current.selected),
              )
            }
          >
            Focus
          </button>
        </div>
        <div className="nav-segment-group" role="group" aria-label="Projection">
          {projections.map((projection) => (
            <button
              key={projection.id}
              type="button"
              title={projection.title}
              className={state.projection === projection.id ? "active" : ""}
              onClick={() =>
                update((current) => setProjection(current, projection.id))
              }
            >
              {projection.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="nav-close"
        onClick={close}
        aria-label="Close the map"
        title="Back to the docs (Esc)"
      >
        <CloseIcon size="1.25em" />
      </button>
    </div>
  );
};
