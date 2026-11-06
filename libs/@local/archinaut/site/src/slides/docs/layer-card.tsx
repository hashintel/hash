/**
 * A layer as the model knows it, on a slide: name, role, size, and its
 * strongest dependencies both ways, each linking to the layer's page. An
 * MDX slide writes `<LayerCard layer="core.simulation" />` and the compile
 * fills in the facts from the bundle's model, so the card is current with
 * the code on every build and ships no model to the browser.
 */

export interface LayerNeighbour {
  id: string;
  name: string;
  /** The file-level dependency count, or the protocol of a declared edge. */
  label: string;
}

export interface LayerFacts {
  id: string;
  name: string;
  role: string;
  package: string;
  fileCount: number;
  lineCount: number;
  dependsOn: LayerNeighbour[];
  dependedOnBy: LayerNeighbour[];
}

const hrefOf = (id: string): string =>
  `/architecture/${id.replace(/\./gu, "/")}`;

const NeighbourList = ({
  title,
  entries,
}: {
  title: string;
  entries: readonly LayerNeighbour[];
}) => (
  <div className="deck-layer__direction">
    <span className="deck-layer__label">{title}</span>
    {entries.length === 0 ? (
      <span className="deck-layer__none">none</span>
    ) : (
      <ul>
        {entries.map(({ id, name, label }) => (
          <li key={id}>
            <a href={hrefOf(id)}>{name}</a>
            <span className="deck-layer__weight">{label}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const LayerCard = ({ facts }: { facts: LayerFacts }) => (
  <section className="deck-layer">
    <header>
      <a className="deck-layer__name" href={hrefOf(facts.id)}>
        {facts.name}
      </a>
      <code>{facts.id}</code>
    </header>
    <p className="deck-layer__role">{facts.role}</p>
    <dl className="deck-layer__facts">
      <div>
        <dt>Package</dt>
        <dd>{facts.package}</dd>
      </div>
      <div>
        <dt>Files</dt>
        <dd>{facts.fileCount.toLocaleString("en-US")}</dd>
      </div>
      <div>
        <dt>Lines</dt>
        <dd>{facts.lineCount.toLocaleString("en-US")}</dd>
      </div>
    </dl>
    <div className="deck-layer__relations">
      <NeighbourList title="Depends on" entries={facts.dependsOn} />
      <NeighbourList title="Depended on by" entries={facts.dependedOnBy} />
    </div>
  </section>
);
