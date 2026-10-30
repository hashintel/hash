/**
 * The strip above the drawing: where the selection sits, search, the
 * domain tags, the focus switch and the way back to the docs. One row,
 * nothing the drawing does not need.
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
import { searchMatches } from "../model/projections";
import {
  clearFilters,
  exitFocus,
  focusOn,
  reveal,
  setQuery,
  toggleTag,
} from "../view-state";
import { useNavigator } from "./navigator-context";

const Breadcrumb = () => {
  const { index, state, update } = useNavigator();
  const id = state.selected ?? state.focus;
  const node = id === null ? undefined : index.nodes.get(id);
  if (node === undefined) {
    return <div className="nav-breadcrumb nav-muted">Architecture</div>;
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
            onClick={() =>
              update((current) => reveal(current, step, regionOf(index, step)))
            }
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
  const pick = (id: string): void =>
    update((current) => setQuery(reveal(current, id, regionOf(index, id)), ""));
  return (
    <div className="nav-search">
      <input
        id="nav-search"
        type="search"
        placeholder="Find a layer…  /"
        value={state.query}
        onChange={(event) =>
          update((current) => setQuery(current, event.target.value))
        }
        onFocus={() => setListOpen(true)}
        onBlur={() => setListOpen(false)}
        onKeyDown={(event) => {
          const first = results[0];
          if (event.key === "Enter" && first !== undefined) {
            pick(first);
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
                  onClick={() => pick(id)}
                >
                  {displayName(node)}
                  <span className="nav-muted">
                    {" "}
                    {isInterface(node)
                      ? "interface"
                      : isLayer(node)
                        ? ""
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

/** The domain tags, behind one button that says how many are on. */
const Domains = () => {
  const { index, state, update } = useNavigator();
  const counts = new Map<string, number>();
  for (const node of index.nodes.values()) {
    for (const tag of node.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return (
    <details className="nav-domains">
      <summary
        className={`nav-button${state.tags.length > 0 ? " active" : ""}`}
        title="Dim everything outside a domain"
      >
        Domains{state.tags.length > 0 ? ` · ${state.tags.length}` : ""}
      </summary>
      <div className="nav-domains-menu">
        {index.model.tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            title={tag.description}
            className={`nav-chip${state.tags.includes(tag.id) ? " active" : ""}`}
            onClick={() => update((current) => toggleTag(current, tag.id))}
          >
            #{tag.id}{" "}
            <span className="nav-count">{counts.get(tag.id) ?? 0}</span>
          </button>
        ))}
        {state.tags.length > 0 ? (
          <button
            type="button"
            className="nav-link"
            onClick={() => update(clearFilters)}
          >
            clear
          </button>
        ) : null}
      </div>
    </details>
  );
};

export const Toolbar = () => {
  const { state, update, close } = useNavigator();
  const focusable = state.selected ?? state.focus;
  return (
    <div className="nav-toolbar">
      <Breadcrumb />
      <Search />
      <Domains />
      <button
        type="button"
        className={`nav-button${state.mode === "focus" ? " active" : ""}`}
        disabled={focusable === null}
        title={
          state.mode === "focus"
            ? "Back to the whole map (Esc)"
            : "Centre the selection and its neighbourhood (F)"
        }
        onClick={() =>
          update((current) =>
            current.mode === "focus"
              ? exitFocus(current)
              : focusable === null
                ? current
                : focusOn(current, focusable),
          )
        }
      >
        Focus
      </button>
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
