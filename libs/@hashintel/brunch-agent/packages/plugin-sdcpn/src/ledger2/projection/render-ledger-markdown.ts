import { code, h1, h2, h3, strikethrough, ul } from "md-pen";

import type {
  LedgerProjection,
  ProjectedClaim,
  ProjectedEntity,
  ProjectedQuestion,
} from "./project-ledger";

/**
 * One structure, two skins: the user skin is clean prose; the agent skin
 * carries record addresses and canonical kind tokens inline, so freeform
 * references resolve identically for both parties.
 */
export type Skin = "user" | "agent";

type ListItems = (string | ListItems)[];

const tag = (skin: Skin, address: string) =>
  skin === "agent" ? ` ${code(address)}` : "";

const claimLine = (skin: Skin, { record, history }: ProjectedClaim) => {
  const line = `${record.text} \u2014 ${record.origin} \u00b7 ${record.status}${tag(skin, record.address)}`;
  if (history.length === 0) return [line];
  return [
    line,
    history.map(
      (ancestor) =>
        `${strikethrough(ancestor.text)} \u2014 superseded${tag(skin, ancestor.address)}`,
    ),
  ];
};

const entityItems = (
  skin: Skin,
  entity: ProjectedEntity,
  withKind = false,
): ListItems => {
  const { record, claims } = entity;
  const kindNote = withKind ? `${record.kind} \u00b7 ` : "";
  // Plannotator's parser renders **bold**, not md-pen's __bold__.
  const heading = `**${record.name}** \u2014 ${kindNote}${record.origin} \u00b7 ${record.status}${tag(skin, record.address)}`;
  if (claims.length === 0) return [heading];
  return [heading, claims.flatMap((claim) => claimLine(skin, claim))];
};

/** Plannotator `:::question` directive; `- [ ]` choices, never `- [x]`. */
const questionBlock = (skin: Skin, question: ProjectedQuestion) =>
  [
    ":::question",
    question.prompt,
    "",
    `${question.context}${skin === "agent" ? ` Record: ${question.claim.address}.` : ""}`,
    ...(question.choices.length > 0
      ? ["", ...question.choices.map((choice) => `- [ ] ${choice}`)]
      : []),
    ":::",
  ].join("\n");

export const renderLedgerMarkdown = (
  projection: LedgerProjection,
  skin: Skin,
): string => {
  const blocks: string[] = [h1(projection.title)];
  for (const section of projection.sections) {
    blocks.push(h2(section.title));
    for (const group of section.kinds) {
      // The canonical kind token is agent-facing only; users see the label.
      const kindTag = skin === "agent" ? ` ${code(group.kind)}` : "";
      blocks.push(h3(`${group.label}${kindTag}`));
      blocks.push(
        ul(group.entities.flatMap((entity) => entityItems(skin, entity))),
      );
    }
  }
  if (projection.questions.length > 0) {
    blocks.push(h2("Open questions"));
    for (const question of projection.questions)
      blocks.push(questionBlock(skin, question));
  }
  if (projection.owed.length > 0) {
    blocks.push(h2("Checks still owed"));
    blocks.push(
      ul(
        projection.owed.map(({ record, concerns }) => {
          const about =
            concerns.length > 0 ? ` \u2014 ${concerns.join(", ")}` : "";
          const tests =
            skin === "agent" && (record.claims?.length ?? 0) > 0
              ? ` \u00b7 tests ${(record.claims ?? []).map((claim) => code(claim)).join(", ")}`
              : "";
          return `${record.text}${about}${tests}${tag(skin, record.address)}`;
        }),
      ),
    );
  }
  if (projection.excluded.length > 0) {
    blocks.push(h2("Excluded from the model"));
    blocks.push(
      ul(
        projection.excluded.flatMap((entity) =>
          entityItems(skin, entity, true),
        ),
      ),
    );
  }
  return blocks.join("\n\n");
};
