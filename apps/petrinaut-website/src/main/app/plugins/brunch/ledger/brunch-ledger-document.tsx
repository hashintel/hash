import { useEffect, useRef } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { reflectionSelection } from "./brunch-ledger-selection";

import type {
  LedgerProjection,
  ProjectedClaim,
  ProjectedEntity,
  ProjectedObligation,
  ReflectionRecord,
} from "@hashintel/brunch-agent";
import type { SelectionItem } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

const documentStyle = css({
  fontSize: "sm",
  lineHeight: "[1.65]",
  overflowWrap: "anywhere",
  "& :is(h1, h2, h3)": {
    fontWeight: "semibold",
    lineHeight: "[1.3]",
    marginTop: "6",
    marginBottom: "3",
  },
  "& h1": { fontSize: "xl", marginTop: "0" },
  "& h2": { fontSize: "lg" },
  "& ul": { listStyleType: "disc", paddingLeft: "5", marginBottom: "3" },
  "& ul ul": { marginBottom: "0" },
  // While a selection is traced, records outside the trace recede, but only
  // when a traced record is shown: the trace may reach only hidden reflections.
  "&[data-tracing]:has([data-traced]) [data-ledger-address]:not([data-traced])":
    {
      opacity: "[0.4]",
    },
});

const recordStyle = css({
  borderRadius: "sm",
  transition: "[background-color 150ms, box-shadow 150ms, opacity 150ms]",
  "&[data-traced]": {
    backgroundColor: "blue.s40",
    boxShadow: "[0 0 0 2px {colors.blue.s70}]",
    boxDecorationBreak: "clone",
    paddingX: "0.5",
    fontWeight: "medium",
  },
});

const qualifierStyle = css({ color: "neutral.s90" });

const reflectionStyle = css({ color: "neutral.s100", fontStyle: "italic" });

/** What the document shows besides the records themselves. */
export interface LedgerDocumentOptions {
  /** Record addresses to mark, such as those behind the canvas selection. */
  readonly traced: ReadonlySet<string>;
  /** Whether to show the agent's reflections under the entities they concern. */
  readonly showReflections: boolean;
  /** Select a reflection's net elements on the canvas; absent where there is no canvas. */
  readonly onSelectNetElements?: (items: SelectionItem[]) => void;
}

/**
 * One record where it appears. A claim can appear under several entities,
 * so the same address can mark more than one block.
 */
const RecordMark = ({
  address,
  options,
  children,
}: {
  address: string;
  options: LedgerDocumentOptions;
  children: ReactNode;
}) => (
  <span
    className={recordStyle}
    data-ledger-address={address}
    data-traced={options.traced.has(address) ? "" : undefined}
  >
    {children}
  </span>
);

const qualifiers = (...parts: string[]) => (
  <span className={qualifierStyle}> — {parts.join(" · ")}</span>
);

const ClaimItem = ({
  claim: { record, history },
  options,
}: {
  claim: ProjectedClaim;
  options: LedgerDocumentOptions;
}) => (
  <li>
    <RecordMark address={record.address} options={options}>
      {record.text}
      {qualifiers(record.origin, record.status)}
    </RecordMark>
    {history.length > 0 && (
      <ul>
        {history.map((ancestor) => (
          <li key={ancestor.address}>
            <RecordMark address={ancestor.address} options={options}>
              <s>{ancestor.text}</s>
              {qualifiers("superseded")}
            </RecordMark>
          </li>
        ))}
      </ul>
    )}
  </li>
);

const ReflectionItem = ({
  reflection,
  options,
}: {
  reflection: ReflectionRecord;
  options: LedgerDocumentOptions;
}) => {
  const items = reflectionSelection(reflection);
  const { onSelectNetElements } = options;
  return (
    <li>
      <RecordMark address={reflection.address} options={options}>
        <span className={reflectionStyle}>{reflection.text}</span>
      </RecordMark>
      {onSelectNetElements && items.length > 0 && (
        <>
          {" "}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onSelectNetElements(items)}
          >
            Show in net
          </Button>
        </>
      )}
    </li>
  );
};

const EntityItem = ({
  entity: { record, claims, reflections },
  options,
  withKind = false,
}: {
  entity: ProjectedEntity;
  options: LedgerDocumentOptions;
  withKind?: boolean;
}) => {
  const shownReflections = options.showReflections ? reflections : [];
  return (
    <li>
      <RecordMark address={record.address} options={options}>
        <strong>{record.name}</strong>
        {withKind
          ? qualifiers(record.kind, record.origin, record.status)
          : qualifiers(record.origin, record.status)}
      </RecordMark>
      {claims.length + shownReflections.length > 0 && (
        <ul>
          {claims.map((claim) => (
            <ClaimItem
              key={claim.record.address}
              claim={claim}
              options={options}
            />
          ))}
          {shownReflections.map((reflection) => (
            <ReflectionItem
              key={reflection.address}
              reflection={reflection}
              options={options}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

const ObligationItem = ({
  obligation: { record, concerns },
  options,
  children,
}: {
  obligation: ProjectedObligation;
  options: LedgerDocumentOptions;
  children?: ReactNode;
}) => (
  <li>
    <RecordMark address={record.address} options={options}>
      {record.text}
      {concerns.length > 0 && qualifiers(concerns.join(", "))}
    </RecordMark>
    {children}
  </li>
);

/**
 * The Ledger read as a document: the user skin's sections and wording, with
 * every record occurrence marked by its address so a selection or a comment
 * can resolve to the records it touches.
 */
export const BrunchLedgerDocument = ({
  projection,
  options,
}: {
  projection: LedgerProjection;
  options: LedgerDocumentOptions;
}) => {
  const articleRef = useRef<HTMLElement>(null);
  const tracedKey = [...options.traced].join(" ");
  useEffect(() => {
    if (tracedKey === "") return;
    articleRef.current
      ?.querySelector("[data-traced]")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [tracedKey]);
  return (
    <article
      ref={articleRef}
      className={documentStyle}
      data-testid="brunch-ledger-document"
      data-tracing={options.traced.size > 0 ? "" : undefined}
    >
      <h1>{projection.title}</h1>
      {projection.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.kinds.map((group) => (
            <section key={group.kind}>
              <h3>{group.label}</h3>
              <ul>
                {group.entities.map((entity) => (
                  <EntityItem
                    key={entity.record.address}
                    entity={entity}
                    options={options}
                  />
                ))}
              </ul>
            </section>
          ))}
        </section>
      ))}
      {projection.questions.length > 0 && (
        <section>
          <h2>Open questions</h2>
          <ul>
            {projection.questions.map(({ claim, prompt, context }) => (
              <li key={claim.address}>
                <RecordMark address={claim.address} options={options}>
                  {prompt}
                </RecordMark>
                <ul>
                  <li className={qualifierStyle}>{context}</li>
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      {projection.owed.length > 0 && (
        <section>
          <h2>Checks still owed</h2>
          <ul>
            {projection.owed.map((obligation) => (
              <ObligationItem
                key={obligation.record.address}
                obligation={obligation}
                options={options}
              />
            ))}
          </ul>
        </section>
      )}
      {projection.met.length > 0 && (
        <section>
          <h2>Checks met</h2>
          <ul>
            {projection.met.map((obligation) => (
              <ObligationItem
                key={obligation.record.address}
                obligation={obligation}
                options={options}
              >
                <ul>
                  {obligation.dischargedBy.map((reflection) => (
                    <ReflectionItem
                      key={reflection.address}
                      reflection={reflection}
                      options={options}
                    />
                  ))}
                </ul>
              </ObligationItem>
            ))}
          </ul>
        </section>
      )}
      {projection.excluded.length > 0 && (
        <section>
          <h2>Excluded from the model</h2>
          <ul>
            {projection.excluded.map((entity) => (
              <EntityItem
                key={entity.record.address}
                entity={entity}
                options={options}
                withKind
              />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
};
