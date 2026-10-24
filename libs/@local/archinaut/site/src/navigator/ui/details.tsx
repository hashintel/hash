/**
 * The card over the drawing for the selected node: what it is, the page
 * to open, the guides beneath it, and what it talks to. Compact, so the
 * drawing stays the view.
 */

import {
  ancestorIds,
  displayName,
  isInterface,
  isLayer,
  regionOf,
  type GraphNode,
} from "../model/graph";
import { pageSlugOf } from "../model/pages";
import { focusOn, reveal, select } from "../view-state";
import { useNavigator } from "./navigator-context";

import type { MapEdge } from "../model/map-data";

const NodeLink = ({ id }: { id: string }) => {
  const { index, update } = useNavigator();
  const node = index.nodes.get(id);
  return (
    <button
      type="button"
      className="nav-node-link"
      onClick={() =>
        update((current) => reveal(current, id, regionOf(index, id)))
      }
    >
      {node === undefined ? id : displayName(node)}
    </button>
  );
};

const weightOf = (edge: MapEdge): number =>
  edge.kind === "imports" ? edge.weight : 0;

const EdgeList = ({
  title,
  edges,
  endpoint,
}: {
  title: string;
  edges: MapEdge[];
  endpoint: "from" | "to";
}) =>
  edges.length === 0 ? null : (
    <details className="nav-card-section">
      <summary>
        {title} <span className="nav-count">{edges.length}</span>
      </summary>
      <ul className="nav-plain">
        {[...edges]
          .sort((left, right) => weightOf(right) - weightOf(left))
          .map((edge) => (
            <li key={`${edge.from}>${edge.to}`}>
              <NodeLink id={edge[endpoint]} />{" "}
              <span className="nav-muted">
                {edge.kind === "imports" ? edge.weight : edge.protocol}
              </span>
            </li>
          ))}
      </ul>
    </details>
  );

const Guides = ({ id }: { id: string }) => {
  const { pages, open } = useNavigator();
  const slug = pageSlugOf(id);
  if (slug === null) {
    return null;
  }
  // Guides written for this node, not for the layers beneath it.
  const beneath = [...pages.values()]
    .filter(
      (page) =>
        page.kind === "authored" &&
        page.slug.startsWith(`${slug}/`) &&
        !page.slug.slice(slug.length + 1).includes("/"),
    )
    .sort((left, right) => left.title.localeCompare(right.title));
  return beneath.length === 0 ? null : (
    <ul className="nav-plain nav-guides">
      {beneath.map((page) => (
        <li key={page.slug}>
          <button
            type="button"
            className="nav-node-link prose"
            onClick={() => open(page.slug)}
            title={page.description}
          >
            {page.title}
          </button>
        </li>
      ))}
    </ul>
  );
};

const Interfaces = ({ id }: { id: string }) => {
  const { index } = useNavigator();
  const participations = index.interfacesOf.get(id) ?? [];
  return participations.length === 0 ? null : (
    <details className="nav-card-section">
      <summary>
        Interfaces <span className="nav-count">{participations.length}</span>
      </summary>
      <ul className="nav-plain">
        {participations.map((iface) => (
          <li key={iface.id}>
            <NodeLink id={iface.id} />{" "}
            <span className="nav-muted">
              {iface.participants.find((entry) => entry.node === id)?.role}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
};

const Card = ({ node }: { node: GraphNode }) => {
  const { index, pages, state, update, open } = useNavigator();
  const slug = pageSlugOf(node.id);
  const page = slug === null ? undefined : pages.get(slug);
  const parent = isLayer(node)
    ? ancestorIds(node.id)[0]
    : isInterface(node)
      ? node.definedBy
      : undefined;
  const children = index.children.get(node.id) ?? [];
  return (
    <aside className="nav-card">
      <header className="nav-card-head">
        <div>
          <div className="nav-eyebrow">
            {isLayer(node)
              ? "layer"
              : isInterface(node)
                ? `interface · ${node.transport}`
                : "external"}
            {parent === undefined ? null : (
              <>
                {" "}
                · in <NodeLink id={parent} />
              </>
            )}
          </div>
          <h1>{displayName(node)}</h1>
        </div>
        <button
          type="button"
          className="nav-close small"
          aria-label="Clear the selection"
          onClick={() => update((current) => select(current, null))}
        >
          ×
        </button>
      </header>
      <p className="nav-role">{isLayer(node) ? node.role : node.summary}</p>
      {isLayer(node) ? (
        <p className="nav-facts-line">
          {node.fileCount} files · {node.lineCount} lines
          {node.tags.map((tag) => (
            <span key={tag} className="nav-tag">
              #{tag}
            </span>
          ))}
        </p>
      ) : null}
      <div className="nav-actions">
        {page === undefined || slug === null ? null : (
          <button
            type="button"
            className="nav-button primary"
            onClick={() => open(slug)}
            title="Open the page about this node (Enter)"
          >
            Open page
          </button>
        )}
        <button
          type="button"
          className="nav-button"
          disabled={state.focus === node.id}
          onClick={() => update((current) => focusOn(current, node.id))}
          title="Centre this node and its neighbourhood (F)"
        >
          Focus
        </button>
      </div>
      <Guides id={node.id} />
      <Interfaces id={node.id} />
      <EdgeList
        title="Depends on"
        edges={index.edgesFrom.get(node.id) ?? []}
        endpoint="to"
      />
      <EdgeList
        title="Depended on by"
        edges={index.edgesTo.get(node.id) ?? []}
        endpoint="from"
      />
      {children.length === 0 ? null : (
        <details className="nav-card-section">
          <summary>
            Sub-layers <span className="nav-count">{children.length}</span>
          </summary>
          <ul className="nav-plain">
            {children.map((child) => (
              <li key={child.id}>
                <NodeLink id={child.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
};

export const Details = () => {
  const { index, state } = useNavigator();
  const node =
    state.selected === null ? undefined : index.nodes.get(state.selected);
  return node === undefined ? null : <Card node={node} />;
};
