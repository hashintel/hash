import {
  entityKindStages,
  entityStages,
  type EntityKind,
  type EntityStage,
} from "../elicitation/entities";

import type { ClaimRecord, EntityRecord, LedgerState } from "./records";

export interface ProjectedClaim {
  record: ClaimRecord;
  /** Superseded ancestors, oldest first. */
  history: ClaimRecord[];
}

export interface ProjectedEntity {
  record: EntityRecord;
  claims: ProjectedClaim[];
}

export interface ProjectedKindGroup {
  kind: EntityKind;
  /** User-facing plural label; the canonical kind stays agent-facing. */
  label: string;
  entities: ProjectedEntity[];
}

export interface ProjectedSection {
  title: string;
  kinds: ProjectedKindGroup[];
}

export interface ProjectedQuestion {
  claim: ClaimRecord;
  prompt: string;
  context: string;
  choices: string[];
}

export interface AddressEntry {
  address: string;
  recordType: "entity" | "claim";
  /** Exact text snippets this record contributes to the rendered document. */
  snippets: string[];
}

export interface LedgerProjection {
  title: string;
  sections: ProjectedSection[];
  excluded: ProjectedEntity[];
  questions: ProjectedQuestion[];
  addressEntries: AddressEntry[];
}

const stageTitles: Record<EntityStage, string> = {
  framing: "Framing",
  scope: "Scope",
  input: "Inputs",
  system: "The system",
  output: "Outputs",
  case: "Cases",
};

/** User-facing plural labels; the canonical kind stays agent-facing. */
const kindLabels: Record<EntityKind, string> = {
  purpose: "Purpose",
  appetite: "Session time",
  horizon: "Time spans",
  boundary: "Boundaries",
  lever: "Levers",
  limit: "Limits",
  optimum: "Best settings",
  thing: "Items",
  signal: "Signals",
  location: "Locations",
  resource: "Resources",
  activity: "Activities",
  actor: "People and devices",
  rule: "Policies",
  event: "Events",
  flow: "Routes",
  metric: "Measures",
  direction: "Aims",
  target: "Targets",
  threshold: "Thresholds",
  externality: "External effects",
  case: "Occurrences to reproduce",
};

const kindsInOrder = Object.keys(entityKindStages) as EntityKind[];

const addressNumber = (address: string) => Number(address.slice(1));

/**
 * The deterministic fold from committed records to the sectioned view
 * structure, plus the address entries that let a selection in the rendered
 * document resolve back to records. Reflections are construction-mode records
 * and deliberately stay out of this account view.
 */
export const projectLedger = (ledger: LedgerState): LedgerProjection => {
  const supersededBy = new Map<string, string>();
  for (const claim of ledger.claims)
    for (const earlier of claim.supersedes ?? [])
      supersededBy.set(earlier, claim.address);

  const claimByAddress = new Map(
    ledger.claims.map((claim) => [claim.address, claim]),
  );
  const currentClaims = ledger.claims.filter(
    (claim) => !supersededBy.has(claim.address),
  );

  const historyOf = (claim: ClaimRecord): ClaimRecord[] => {
    const ancestors: ClaimRecord[] = [];
    const walk = (record: ClaimRecord) => {
      for (const earlier of record.supersedes ?? []) {
        const ancestor = claimByAddress.get(earlier);
        if (ancestor) {
          walk(ancestor);
          ancestors.push(ancestor);
        }
      }
    };
    walk(claim);
    return ancestors;
  };

  const projectEntity = (record: EntityRecord): ProjectedEntity => ({
    record,
    claims: currentClaims
      .filter((claim) => claim.entities.includes(record.address))
      .map((claim) => ({ record: claim, history: historyOf(claim) })),
  });

  const included = ledger.entities.filter(
    (entity) => entity.status !== "out-of-scope",
  );
  const excluded = ledger.entities
    .filter((entity) => entity.status === "out-of-scope")
    .map(projectEntity);

  const sections = entityStages
    .map((stage) => ({
      title: stageTitles[stage],
      kinds: kindsInOrder
        .filter((kind) => entityKindStages[kind] === stage)
        .map((kind) => ({
          kind,
          label: kindLabels[kind],
          entities: included
            .filter((entity) => entity.kind === kind)
            .sort(
              (first, second) =>
                addressNumber(first.address) - addressNumber(second.address),
            )
            .map(projectEntity),
        }))
        .filter((group) => group.entities.length > 0),
    }))
    .filter((section) => section.kinds.length > 0);

  const questions = currentClaims
    .filter((claim) => claim.status === "open" || claim.status === "conflicted")
    .map((claim) => projectQuestion(claim, ledger));

  const addressEntries: AddressEntry[] = [
    ...ledger.entities.map((entity) => ({
      address: entity.address,
      recordType: "entity" as const,
      snippets: [entity.name],
    })),
    ...ledger.claims.map((claim) => ({
      address: claim.address,
      recordType: "claim" as const,
      snippets: [claim.text],
    })),
  ];

  return { title: ledger.title, sections, excluded, questions, addressEntries };
};

const projectQuestion = (
  claim: ClaimRecord,
  ledger: LedgerState,
): ProjectedQuestion => {
  const names = claim.entities
    .map(
      (address) =>
        ledger.entities.find((entity) => entity.address === address)?.name ??
        address,
    )
    .join(", ");
  if (claim.status === "conflicted")
    return {
      claim,
      prompt: claim.text,
      context: `Accounts disagree and nobody has said which holds. Concerns: ${names}.`,
      choices: ["It holds", "It does not hold", "Leave it unresolved"],
    };
  // An open claim takes a free-text answer: no choices renders a text card.
  return {
    claim,
    prompt: claim.text,
    context: `It matters and nobody knows yet. Concerns: ${names}.`,
    choices: [],
  };
};
