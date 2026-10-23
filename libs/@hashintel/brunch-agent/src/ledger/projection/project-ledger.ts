import {
  entityKindStages,
  entityStages,
  type EntityKind,
  type EntityStage,
} from "../elicitation/entities";
import { questionStatuses } from "../shared/epistemics";

import type {
  ClaimRecord,
  EntityRecord,
  LedgerState,
  ObligationRecord,
  ReflectionRecord,
} from "./records";

/** Obligations no reflection has discharged, in recording order. */
export const owedObligations = (ledger: LedgerState): ObligationRecord[] => {
  const discharged = new Set(
    ledger.reflections.flatMap((reflection) => reflection.discharges ?? []),
  );
  return ledger.obligations.filter(
    (obligation) => !discharged.has(obligation.address),
  );
};

export interface ProjectedClaim {
  record: ClaimRecord;
  /** Superseded ancestors, oldest first. */
  history: ClaimRecord[];
}

export interface ProjectedEntity {
  record: EntityRecord;
  claims: ProjectedClaim[];
  /**
   * Reflections on how the net represents this entity: those naming it or one
   * of its current claims or the claims they replaced, in recording order. Renderers choose whether to
   * show them; the model's Markdown does not.
   */
  reflections: ReflectionRecord[];
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
}

export interface ProjectedObligation {
  record: ObligationRecord;
  /** Names of the entities it concerns. */
  concerns: string[];
}

export interface ProjectedMetObligation extends ProjectedObligation {
  /** The reflections that discharged it, in recording order. */
  dischargedBy: ReflectionRecord[];
}

export interface LedgerProjection {
  title: string;
  sections: ProjectedSection[];
  excluded: ProjectedEntity[];
  questions: ProjectedQuestion[];
  owed: ProjectedObligation[];
  met: ProjectedMetObligation[];
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
 * structure. Reflections are construction-mode records: each entity carries
 * the ones about it, and renderers decide whether to show them.
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

  const projectEntity = (record: EntityRecord): ProjectedEntity => {
    const claims = currentClaims.filter((claim) =>
      claim.entities.includes(record.address),
    );
    const projected = claims.map((claim) => ({
      record: claim,
      history: historyOf(claim),
    }));
    const claimAddresses = new Set(
      projected.flatMap(({ record: claim, history }) =>
        [claim, ...history].map(({ address }) => address),
      ),
    );
    return {
      record,
      claims: projected,
      reflections: ledger.reflections.filter(
        (reflection) =>
          reflection.entities?.includes(record.address) === true ||
          reflection.claims?.some((claim) => claimAddresses.has(claim)) ===
            true,
      ),
    };
  };

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
    .filter((claim) => questionStatuses.has(claim.status))
    .map((claim) => projectQuestion(claim, ledger));

  const nameOf = (address: string) =>
    ledger.entities.find((entity) => entity.address === address)?.name ??
    address;
  const owed = owedObligations(ledger).map((record) => ({
    record,
    concerns: (record.entities ?? []).map(nameOf),
  }));
  const met = ledger.obligations.flatMap((record) => {
    const dischargedBy = ledger.reflections.filter((reflection) =>
      reflection.discharges?.includes(record.address),
    );
    return dischargedBy.length === 0
      ? []
      : [
          {
            record,
            concerns: (record.entities ?? []).map(nameOf),
            dischargedBy,
          },
        ];
  });

  return {
    title: ledger.title,
    sections,
    excluded,
    questions,
    owed,
    met,
  };
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
  const concerns = names === "" ? "" : ` Concerns: ${names}.`;
  if (claim.status === "conflicted")
    return {
      claim,
      prompt: claim.text,
      context: `Accounts disagree and nobody has said which holds.${concerns}`,
    };
  return {
    claim,
    prompt: claim.text,
    context: `It matters and nobody knows yet.${concerns}`,
  };
};
