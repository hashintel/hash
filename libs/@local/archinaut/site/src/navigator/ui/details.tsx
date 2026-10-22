/**
 * The right rail: what the selected node is, the page to open for it, the
 * pages written beneath it, what it talks to, and what it contains. With
 * nothing selected, what the map is and how to use it.
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
import { focusOn, reveal, toggleTag } from "../view-state";
import { useNavigator } from "./navigator-context";

import type {
  Audience,
  ExternalNode,
  InterfaceNode,
  Participant,
} from "../../../../src/model";
import type { MapEdge, MapLayer } from "../model/map-data";

const provenanceHints: Record<Participant["provenance"], string> = {
  imports: "Proven by the import graph",
  "type-ref": "Proven by a reference to the interface's symbols",
  registration: "Declared: a contribution registered at runtime",
  declared: "Declared by hand, not verified",
};

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

const AudienceBadges = ({ audience }: { audience: Audience[] }) =>
  audience.length === 0 ? (
    <span className="nav-muted">any</span>
  ) : (
    <span className="nav-badges">
      {audience.map((entry) => (
        <span key={entry} className={`nav-badge audience-${entry}`}>
          {entry}
        </span>
      ))}
    </span>
  );

const TagChips = ({ tags }: { tags: string[] }) => {
  const { state, update } = useNavigator();
  return tags.length === 0 ? (
    <span className="nav-muted">none</span>
  ) : (
    <span className="nav-chips inline">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className={`nav-chip${state.tags.includes(tag) ? " active" : ""}`}
          onClick={() => update((current) => toggleTag(current, tag))}
        >
          #{tag}
        </button>
      ))}
    </span>
  );
};

/** Open the node's page, and centre it: the two things to do with a node. */
const Actions = ({ id }: { id: string }) => {
  const { pages, state, update, open } = useNavigator();
  const slug = pageSlugOf(id);
  const page = slug === null ? undefined : pages.get(slug);
  return (
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
        disabled={state.focus === id}
        onClick={() => update((current) => focusOn(current, id))}
        title="Centre this node and its neighbourhood (F)"
      >
        Focus
      </button>
    </div>
  );
};

/** The pages written beneath a layer's own page, nearest first. */
const PagesBeneath = ({ id }: { id: string }) => {
  const { pages, open } = useNavigator();
  const slug = pageSlugOf(id);
  if (slug === null) {
    return null;
  }
  const beneath = [...pages.values()]
    .filter(
      (page) => page.slug.startsWith(`${slug}/`) && page.kind === "authored",
    )
    .sort((left, right) => left.title.localeCompare(right.title));
  if (beneath.length === 0) {
    return null;
  }
  return (
    <section>
      <h2>Guides</h2>
      <ul className="nav-plain">
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
    </section>
  );
};

const weightOf = (edge: MapEdge): number =>
  edge.kind === "imports" ? edge.weight : 0;

const EdgeList = ({
  edges,
  endpoint,
}: {
  edges: MapEdge[];
  endpoint: "from" | "to";
}) =>
  edges.length === 0 ? (
    <p className="nav-muted">None.</p>
  ) : (
    <ul className="nav-plain">
      {[...edges]
        .sort((left, right) => weightOf(right) - weightOf(left))
        .map((edge) => (
          <li key={`${edge.from}>${edge.to}`}>
            <NodeLink id={edge[endpoint]} />{" "}
            <span className="nav-muted">
              {edge.kind === "imports"
                ? `${edge.weight} file ${edge.weight === 1 ? "dependency" : "dependencies"}`
                : edge.protocol}
            </span>
          </li>
        ))}
    </ul>
  );

const Participations = ({ id }: { id: string }) => {
  const { index } = useNavigator();
  const participations = index.interfacesOf.get(id) ?? [];
  return (
    <section>
      <h2>Interfaces</h2>
      {participations.length === 0 ? (
        <p className="nav-muted">Takes part in no modelled interface.</p>
      ) : (
        <ul className="nav-plain">
          {participations.map((iface) => {
            const participant = iface.participants.find(
              (entry) => entry.node === id,
            );
            return (
              <li key={iface.id}>
                <NodeLink id={iface.id} />{" "}
                <span className="nav-muted">{participant?.role}</span>{" "}
                {participant === undefined ? null : (
                  <span
                    className={`nav-badge provenance-${participant.provenance}`}
                    title={provenanceHints[participant.provenance]}
                  >
                    {participant.provenance}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

const LayerDetails = ({ node }: { node: MapLayer }) => {
  const { index } = useNavigator();
  const children = index.children.get(node.id) ?? [];
  const parent = ancestorIds(node.id)[0];
  return (
    <>
      <header>
        <div className="nav-eyebrow">
          layer · {node.package}
          {parent === undefined ? null : (
            <>
              {" "}
              · in <NodeLink id={parent} />
            </>
          )}
        </div>
        <h1>{node.id}</h1>
        <p className="nav-role">{node.role}</p>
        <Actions id={node.id} />
      </header>
      <dl className="nav-facts-grid">
        <dt>Files</dt>
        <dd>{node.fileCount}</dd>
        <dt>Lines</dt>
        <dd>{node.lineCount}</dd>
        <dt>Audience</dt>
        <dd>
          <AudienceBadges audience={node.audience} />
        </dd>
        <dt>Tags</dt>
        <dd>
          <TagChips tags={node.tags} />
        </dd>
      </dl>
      <PagesBeneath id={node.id} />
      <Participations id={node.id} />
      <section>
        <h2>Depends on</h2>
        <EdgeList edges={index.edgesFrom.get(node.id) ?? []} endpoint="to" />
      </section>
      <section>
        <h2>Depended on by</h2>
        <EdgeList edges={index.edgesTo.get(node.id) ?? []} endpoint="from" />
      </section>
      {children.length === 0 ? null : (
        <section>
          <h2>Sub-layers</h2>
          <ul className="nav-plain">
            {children.map((child) => (
              <li key={child.id}>
                <NodeLink id={child.id} />{" "}
                <span className="nav-muted">{child.role}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

const InterfaceDetails = ({ node }: { node: InterfaceNode }) => (
  <>
    <header>
      <div className="nav-eyebrow">
        interface · {node.transport} · defined by{" "}
        <NodeLink id={node.definedBy} />
      </div>
      <h1>{node.name}</h1>
      <p className="nav-role">{node.summary}</p>
      <Actions id={node.id} />
    </header>
    <dl className="nav-facts-grid">
      <dt>Declared in</dt>
      <dd>
        <code>{node.declaredIn}</code>
      </dd>
      <dt>Audience</dt>
      <dd>
        <AudienceBadges audience={node.audience} />
      </dd>
      <dt>Tags</dt>
      <dd>
        <TagChips tags={node.tags} />
      </dd>
    </dl>
    <section>
      <h2>Participants</h2>
      <table className="nav-participants">
        <tbody>
          {node.participants.map((participant) => (
            <tr key={`${participant.node}:${participant.role}`}>
              <td>
                <NodeLink id={participant.node} />
                <div className="nav-evidence" title={participant.evidence}>
                  {participant.evidence.split("/").pop()}
                </div>
              </td>
              <td className="nav-muted">{participant.role}</td>
              <td>
                <span
                  className={`nav-badge provenance-${participant.provenance}`}
                  title={provenanceHints[participant.provenance]}
                >
                  {participant.provenance}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>
);

const ExternalDetails = ({ node }: { node: ExternalNode }) => (
  <>
    <header>
      <div className="nav-eyebrow">external party</div>
      <h1>{node.name}</h1>
      <p className="nav-role">{node.summary}</p>
      <Actions id={node.id} />
    </header>
    <dl className="nav-facts-grid">
      <dt>Audience</dt>
      <dd>
        <AudienceBadges audience={node.audience} />
      </dd>
      <dt>Tags</dt>
      <dd>
        <TagChips tags={node.tags} />
      </dd>
    </dl>
    <Participations id={node.id} />
  </>
);

const Overview = () => {
  const { index } = useNavigator();
  const { model } = index;
  const imports = model.edges.filter((edge) => edge.kind === "imports").length;
  return (
    <>
      <header>
        <div className="nav-eyebrow">the whole architecture</div>
        <h1>Map</h1>
        <p className="nav-role">
          Every layer where the taxonomy puts it, with the interfaces between
          them. Pick a node to see what it is and open its page.
        </p>
      </header>
      <dl className="nav-facts-grid">
        <dt>Layers</dt>
        <dd>{model.layers.length}</dd>
        <dt>Interfaces</dt>
        <dd>{model.interfaces.length}</dd>
        <dt>Import edges</dt>
        <dd>{imports}</dd>
        <dt>Declared edges</dt>
        <dd>{model.edges.length - imports}</dd>
      </dl>
      <section>
        <h2>Try</h2>
        <ul className="nav-plain nav-steps">
          <li>Hover a node to light up what it touches.</li>
          <li>Double-click a node to open its page.</li>
          <li>
            Press <kbd>F</kbd> to centre the selection and its neighbourhood.
          </li>
          <li>Pick a domain tag to see one concern over the backdrop.</li>
        </ul>
      </section>
      <section>
        <h2>Keys</h2>
        <ul className="nav-plain">
          <li>
            <kbd>/</kbd> search · <kbd>Enter</kbd> open page · <kbd>F</kbd>{" "}
            focus · <kbd>Esc</kbd> back
          </li>
        </ul>
      </section>
    </>
  );
};

const DetailsOf = ({ node }: { node: GraphNode }) =>
  isLayer(node) ? (
    <LayerDetails node={node} />
  ) : isInterface(node) ? (
    <InterfaceDetails node={node} />
  ) : (
    <ExternalDetails node={node} />
  );

export const Details = () => {
  const { index, state } = useNavigator();
  const node =
    state.selected === null ? undefined : index.nodes.get(state.selected);
  return (
    <aside className="nav-details">
      {node === undefined ? <Overview /> : <DetailsOf node={node} />}
    </aside>
  );
};
