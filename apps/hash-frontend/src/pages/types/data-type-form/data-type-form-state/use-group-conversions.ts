import { useMemo, useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  buildConversionGroups,
  compareConversionSteps,
  groupConversionRowStates,
  parseSimpleConversion,
  planConversionUpdates,
  simpleEffectiveFactor,
} from "../conversion-util";
import { isLiveDataType } from "../live-data-types";
import { seedGroupCardEdits } from "./group-card-edits";
import { buildStagedConversionWorld } from "./staged-conversion-world";
import {
  ancestorDepthMap,
  belongsToAnyGroup,
  coMemberRank,
  familyDepthFrom,
  groupAncestorsOf,
} from "./type-family";

import type {
  ConversionRow,
  GroupConversionRowState,
} from "../conversion-util";
import type { AllowedTypeEntry } from "../select-data-type-input";
import type { SimpleConversionEdit } from "./group-card-edits";
import type { StagedDataTypeDraft } from "./staged-drafts";
import type {
  BaseUrl,
  Conversions,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

type ReferenceEntry = Extract<AllowedTypeEntry, { dataTypeId: VersionedUrl }>;

/**
 * A group's conversions-by-proxy: the group itself is abstract, so
 * conversions are viewed and edited on its concrete members. This hook owns
 * the card's edit state (overrides and new rows over the saved rows), the
 * family traversal that decides whose rows show, the per-member target
 * options, and the per-member save-time planning.
 */
export const useGroupConversions = ({
  groupConversionsApplicable,
  initialDraft,
  latestDataTypes,
  editedDataType,
  allowedTypes,
  stagedDrafts,
  draftsByBaseUrl,
  draftOwnedMemberBases,
  resolveDataType,
  canEditByBaseUrl,
  onRowsEdited,
}: {
  groupConversionsApplicable: boolean;
  initialDraft?: StagedDataTypeDraft;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  editedDataType: DataTypeWithMetadata | null;
  allowedTypes: AllowedTypeEntry[];
  stagedDrafts: { byUrl: Map<VersionedUrl, StagedDataTypeDraft> };
  draftsByBaseUrl: Map<BaseUrl, StagedDataTypeDraft>;
  draftOwnedMemberBases: Map<BaseUrl, BaseUrl>;
  resolveDataType: (
    dataTypeId: VersionedUrl,
  ) => DataTypeWithMetadata | undefined;
  canEditByBaseUrl: (baseUrl: BaseUrl) => boolean;
  /** Fired on any row edit, so the form can clear a shown conversions error */
  onRowsEdited: () => void;
}) => {
  /**
   * A group's conversion edits, held apart from the saved rows (which derive
   * from the membership as it stands): staged step replacements or removals
   * keyed by row, plus rows not yet saved anywhere. A reopened staged group
   * re-derives them from the edits packed into its draft.
   */
  const [groupRowOverrides, setGroupRowOverrides] = useState<
    Map<string, SimpleConversionEdit | "removed">
  >(() =>
    initialDraft?.memberConversionRows
      ? seedGroupCardEdits({
          memberConversionRows: initialDraft.memberConversionRows,
          latestDataTypes,
        }).overrides
      : new Map(),
  );
  const [newGroupConversionRows, setNewGroupConversionRows] = useState<
    GroupConversionRowState[]
  >(() =>
    initialDraft?.memberConversionRows
      ? seedGroupCardEdits({
          memberConversionRows: initialDraft.memberConversionRows,
          latestDataTypes,
        }).newRows
      : [],
  );

  /**
   * The save's view of the world: drafts materialized with their packed
   * conversions planned and placed. Display derivations (draft rows, section
   * grouping) run over this, so staged-elsewhere conversions read post-save;
   * this drawer's own live edits stay as-typed, overlaid by the card.
   */
  const stagedWorld = useMemo(
    () =>
      buildStagedConversionWorld({
        latestDataTypes,
        drafts: [...stagedDrafts.byUrl.values()],
      }),
    [latestDataTypes, stagedDrafts],
  );

  /**
   * The types whose conversions a group's card shows: the concrete members of
   * every group in the edited group's connected family — ancestors, siblings
   * and cousins through abstract inheritance — descending through nested
   * groups, saved and staged alike, to the types whose values actually
   * convert. Drafts' conversions are placed when the save creates them.
   */
  const groupConversionChildren = useMemo<BaseUrl[]>(() => {
    if (!groupConversionsApplicable) {
      return [];
    }
    const result: BaseUrl[] = [];
    const seen = new Set<BaseUrl>();
    const queue = allowedTypes
      .filter((entry): entry is ReferenceEntry => entry.relation === "child")
      .map((entry) => entry.dataTypeId);

    // A saved group seeds its whole super group: the connected component of
    // abstract types joined by extension, grown to a fixed point so cousins
    // reached only through shared descendants join too
    if (editedDataType?.schema.abstract === true) {
      const editedBase = editedDataType.metadata.recordId.baseUrl;
      const abstractTypes = Object.values(latestDataTypes).filter(
        (dataType) => dataType.schema.abstract === true,
      );
      const inComponent = new Set<BaseUrl>([editedBase]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const dataType of abstractTypes) {
          const base = dataType.metadata.recordId.baseUrl;
          for (const { $ref } of dataType.schema.allOf ?? []) {
            const parentBase = extractBaseUrl($ref);
            if (
              parentBase !== editedBase &&
              latestDataTypes[parentBase]?.schema.abstract !== true
            ) {
              continue;
            }
            if (inComponent.has(base) !== inComponent.has(parentBase)) {
              inComponent.add(base);
              inComponent.add(parentBase);
              grew = true;
            }
          }
        }
      }
      for (const componentBase of inComponent) {
        const member = latestDataTypes[componentBase];
        if (member) {
          queue.push(member.schema.$id);
        }
      }
    }

    const visitDraft = (draft: StagedDataTypeDraft) => {
      if (seen.has(draft.baseUrl)) {
        return;
      }
      seen.add(draft.baseUrl);
      if (draft.dataType.abstract === true) {
        // A staged group: its members — existing and nested drafts — carry
        // the convertible values
        for (const memberId of draft.memberDataTypeIds ?? []) {
          queue.push(memberId);
        }
        for (const nested of draft.memberDrafts ?? []) {
          visitDraft(nested);
        }
      } else if (
        !("anyOf" in draft.dataType) &&
        draft.dataType.type === "number"
      ) {
        result.push(draft.baseUrl);
      }
    };

    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      if (!id) {
        continue;
      }
      const baseUrl = extractBaseUrl(id);
      if (seen.has(baseUrl)) {
        continue;
      }
      const draft = stagedDrafts.byUrl.get(id);
      if (draft) {
        visitDraft(draft);
        continue;
      }
      seen.add(baseUrl);
      const dataType = latestDataTypes[baseUrl];
      if (!dataType) {
        continue;
      }
      if (dataType.schema.abstract === true) {
        for (const other of Object.values(latestDataTypes)) {
          if (
            other.schema.allOf?.some(
              ({ $ref }) => extractBaseUrl($ref) === baseUrl,
            )
          ) {
            queue.push(other.schema.$id);
          }
        }
      } else if (
        !("anyOf" in dataType.schema) &&
        dataType.schema.type === "number" &&
        // Conversion edits republish the member — reviving an archived one
        isLiveDataType(dataType)
      ) {
        result.push(baseUrl);
      }
    }
    return result;
  }, [
    groupConversionsApplicable,
    allowedTypes,
    stagedDrafts,
    latestDataTypes,
    editedDataType,
  ]);

  /**
   * The members' saved conversion rows, following the staged membership —
   * plus the rows draft members carry, created along with them on save
   */
  const baseGroupConversionRows = useMemo(() => {
    if (!groupConversionsApplicable) {
      return [];
    }

    const stored = groupConversionRowStates({
      childBaseUrls: groupConversionChildren.filter(
        (childBaseUrl) => !draftsByBaseUrl.has(childBaseUrl),
      ),
      latestDataTypes,
    });

    const draftRows = groupConversionChildren.flatMap(
      (childBaseUrl): GroupConversionRowState[] => {
        const draft = draftsByBaseUrl.get(childBaseUrl);
        const typedRows = draft?.conversionRows ?? [];
        if (!draft || typedRows.length === 0) {
          return [];
        }

        const asTyped = typedRows.map((row): GroupConversionRowState => ({
          key: `draft:${draft.versionedUrl}:${row.targetBaseUrl}`,
          childBaseUrl,
          targetBaseUrl: row.targetBaseUrl,
          operator: row.operator,
          value: row.value,
          storedOnBaseUrl: childBaseUrl,
          viaCanonical: false,
          formula: false,
        }));

        // Outside the drawer that defined them, staged rows display the way
        // the save will place them — a row aimed at a grouped type is stored
        // against that family's canonical, with the step composed through it.
        // Rows the plan leaves as typed stay editable here; transformed ones
        // are read-only, edited from the member's own drawer.
        const plan = planConversionUpdates({
          viewedBaseUrl: draft.baseUrl,
          desiredRows: typedRows.map((row) => ({
            targetBaseUrl: row.targetBaseUrl,
            simple: { operator: row.operator, operand: row.value },
          })),
          initialRows: [],
          latestDataTypes: stagedWorld,
          canWriteTo: () => true,
        });
        const plannedEntries = Object.entries(
          plan.updates.find((update) => update.baseUrl === draft.baseUrl)
            ?.conversions ?? {},
        );
        if (plan.unplacedTargets.length > 0 || plannedEntries.length === 0) {
          return asTyped;
        }

        const typedByTarget = new Map(
          typedRows.map((row) => [row.targetBaseUrl, row]),
        );
        const placementMatchesTyped = plannedEntries.every(
          ([targetBaseUrl, conversions]) => {
            const typed = typedByTarget.get(targetBaseUrl as BaseUrl);
            const simple = parseSimpleConversion(conversions);
            return (
              typed !== undefined &&
              simple !== null &&
              simple.operator === typed.operator &&
              simple.operand === typed.value
            );
          },
        );
        if (
          placementMatchesTyped &&
          plannedEntries.length === typedRows.length
        ) {
          return asTyped;
        }

        return plannedEntries.map(([targetBaseUrl, conversions]) => {
          const simple = parseSimpleConversion(conversions);
          return {
            key: `draft-planned:${draft.versionedUrl}:${targetBaseUrl}`,
            childBaseUrl,
            targetBaseUrl: targetBaseUrl as BaseUrl,
            operator: simple?.operator ?? "*",
            value: simple?.operand ?? null,
            storedOnBaseUrl: childBaseUrl,
            viaCanonical: true,
            formula: simple === null,
          };
        });
      },
    );

    // Ordered once per load — rows added during the session append below
    return [...stored, ...draftRows].sort(compareConversionSteps);
  }, [
    groupConversionsApplicable,
    groupConversionChildren,
    draftsByBaseUrl,
    latestDataTypes,
    stagedWorld,
  ]);

  const groupConversionRows = useMemo(() => {
    const merged: GroupConversionRowState[] = [];
    for (const row of baseGroupConversionRows) {
      const override = groupRowOverrides.get(row.key);
      if (override === "removed") {
        continue;
      }
      merged.push(
        override === undefined
          ? row
          : { ...row, operator: override.operator, value: override.value },
      );
    }
    return [...merged, ...newGroupConversionRows];
  }, [baseGroupConversionRows, groupRowOverrides, newGroupConversionRows]);

  /**
   * The field edits a flat row list; this re-derives the edit state from it —
   * step changes and removals keyed against the saved rows, additions kept
   * whole — so the saved rows can keep following membership changes
   */
  const handleGroupConversionRowsChange = (next: GroupConversionRowState[]) => {
    const nextByKey = new Map(next.map((row) => [row.key, row]));
    setGroupRowOverrides(() => {
      const overrides = new Map<string, SimpleConversionEdit | "removed">();
      for (const base of baseGroupConversionRows) {
        const staged = nextByKey.get(base.key);
        if (!staged) {
          overrides.set(base.key, "removed");
        } else if (
          staged.operator !== base.operator ||
          staged.value !== base.value
        ) {
          overrides.set(base.key, {
            operator: staged.operator,
            value: staged.value,
          });
        }
      }
      return overrides;
    });
    setNewGroupConversionRows(next.filter((row) => row.key.startsWith("new-")));
    onRowsEdited();
  };

  /** Staged world + live card edits, grouped — cached per render pass */
  const sectionGroupsCache: {
    value: ReturnType<typeof buildConversionGroups> | null;
  } = { value: null };
  const sectionGroups = () => {
    if (sectionGroupsCache.value) {
      return sectionGroupsCache.value;
    }
    const world = { ...stagedWorld };
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- invoked at render time, after the plan function below is defined
    for (const update of planGroupConversionUpdates().updates) {
      const current = world[update.baseUrl];
      if (current) {
        world[update.baseUrl] = {
          ...current,
          metadata: { ...current.metadata, conversions: update.conversions },
        };
      }
    }
    sectionGroupsCache.value = buildConversionGroups(world);
    return sectionGroupsCache.value;
  };

  /**
   * The conversion family a row sits in, keying its display section — from
   * the staged world with this drawer's live edits applied, so an
   * uncommitted pairing that joins or merges families previews the sections
   * the save will leave. Resolved lazily: the live plan is defined below.
   */
  const conversionSectionKeyFor = (
    row: GroupConversionRowState,
  ): BaseUrl | null => {
    const groups = sectionGroups();
    if (row.childBaseUrl) {
      const family = groups.get(row.childBaseUrl);
      if (family) {
        return family.canonicalBaseUrl;
      }
    }
    if (row.targetBaseUrl) {
      const family = groups.get(row.targetBaseUrl);
      return family?.canonicalBaseUrl ?? row.targetBaseUrl;
    }
    return null;
  };

  /**
   * Eligible targets for one group member's new pairing — the single-type
   * gate run with that member as the viewer, family-sorted from the member's
   * own ancestry. Cached per member for the render pass.
   */
  const groupTargetOptionsFor = useMemo(() => {
    const cache = new Map<
      BaseUrl,
      Array<{ baseUrl: BaseUrl; title: string; disabled: boolean }>
    >();

    return (childBaseUrl: BaseUrl) => {
      const cached = cache.get(childBaseUrl);
      if (cached) {
        return cached;
      }

      const resolveSchema = (id: VersionedUrl) => resolveDataType(id)?.schema;
      // The member is the viewer, so its own slot is writable — for a draft
      // the creation itself writes it, mirroring the save-time plan
      const canWriteTo = (writeBaseUrl: BaseUrl) =>
        writeBaseUrl === childBaseUrl || canEditByBaseUrl(writeBaseUrl);

      const childRows = groupConversionRows.filter(
        (row) => row.childBaseUrl === childBaseUrl,
      );
      const stagedDesired = childRows.flatMap((row) =>
        !row.viaCanonical &&
        !row.formula &&
        row.targetBaseUrl !== null &&
        row.value !== null
          ? [
              {
                targetBaseUrl: row.targetBaseUrl,
                simple: { operator: row.operator, operand: row.value },
              },
            ]
          : [],
      );
      const stagedInitial: ConversionRow[] = baseGroupConversionRows.flatMap(
        (row) =>
          row.childBaseUrl === childBaseUrl &&
          !row.viaCanonical &&
          row.targetBaseUrl !== null &&
          row.value !== null
            ? [
                {
                  targetBaseUrl: row.targetBaseUrl,
                  factor: simpleEffectiveFactor({
                    operator: row.operator,
                    operand: row.value,
                  }),
                  simple: { operator: row.operator, operand: row.value },
                  storedOnBaseUrl: row.storedOnBaseUrl,
                  viaCanonical: false,
                },
              ]
            : [],
      );
      const placeable = (targetBaseUrl: BaseUrl) =>
        !planConversionUpdates({
          viewedBaseUrl: childBaseUrl,
          desiredRows: [...stagedDesired, { targetBaseUrl, factor: 1 }],
          initialRows: stagedInitial,
          latestDataTypes,
          canWriteTo,
        }).unplacedTargets.includes(targetBaseUrl);

      // A draft member's ancestry comes from its staged definition
      const childSchema =
        draftsByBaseUrl.get(childBaseUrl)?.dataType ??
        latestDataTypes[childBaseUrl]?.schema;
      const ancestorDepths = ancestorDepthMap({
        selfBaseUrl: childBaseUrl,
        parentIds: childSchema?.allOf?.map(({ $ref }) => $ref) ?? [],
        resolveSchema,
      });

      // Fellow members — staged drafts included — rank first: the group is
      // their closest shared parent. A pairing involving a draft travels
      // with that draft's creation.
      const coMembers = new Set(groupConversionChildren);

      // Targets are limited to fellow members of the member's parent groups —
      // this group's own members enter through the co-member set, since a
      // staged group is not in anyone's ancestry yet
      const memberParentGroups = groupAncestorsOf({
        ancestorDepths,
        resolveLatestSchema: (groupBaseUrl) =>
          latestDataTypes[groupBaseUrl]?.schema,
      });

      const draftOptions = groupConversionChildren.flatMap((memberBaseUrl) => {
        const draft = draftsByBaseUrl.get(memberBaseUrl);
        return draft && memberBaseUrl !== childBaseUrl
          ? [
              {
                baseUrl: memberBaseUrl,
                title: draft.dataType.title,
                disabled: false,
                familyDepth: coMemberRank,
              },
            ]
          : [];
      });

      const options = [
        ...Object.values(latestDataTypes)
          .filter(
            (dataType) =>
              isLiveDataType(dataType) &&
              !("anyOf" in dataType.schema) &&
              dataType.schema.type === "number" &&
              dataType.schema.abstract !== true &&
              dataType.metadata.recordId.baseUrl !== childBaseUrl &&
              dataType.metadata.recordId.baseUrl !==
                blockProtocolDataTypes.number.dataTypeBaseUrl &&
              (coMembers.has(dataType.metadata.recordId.baseUrl) ||
                belongsToAnyGroup({
                  dataTypeId: dataType.schema.$id,
                  groupBaseUrls: memberParentGroups,
                  resolveSchema,
                })),
          )
          .map((dataType) => {
            const targetBaseUrl = dataType.metadata.recordId.baseUrl;
            const familyDepth = familyDepthFrom({
              dataTypeId: dataType.schema.$id,
              ancestorDepths,
              resolveSchema,
            });
            return {
              baseUrl: targetBaseUrl,
              title: dataType.schema.title,
              disabled: !placeable(targetBaseUrl),
              familyDepth: coMembers.has(targetBaseUrl)
                ? Math.min(familyDepth, coMemberRank)
                : familyDepth,
            };
          }),
        ...draftOptions,
      ]
        .sort(
          (a, b) =>
            a.familyDepth - b.familyDepth || a.title.localeCompare(b.title),
        )
        .map(({ familyDepth: _familyDepth, ...option }) => option);

      cache.set(childBaseUrl, options);
      return options;
    };
  }, [
    groupConversionRows,
    baseGroupConversionRows,
    groupConversionChildren,
    draftsByBaseUrl,
    latestDataTypes,
    resolveDataType,
    canEditByBaseUrl,
  ]);

  /**
   * Plans every touched member's conversion edits independently — the member
   * is the viewer each time — and merges the writes. Two members' plans
   * disagreeing about one type can't both apply; those surface as conflicts.
   */
  const planGroupConversionUpdates = (): {
    updates: Array<{
      baseUrl: BaseUrl;
      conversions: Record<BaseUrl, Conversions>;
    }>;
    unplacedTargets: BaseUrl[];
    conflictBaseUrls: BaseUrl[];
  } => {
    if (!groupConversionsApplicable) {
      return { updates: [], unplacedTargets: [], conflictBaseUrls: [] };
    }

    const canWriteTo = (baseUrl: BaseUrl) => canEditByBaseUrl(baseUrl);
    const merged = new Map<BaseUrl, Record<BaseUrl, Conversions>>();
    const unplacedTargets: BaseUrl[] = [];
    const conflictBaseUrls: BaseUrl[] = [];

    for (const childBaseUrl of groupConversionChildren) {
      // A draft member's rows are placed when its creation plans them; an
      // existing member owned by a draft group rides that draft's creation,
      // merged into its membership republish
      if (
        draftsByBaseUrl.has(childBaseUrl) ||
        draftOwnedMemberBases.has(childBaseUrl)
      ) {
        continue;
      }

      const baseRows = baseGroupConversionRows.filter(
        (row) => row.childBaseUrl === childBaseUrl,
      );
      const touched =
        baseRows.some((row) => groupRowOverrides.has(row.key)) ||
        newGroupConversionRows.some((row) => row.childBaseUrl === childBaseUrl);
      if (!touched) {
        continue;
      }

      const initialRows: ConversionRow[] = baseRows.flatMap((row) =>
        !row.viaCanonical && row.targetBaseUrl !== null && row.value !== null
          ? [
              {
                targetBaseUrl: row.targetBaseUrl,
                factor: simpleEffectiveFactor({
                  operator: row.operator,
                  operand: row.value,
                }),
                simple: { operator: row.operator, operand: row.value },
                storedOnBaseUrl: row.storedOnBaseUrl,
                viaCanonical: false,
              },
            ]
          : [],
      );
      const desiredRows = groupConversionRows.flatMap((row) =>
        row.childBaseUrl === childBaseUrl &&
        !row.viaCanonical &&
        !row.formula &&
        row.targetBaseUrl !== null &&
        // A row aimed at a draft rides the draft's own creation instead —
        // nothing exists yet for this member's entry to reference
        !draftsByBaseUrl.has(row.targetBaseUrl) &&
        row.value !== null
          ? [
              {
                targetBaseUrl: row.targetBaseUrl,
                simple: { operator: row.operator, operand: row.value },
              },
            ]
          : [],
      );

      const plan = planConversionUpdates({
        viewedBaseUrl: childBaseUrl,
        desiredRows,
        initialRows,
        latestDataTypes,
        canWriteTo,
      });
      unplacedTargets.push(...plan.unplacedTargets);
      for (const update of plan.updates) {
        const existing = merged.get(update.baseUrl);
        if (
          existing &&
          JSON.stringify(existing) !== JSON.stringify(update.conversions)
        ) {
          conflictBaseUrls.push(update.baseUrl);
          continue;
        }
        merged.set(update.baseUrl, update.conversions);
      }
    }

    return {
      updates: [...merged.entries()].map(([baseUrl, conversions]) => ({
        baseUrl,
        conversions,
      })),
      unplacedTargets,
      conflictBaseUrls,
    };
  };

  return {
    groupRowOverrides,
    newGroupConversionRows,
    setNewGroupConversionRows,
    groupConversionChildren,
    baseGroupConversionRows,
    groupConversionRows,
    handleGroupConversionRowsChange,
    conversionSectionKeyFor,
    groupTargetOptionsFor,
    planGroupConversionUpdates,
  };
};
