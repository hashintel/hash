import { DATA_TYPE_META_SCHEMA } from "@blockprotocol/type-system";

import { planConversionUpdates } from "../conversion-util";
import { orderDraftsByConversionDependencies } from "./staged-drafts";

import type { StagedDataTypeDraft } from "./staged-drafts";
import type {
  BaseUrl,
  Conversions,
  DataTypeWithMetadata,
  OntologyTypeVersion,
} from "@blockprotocol/type-system";

/**
 * The world as the save would leave it: the saved types plus every staged
 * draft materialized with its conversions planned and placed — mirroring
 * `createStagedMember`, which plans each draft (and its packed edits for
 * existing members) against the world as of its own creation. Display
 * derivations run over this so uncommitted conversions read the way they
 * will after saving: placed against canonicals, composing into families,
 * merging sections.
 *
 * The drawer's own live card edits are NOT applied — rows defined in the
 * open drawer display as the user typed them, overlaid by the card itself.
 */
export const buildStagedConversionWorld = ({
  latestDataTypes,
  drafts,
}: {
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  drafts: StagedDataTypeDraft[];
}): Record<BaseUrl, DataTypeWithMetadata> => {
  if (drafts.length === 0) {
    return latestDataTypes;
  }

  const world: Record<BaseUrl, DataTypeWithMetadata> = { ...latestDataTypes };

  const withConversions = (
    dataType: DataTypeWithMetadata,
    conversions: Record<BaseUrl, Conversions>,
  ): DataTypeWithMetadata => ({
    ...dataType,
    metadata: { ...dataType.metadata, conversions },
  });

  const materialize = (draft: StagedDataTypeDraft) => {
    world[draft.baseUrl] = {
      schema: {
        $schema: DATA_TYPE_META_SCHEMA,
        kind: "dataType",
        $id: draft.versionedUrl,
        ...draft.dataType,
      },
      metadata: {
        recordId: {
          baseUrl: draft.baseUrl,
          version: 1 as unknown as OntologyTypeVersion,
        },
      },
    } as DataTypeWithMetadata;
    for (const nested of draft.memberDrafts ?? []) {
      materialize(nested);
    }
  };
  for (const draft of drafts) {
    materialize(draft);
  }

  const applyPlan = (
    viewedBaseUrl: BaseUrl,
    rows: NonNullable<StagedDataTypeDraft["conversionRows"]>,
  ) => {
    if (rows.length === 0) {
      return;
    }
    const plan = planConversionUpdates({
      viewedBaseUrl,
      desiredRows: rows.map((row) => ({
        targetBaseUrl: row.targetBaseUrl,
        simple: { operator: row.operator, operand: row.value },
      })),
      initialRows: [],
      latestDataTypes: world,
      // Permissions don't shape the preview — the save surfaces its own errors
      canWriteTo: () => true,
    });
    for (const update of plan.updates) {
      const current = world[update.baseUrl];
      if (current) {
        world[update.baseUrl] = withConversions(current, update.conversions);
      }
    }
  };

  const visit = (draft: StagedDataTypeDraft) => {
    applyPlan(draft.baseUrl, draft.conversionRows ?? []);
    for (const entry of draft.memberConversionRows ?? []) {
      applyPlan(entry.childBaseUrl, entry.rows);
    }
    for (const nested of orderDraftsByConversionDependencies(
      draft.memberDrafts ?? [],
    )) {
      visit(nested);
    }
  };
  for (const draft of orderDraftsByConversionDependencies(drafts)) {
    visit(draft);
  }

  return world;
};
