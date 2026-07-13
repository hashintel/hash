import { useEffect, useState } from "preact/hooks";

import { parseCardText } from "../../../card-text.ts";

import type { ComponentChildren } from "preact";

const splitTermDescription = (
  item: string,
): { term: string; description: string | null } => {
  const separatorIndex = item.indexOf(" (");
  if (separatorIndex < 0 || !item.endsWith(")")) {
    return { term: item, description: null };
  }
  return {
    term: item.slice(0, separatorIndex),
    description: item.slice(separatorIndex + 2, -1),
  };
};

const splitExample = (
  example: string,
): {
  context: string | null;
  source: string;
  target: string | null;
} => {
  const arrowIndex = example.indexOf(" -> ");
  const sourceWithContext =
    arrowIndex < 0 ? example : example.slice(0, arrowIndex);
  const contextSeparatorIndex = sourceWithContext.indexOf(": ");
  return {
    context:
      contextSeparatorIndex < 0
        ? null
        : sourceWithContext.slice(0, contextSeparatorIndex),
    source:
      contextSeparatorIndex < 0
        ? sourceWithContext
        : sourceWithContext.slice(contextSeparatorIndex + 2),
    target: arrowIndex < 0 ? null : example.slice(arrowIndex + 4),
  };
};

const splitConstraint = (
  constraint: string,
): { label: string; value: string } => {
  const questionSeparatorIndex = constraint.indexOf("? ");
  if (questionSeparatorIndex >= 0) {
    return {
      label: constraint.slice(0, questionSeparatorIndex + 1),
      value: constraint.slice(questionSeparatorIndex + 2),
    };
  }
  const separatorIndex = constraint.indexOf(": ");
  return separatorIndex < 0
    ? { label: constraint, value: "" }
    : {
        label: constraint.slice(0, separatorIndex),
        value: constraint.slice(separatorIndex + 2),
      };
};

const TermList = ({
  items,
  renderItem,
}: {
  items: readonly string[];
  renderItem: (item: string) => ComponentChildren;
}) => (
  <ul>
    {items.map((item, itemIndex) => (
      <li key={`${item}-${itemIndex}`}>{renderItem(item)}</li>
    ))}
  </ul>
);

const TypeSection = ({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) =>
  items.length > 0 ? (
    <section class="relation-type-section">
      <header>
        <h3>{title}</h3>
        <span>{items.length}</span>
      </header>
      <TermList
        items={items}
        renderItem={(item) => {
          const { term, description } = splitTermDescription(item);
          return (
            <>
              <strong>{term}</strong>
              {description ? <span>{description}</span> : null}
            </>
          );
        }}
      />
    </section>
  ) : null;

const ExamplesSection = ({ examples }: { examples: readonly string[] }) =>
  examples.length > 0 ? (
    <section class="relation-examples">
      <header>
        <h3>Examples</h3>
        <span>{examples.length}</span>
      </header>
      <ol>
        {examples.map((example, exampleIndex) => {
          const { context, source, target } = splitExample(example);
          return (
            <li key={`${example}-${exampleIndex}`}>
              {context ? <span class="example-context">{context}</span> : null}
              <span class={`example-pair${target ? "" : " is-single"}`}>
                <span>{source}</span>
                {target ? (
                  <>
                    <span class="example-arrow" aria-hidden="true">
                      →
                    </span>
                    <span>{target}</span>
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  ) : null;

const ConstraintsSection = ({
  constraints,
}: {
  constraints: readonly string[];
}) => (
  <section class="relation-constraints">
    <h3>Constraints</h3>
    <dl>
      {constraints.map((constraint) => {
        const { label, value } = splitConstraint(constraint);
        return (
          <div key={constraint}>
            <dt>{label}</dt>
            <dd>{value || "Not recorded"}</dd>
          </div>
        );
      })}
    </dl>
  </section>
);

const ReferenceSection = ({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) =>
  items.length > 0 ? (
    <section class="relation-reference-section">
      <header>
        <h3>{title}</h3>
        <span>{items.length}</span>
      </header>
      <TermList
        items={items}
        renderItem={(item) => {
          const { term, description } = splitTermDescription(item);
          return (
            <>
              <strong>{term}</strong>
              {description ? <span>{description}</span> : null}
            </>
          );
        }}
      />
    </section>
  ) : null;

const RelationHeading = ({
  level,
  children,
}: {
  level: "h1" | "h2";
  children: ComponentChildren;
}) => (level === "h1" ? <h1>{children}</h1> : <h2>{children}</h2>);

export const RelationCardContent = ({
  cardText,
  headingLevel = "h2",
  compact = false,
  detailsExpanded: controlledDetailsExpanded,
  detailsShortcut = false,
  onDetailsExpandedChange,
}: {
  cardText: string;
  headingLevel?: "h1" | "h2";
  compact?: boolean;
  detailsExpanded?: boolean;
  detailsShortcut?: boolean;
  onDetailsExpandedChange?: (expanded: boolean) => void;
}) => {
  const [localDetailsExpanded, setLocalDetailsExpanded] = useState(false);
  useEffect(() => {
    setLocalDetailsExpanded(false);
  }, [cardText]);

  const parsedCardText = parseCardText(cardText);
  const detailsExpanded = controlledDetailsExpanded ?? localDetailsExpanded;
  const setDetailsExpanded = (expanded: boolean): void => {
    if (controlledDetailsExpanded === undefined) {
      setLocalDetailsExpanded(expanded);
    }
    onDetailsExpandedChange?.(expanded);
  };

  if (parsedCardText.kind === "raw") {
    return (
      <div class={`relation-document${compact ? " is-compact" : ""}`}>
        <pre class="relation-raw-card">{parsedCardText.original}</pre>
      </div>
    );
  }

  const { sections } = parsedCardText;
  const direction = sections.constraints
    .map(splitConstraint)
    .find((constraint) => constraint.label === "direction")?.value;
  const hasTypeFlow =
    sections.sourceTypes.length > 0 || sections.targetTypes.length > 0;

  return (
    <div class={`relation-document${compact ? " is-compact" : ""}`}>
      <header class="relation-summary">
        <div class="relation-title-line">
          <span>Relation</span>
        </div>
        <RelationHeading level={headingLevel}>
          {parsedCardText.relation}
        </RelationHeading>
        <p>{parsedCardText.description}</p>
      </header>

      <ExamplesSection examples={sections.examples} />

      <section class="relation-details">
        <button
          class="relation-details-toggle"
          type="button"
          aria-expanded={detailsExpanded}
          aria-keyshortcuts={detailsShortcut ? "d" : undefined}
          onClick={() => setDetailsExpanded(!detailsExpanded)}
        >
          <span>{detailsExpanded ? "Hide details" : "Details"}</span>
          {detailsShortcut ? <kbd>D</kbd> : null}
        </button>

        {detailsExpanded ? (
          <div class="relation-details-content">
            <dl class="relation-summary-facts">
              <div>
                <dt>Inverse name</dt>
                <dd>{parsedCardText.inverseName}</dd>
              </div>
            </dl>

            {hasTypeFlow ? (
              <section class="relation-flow" aria-label="Relation type flow">
                <TypeSection
                  title="Source types"
                  items={sections.sourceTypes}
                />
                <div
                  class="relation-direction"
                  aria-label={direction ?? "source to target"}
                >
                  <span>source</span>
                  <strong aria-hidden="true">
                    {direction === "symmetric" ? "↔" : "→"}
                  </strong>
                  <span>target</span>
                </div>
                <TypeSection
                  title="Target types"
                  items={sections.targetTypes}
                />
              </section>
            ) : null}

            <div class="relation-reference">
              <ConstraintsSection constraints={sections.constraints} />
              <ReferenceSection title="Ancestors" items={sections.ancestors} />
              <ReferenceSection title="Aliases" items={sections.aliases} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};
