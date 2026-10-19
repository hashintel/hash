import { code, h1, h2, h3, strikethrough, ul } from "md-pen";

import type {
  LedgerProjection,
  ProjectedClaim,
  ProjectedEntity,
  ProjectedObligation,
  ProjectedQuestion,
} from "./project-ledger";

type ListItems = (string | ListItems)[];

const tag = (address: string) => ` ${code(address)}`;

const claimLine = ({ record, history }: ProjectedClaim) => {
  const line = `${record.text} \u2014 ${record.origin} \u00b7 ${record.status}${tag(record.address)}`;
  if (history.length === 0) return [line];
  return [
    line,
    history.map(
      (ancestor) =>
        `${strikethrough(ancestor.text)} \u2014 superseded${tag(ancestor.address)}`,
    ),
  ];
};

const entityItems = (entity: ProjectedEntity, withKind = false): ListItems => {
  const { record, claims } = entity;
  const kindNote = withKind ? `${record.kind} \u00b7 ` : "";
  const heading = `**${record.name}** \u2014 ${kindNote}${record.origin} \u00b7 ${record.status}${tag(record.address)}`;
  if (claims.length === 0) return [heading];
  return [heading, claims.flatMap((claim) => claimLine(claim))];
};

const questionItems = ({
  claim,
  prompt,
  context,
}: ProjectedQuestion): ListItems => [
  `${prompt}${tag(claim.address)}`,
  [context],
];

const obligationLine = ({ record, concerns }: ProjectedObligation) => {
  const about = concerns.length > 0 ? ` \u2014 ${concerns.join(", ")}` : "";
  const tests =
    (record.claims?.length ?? 0) > 0
      ? ` \u00b7 tests ${(record.claims ?? []).map((claim) => code(claim)).join(", ")}`
      : "";
  return `${record.text}${about}${tests}${tag(record.address)}`;
};

/**
 * The Ledger as Markdown for the model: the projection's structure with record
 * addresses and canonical kind tokens inline, so freeform references resolve
 * to records.
 */
export const renderLedgerMarkdown = (projection: LedgerProjection): string => {
  const blocks: string[] = [h1(projection.title)];
  for (const section of projection.sections) {
    blocks.push(h2(section.title));
    for (const group of section.kinds) {
      blocks.push(h3(`${group.label} ${code(group.kind)}`));
      blocks.push(ul(group.entities.flatMap((entity) => entityItems(entity))));
    }
  }
  if (projection.questions.length > 0) {
    blocks.push(h2("Open questions"));
    blocks.push(
      ul(projection.questions.flatMap((question) => questionItems(question))),
    );
  }
  if (projection.owed.length > 0) {
    blocks.push(h2("Checks still owed"));
    blocks.push(
      ul(projection.owed.map((obligation) => obligationLine(obligation))),
    );
  }
  if (projection.met.length > 0) {
    blocks.push(h2("Checks met"));
    blocks.push(
      ul(
        projection.met.flatMap((obligation) => [
          obligationLine(obligation),
          obligation.dischargedBy.map(
            (reflection) => `${reflection.text}${tag(reflection.address)}`,
          ),
        ]),
      ),
    );
  }
  if (projection.openComments.length > 0) {
    blocks.push(h2("Open comments"));
    blocks.push(
      ul(
        projection.openComments.map(
          ({ id, text, records }) =>
            `${text} \u2014 on ${records.map((address) => code(address)).join(", ")}${tag(id)}`,
        ),
      ),
    );
  }
  if (projection.excluded.length > 0) {
    blocks.push(h2("Excluded from the model"));
    blocks.push(
      ul(projection.excluded.flatMap((entity) => entityItems(entity, true))),
    );
  }
  return blocks.join("\n\n");
};
