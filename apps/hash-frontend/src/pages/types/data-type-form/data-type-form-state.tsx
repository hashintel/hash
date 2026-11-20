import { useLazyQuery, useMutation } from "@apollo/client";
import { isEqual } from "lodash";
import { useRouter } from "next/router";
import { useCallback, useContext, useMemo, useRef, useState } from "react";

import {
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
  DATA_TYPE_META_SCHEMA,
  extractBaseUrl,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createDataTypeMutation,
  queryDataTypesQuery,
  updateDataTypeMutation,
} from "../../../graphql/queries/ontology/data-type.queries";
import { useAuthInfo } from "../../shared/auth-info-context";
import { useDataTypesContext } from "../../shared/data-types-context";
import { useSlideStack } from "../../shared/slide-stack/context";
import { useGenerateTypeUrlsForUser } from "../../shared/use-generate-type-urls-for-user";
import { WorkspaceContext } from "../../shared/workspace-context";
import {
  activeConstraintKinds,
  collectDescendantTypeTitles,
  constraintValuesFromSchema,
  countBoundsConflict,
  deriveInheritedConstraints,
  emptyInheritedConstraints,
  numericBoundsConflict,
  primitiveArmOfUnion,
  satisfiesInherited,
  schemaConstraintsFromValues,
  sharedParentPrimitive,
  summarizeTypeTitles,
  visibleConstraintKinds,
} from "./constraint-util";
import {
  buildConversionGroups,
  compareConversionSteps,
  conversionRowStatesFromRows,
  conversionRowsForViewer,
  inverseOperator,
  planConversionUpdates,
  severedConversionPairings,
} from "./conversion-util";
import { buildOwnConstraints } from "./data-type-form-state/build-own-constraints";
import { lowestCommonAncestorRef } from "./data-type-form-state/group-root";
import {
  collectDraftUrls,
  orderDraftsByConversionDependencies,
} from "./data-type-form-state/staged-drafts";
import {
  ancestorDepthMap,
  belongsToAnyGroup,
  coMemberRank,
  familyDepthFrom,
  groupAncestorsOf,
} from "./data-type-form-state/type-family";
import { useDataTypeEditPermissions } from "./data-type-form-state/use-data-type-edit-permissions";
import { useGroupConversions } from "./data-type-form-state/use-group-conversions";
import { usePluralSuggestion } from "./data-type-form-state/use-plural-suggestion";
import {
  arraySchemaFromListConfig,
  listConfigFromArraySchema,
  listDataTypeBaseUrl,
  listDataTypeId,
} from "./list-util";
import { isLiveDataType } from "./live-data-types";
import {
  primitiveRootRefFor,
  primitiveRootTypeByBaseUrl,
  primitiveRootTypes,
  primitiveTypeFromSchema,
} from "./primitive-root-types";

import type {
  CreateDataTypeMutation,
  CreateDataTypeMutationVariables,
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
  UpdateDataTypeMutation,
  UpdateDataTypeMutationVariables,
} from "../../../graphql/api-types.gen";
import type { ConstraintsState } from "./cards/constraints";
import type {
  ConstraintPrimitive,
  InheritedConstraints,
} from "./constraint-util";
import type {
  ConversionOperator,
  ConversionRow,
  ConversionRowState,
} from "./conversion-util";
import type {
  AllowedTypeEntry,
  AllowedTypeRelation,
  SelectDataTypeInputHandle,
} from "./select-data-type-input";
import type { DataTypeTreeNode } from "./select-data-type-input/data-type-tree";
import type {
  BaseUrl,
  Conversions,
  DataType,
  DataTypeWithMetadata,
  SingleValueConstraints,
  SingleValueSchema,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ConstructDataTypeParams } from "@local/hash-graph-sdk/ontology";

export type { StagedDataTypeDraft } from "./data-type-form-state/staged-drafts";
export { collectDraftUrls } from "./data-type-form-state/staged-drafts";

import type { StagedDataTypeDraft } from "./data-type-form-state/staged-drafts";

type FormErrors = {
  title?: string;
  description?: string;
  allowedTypes?: string;
  groupMembers?: string;
  constraints?: string;
  conversions?: string;
  submit?: string;
};

type ReferenceEntry = Extract<AllowedTypeEntry, { dataTypeId: VersionedUrl }>;
type ListEntry = Extract<AllowedTypeEntry, { relation: "list" }>;

/** The `relation: "list"` entries a schema's array arms translate to */
const listEntriesFromSchema = (schema: DataType): ListEntry[] => {
  if ("anyOf" in schema) {
    return schema.anyOf.flatMap((arm) =>
      arm.type === "array"
        ? [
            {
              relation: "list" as const,
              config: listConfigFromArraySchema(arm),
            },
          ]
        : [],
    );
  }
  return schema.type === "array"
    ? [{ relation: "list", config: listConfigFromArraySchema(schema) }]
    : [];
};

export type DataTypeFormStateProps = {
  onClose: () => void;
  /** `null` when creating a new data type */
  editedDataType: DataTypeWithMetadata | null;
  initialTitle?: string;
  initialExtendsDataTypeId?: VersionedUrl;
  /** A previously staged draft reopened for editing, seeding the form */
  initialDraft?: StagedDataTypeDraft;
  /** Limits extends picks to this primitive's root and its descendants */
  restrictParentPrimitive?: ConstraintPrimitive;
  /** The group this member joins, pinned uneditable in its Extends card */
  parentGroupTitle?: string;
  /** Other members staged alongside, offered as conversion targets */
  siblingDrafts?: StagedDataTypeDraft[];
  /** The group's existing members, ranked first among conversion targets */
  coMemberBaseUrls?: BaseUrl[];
  onSaved: (dataType: DataTypeWithMetadata) => void;
  /** Submit hands the assembled definition here instead of creating it */
  stageDraft?: (draft: StagedDataTypeDraft) => void;
  /** Versioned URLs treated as taken alongside the graph's own */
  unavailableTypeUrls?: ReadonlySet<VersionedUrl>;
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  readonly?: boolean;
};

export const useDataTypeFormState = ({
  onClose,
  editedDataType: liveEditedDataType,
  initialTitle,
  initialExtendsDataTypeId,
  initialDraft,
  restrictParentPrimitive,
  siblingDrafts,
  coMemberBaseUrls,
  onSaved,
  stageDraft,
  unavailableTypeUrls,
  dataTypes: liveDataTypes,
  latestDataTypes: liveLatestDataTypes,
  readonly: liveReadonly,
}: DataTypeFormStateProps) => {
  const router = useRouter();

  // Nullable: the form renders read-only on public pages for signed-out
  // visitors, who have no authenticated user to read
  const { authenticatedUser } = useAuthInfo();
  const { activeWorkspaceWebId } = useContext(WorkspaceContext);
  const generateTypeUrlsForUser = useGenerateTypeUrlsForUser();
  const {
    refetch: refetchAllDataTypes,
    loading: dataTypesLoading,
    error: dataTypesError,
    onDataTypeSaved,
  } = useDataTypesContext();

  const [submitting, setSubmitting] = useState(false);

  /**
   * The world the drawer renders against, pinned while a save is in flight:
   * the submit's own context refetch (and, in stacked hosts, the resolved
   * type and permissions flipping to the new version) would otherwise cycle
   * this still-open drawer through half-applied states for a few frames
   * before the host remounts it on the saved version.
   */
  const frozenWorldRef = useRef({
    editedDataType: liveEditedDataType,
    dataTypes: liveDataTypes,
    latestDataTypes: liveLatestDataTypes,
    readonly: liveReadonly,
  });
  if (!submitting) {
    frozenWorldRef.current = {
      editedDataType: liveEditedDataType,
      dataTypes: liveDataTypes,
      latestDataTypes: liveLatestDataTypes,
      readonly: liveReadonly,
    };
  }
  const { editedDataType, dataTypes, latestDataTypes, readonly } =
    frozenWorldRef.current;

  /** The pinned world, re-provided so the drawer's fields read it too */
  const scopedDataTypesContext = useMemo(
    () => ({
      dataTypes,
      latestDataTypes,
      loading: dataTypesLoading,
      error: dataTypesError,
      refetch: refetchAllDataTypes,
      onDataTypeSaved,
    }),
    [
      dataTypes,
      latestDataTypes,
      dataTypesLoading,
      dataTypesError,
      refetchAllDataTypes,
      onDataTypeSaved,
    ],
  );

  const { slideStackDepth, dataTypeDrawerDepth } = useSlideStack();
  /** The stack depth this drawer opened over — deeper means a slide is above */
  const mountSlideStackDepthRef = useRef(slideStackDepth);
  /** Likewise for stacked type drawers, which stack outside the slide items */
  const mountDataTypeDrawerDepthRef = useRef(dataTypeDrawerDepth);

  const [queryDataTypes] = useLazyQuery<
    QueryDataTypesQuery,
    QueryDataTypesQueryVariables
  >(queryDataTypesQuery, {
    // A validation check: a cached empty result must not mask a type created
    // since the cache was filled
    fetchPolicy: "network-only",
  });

  // errorPolicy "all" resolves rather than throws on GraphQL errors, so the
  // save paths' `response.errors` checks can name the type that failed —
  // multi-type saves (group membership, conversions) touch several
  const [createDataType] = useMutation<
    CreateDataTypeMutation,
    CreateDataTypeMutationVariables
  >(createDataTypeMutation, { errorPolicy: "all" });

  const [updateDataType] = useMutation<
    UpdateDataTypeMutation,
    UpdateDataTypeMutationVariables
  >(updateDataTypeMutation, { errorPolicy: "all" });

  // A reopened staged draft re-enters the editor in the schema shape the
  // edit path parses — only the fields the form reads need to be real
  const initialDraftSchema = initialDraft
    ? ({
        $schema: DATA_TYPE_META_SCHEMA,
        kind: "dataType",
        $id: initialDraft.versionedUrl,
        ...initialDraft.dataType,
      } as DataType)
    : null;

  const [initialEntries, setInitialEntries] = useState<AllowedTypeEntry[]>(
    () => {
      if (!editedDataType) {
        if (initialDraftSchema) {
          const draftMembers = [
            ...(initialDraft?.memberDataTypeIds ?? []),
            ...(initialDraft?.memberDrafts ?? []).map(
              (member) => member.versionedUrl,
            ),
          ].map((dataTypeId): AllowedTypeEntry => ({
            dataTypeId,
            relation: "child",
          }));

          // A draft with members is a group: its stored parent is the
          // synthesized root, re-derived from the members on save. A bare
          // array arm is the members' shared primitive, not an authored list
          // — a group can't include list types, so none is parsed back.
          if (draftMembers.length > 0) {
            return [{ relation: "group" }, ...draftMembers];
          }

          return [
            ...(initialDraftSchema.allOf ?? [])
              .filter(
                ({ $ref }) => extractBaseUrl($ref) !== listDataTypeBaseUrl,
              )
              .map(({ $ref }): AllowedTypeEntry => ({
                dataTypeId: $ref,
                relation: "parent",
              })),
            ...listEntriesFromSchema(initialDraftSchema),
          ];
        }

        return initialExtendsDataTypeId
          ? [{ dataTypeId: initialExtendsDataTypeId, relation: "parent" }]
          : [];
      }

      const editedBaseUrl = editedDataType.metadata.recordId.baseUrl;
      const editedSchema = editedDataType.schema;

      // A ref to List is managed via the list entries below, not shown as a parent
      const parents = (editedSchema.allOf ?? [])
        .filter(({ $ref }) => extractBaseUrl($ref) !== listDataTypeBaseUrl)
        .map(({ $ref }): AllowedTypeEntry => ({
          dataTypeId: $ref,
          relation: "parent",
        }));

      const listEntries = listEntriesFromSchema(editedSchema);

      const children = Object.values(latestDataTypes)
        .filter(
          (dataType) =>
            // Membership edits republish children — reviving archived ones
            isLiveDataType(dataType) &&
            dataType.metadata.recordId.baseUrl !== editedBaseUrl &&
            dataType.schema.allOf?.some(
              ({ $ref }) => extractBaseUrl($ref) === editedBaseUrl,
            ),
        )
        .sort((a, b) => a.schema.title.localeCompare(b.schema.title))
        .map((dataType): AllowedTypeEntry => ({
          dataTypeId: dataType.schema.$id,
          relation: "child",
        }));

      // A group's synthesized parent — its members' lowest common ancestor —
      // is plumbing: the graph requires every type to extend something, so the
      // editor shows a Group entry and the members instead, and the save path
      // re-synthesizes the root ref. A single parent on an abstract type with
      // members is that synthesized root; a sub-group additionally keeps its
      // parent group's ref, re-derived through the members' lowest common
      // ancestor on save. Several concrete parents (API-authored) stay visible.
      const isGroup =
        editedSchema.abstract === true &&
        children.length > 0 &&
        (parents.length <= 1 ||
          parents.every(
            (entry) =>
              entry.relation !== "parent" ||
              primitiveRootTypeByBaseUrl.has(
                extractBaseUrl(entry.dataTypeId),
              ) ||
              latestDataTypes[extractBaseUrl(entry.dataTypeId)]?.schema
                .abstract === true,
          ));

      return [
        ...(isGroup
          ? [
              { relation: "group" } satisfies AllowedTypeEntry,
              // A sub-group's own memberships stay editable entries — only
              // the synthesized root (a primitive or concrete ancestor) is
              // plumbing, re-derived on save
              ...parents.filter(
                (entry) =>
                  "dataTypeId" in entry &&
                  latestDataTypes[extractBaseUrl(entry.dataTypeId)]?.schema
                    .abstract === true,
              ),
            ]
          : parents),
        // An array-membered group is stored with a bare `type: "array"` arm —
        // that is the members' shared primitive, not an authored list, and a
        // group can't include list types, so none is parsed back
        ...(isGroup ? [] : listEntries),
        ...children,
      ];
    },
  );

  const [initialConstraintState] = useState<ConstraintsState>(() => {
    const schema = editedDataType?.schema ?? initialDraftSchema;

    // Array schemas are managed through list entries, not the card; a
    // union's single non-array arm still carries card-managed constraints
    const armSchema = !schema
      ? null
      : "anyOf" in schema
        ? primitiveArmOfUnion(schema.anyOf)
        : schema.type === "array"
          ? null
          : schema;

    if (!armSchema) {
      return { activeKinds: [], values: {} };
    }

    const values = constraintValuesFromSchema(armSchema);
    return { activeKinds: activeConstraintKinds(values), values };
  });
  const [constraintState, setConstraintState] = useState<ConstraintsState>(
    initialConstraintState,
  );

  const conversionGroups = useMemo(
    () => buildConversionGroups(latestDataTypes),
    [latestDataTypes],
  );

  const [initialConversionRows] = useState<ConversionRow[]>(() => {
    if (!editedDataType) {
      return [];
    }
    const group = buildConversionGroups(latestDataTypes).get(
      editedDataType.metadata.recordId.baseUrl,
    );
    return group
      ? conversionRowsForViewer({
          viewedBaseUrl: editedDataType.metadata.recordId.baseUrl,
          group,
        })
      : [];
  });
  const [conversionRows, setConversionRows] = useState<ConversionRowState[]>(
    () =>
      [
        ...conversionRowStatesFromRows(initialConversionRows),
        // A reopened draft brings its authored conversions back as new rows —
        // nothing is stored for them yet
        ...(initialDraft?.conversionRows ?? []).map(
          (row): ConversionRowState => ({
            key: row.targetBaseUrl,
            targetBaseUrl: row.targetBaseUrl,
            operator: row.operator,
            value: row.value,
            storedOnBaseUrl: null,
            viaCanonical: false,
            formula: false,
          }),
        ),
        // Pairings sibling drafts staged against this one, shown the way the
        // save will surface them here: reversed, riding the sibling. They are
        // edited from the drawer that defined them, so here they display
        // read-only (the composed form) and never stage back onto this draft.
        ...(initialDraft
          ? (siblingDrafts ?? []).flatMap((sibling) =>
              (sibling.conversionRows ?? [])
                .filter((row) => row.targetBaseUrl === initialDraft.baseUrl)
                .map((row): ConversionRowState => ({
                  key: `sibling:${sibling.baseUrl}`,
                  targetBaseUrl: sibling.baseUrl,
                  operator: inverseOperator[row.operator],
                  value: row.value,
                  storedOnBaseUrl: sibling.baseUrl,
                  viaCanonical: true,
                  formula: false,
                })),
            )
          : []),
        // Ordered once, at open — rows added during the session append below
      ].sort(compareConversionSteps),
  );

  const [title, setTitle] = useState(
    editedDataType?.schema.title ??
      initialDraftSchema?.title ??
      initialTitle ??
      "",
  );
  const [titlePlural, setTitlePlural] = useState(
    editedDataType?.schema.titlePlural ?? initialDraftSchema?.titlePlural ?? "",
  );
  const [labelLeft, setLabelLeft] = useState(
    editedDataType?.schema.label?.left ?? initialDraftSchema?.label?.left ?? "",
  );
  const [labelRight, setLabelRight] = useState(
    editedDataType?.schema.label?.right ??
      initialDraftSchema?.label?.right ??
      "",
  );
  const [description, setDescription] = useState(
    editedDataType?.schema.description ?? initialDraftSchema?.description ?? "",
  );
  const [allowedTypes, setAllowedTypes] =
    useState<AllowedTypeEntry[]>(initialEntries);
  const [errors, setErrors] = useState<FormErrors>({});

  const {
    generationAvailable,
    pluralRequestMade,
    pluralLoading,
    suggestTitlePlural,
  } = usePluralSuggestion({
    skip: !!editedDataType || !!readonly,
    setTitlePlural,
  });

  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const typeFieldHandle = useRef<SelectDataTypeInputHandle>(null);
  const groupMembersFieldHandle = useRef<SelectDataTypeInputHandle>(null);

  /**
   * The form as first rendered, for detecting whether anything was edited.
   * The type entries are compared against `initialEntries` instead, which
   * also absorbs extensions created from this drawer — already saved, so not
   * edits of this type.
   */
  const [initialFormState] = useState(() => ({
    title,
    titlePlural,
    description,
    labelLeft,
    labelRight,
    constraintState,
    conversionRows,
  }));

  /**
   * Members authored in the stacked create drawer: definitions held locally
   * and created only when this drawer saves — closing without saving
   * discards them, so nothing reaches the graph for an abandoned edit
   */
  const [stagedMemberDrafts, setStagedMemberDrafts] = useState<
    StagedDataTypeDraft[]
  >(
    // A reopened group draft brings its nested drafts back for re-editing
    () => initialDraft?.memberDrafts ?? [],
  );
  const [memberDraftDrawerOpen, setMemberDraftDrawerOpen] = useState(false);
  /** The draft the member drawer reopened for editing, replaced on re-stage */
  const [editingDraftUrl, setEditingDraftUrl] = useState<VersionedUrl | null>(
    null,
  );

  /** The drafts in the shapes the drawer's resolvers and the field display take */
  const stagedDrafts = useMemo(() => {
    const byUrl = new Map<VersionedUrl, StagedDataTypeDraft>();
    const asDataTypes = new Map<VersionedUrl, DataTypeWithMetadata>();
    const asNodes = new Map<VersionedUrl, DataTypeTreeNode>();

    for (const draft of stagedMemberDrafts) {
      const version = componentsFromVersionedUrl(draft.versionedUrl).version;

      byUrl.set(draft.versionedUrl, draft);

      // Only the fields the drawer reads are real; the metadata the graph
      // would add (provenance, temporal versioning) doesn't exist yet
      asDataTypes.set(draft.versionedUrl, {
        schema: {
          $schema: DATA_TYPE_META_SCHEMA,
          kind: "dataType",
          $id: draft.versionedUrl,
          ...draft.dataType,
        },
        metadata: {
          recordId: { baseUrl: draft.baseUrl, version },
          webId: activeWorkspaceWebId,
        },
      } as unknown as DataTypeWithMetadata);

      asNodes.set(draft.versionedUrl, {
        $id: draft.versionedUrl,
        abstract: draft.dataType.abstract === true,
        baseUrl: draft.baseUrl,
        children: [],
        description: draft.dataType.description,
        directParents: draft.dataType.allOf?.map(({ $ref }) => $ref) ?? [],
        label: draft.dataType.label ?? {},
        title: draft.dataType.title,
        type:
          "anyOf" in draft.dataType
            ? draft.dataType.anyOf[0].type
            : draft.dataType.type,
        version,
      });
    }

    return { byUrl, asDataTypes, asNodes };
  }, [stagedMemberDrafts, activeWorkspaceWebId]);

  /**
   * Staged drafts keyed by the base URL their creation will claim — nested
   * group drafts' members included, at any depth
   */
  const draftsByBaseUrl = useMemo(() => {
    const map = new Map<BaseUrl, StagedDataTypeDraft>();
    const collect = (draft: StagedDataTypeDraft) => {
      map.set(draft.baseUrl, draft);
      for (const nested of draft.memberDrafts ?? []) {
        collect(nested);
      }
    };
    for (const draft of stagedMemberDrafts) {
      collect(draft);
    }
    return map;
  }, [stagedMemberDrafts]);

  /**
   * Existing types that are members of a staged group draft (at any depth),
   * keyed to the owning draft: their conversion edits ride that draft's
   * creation, where they merge into the membership republish
   */
  const draftOwnedMemberBases = useMemo(() => {
    const owned = new Map<BaseUrl, BaseUrl>();
    const walk = (draft: StagedDataTypeDraft) => {
      if (draft.dataType.abstract === true) {
        for (const memberId of draft.memberDataTypeIds ?? []) {
          owned.set(extractBaseUrl(memberId), draft.baseUrl);
        }
        for (const nested of draft.memberDrafts ?? []) {
          walk(nested);
        }
      }
    };
    for (const draft of stagedMemberDrafts) {
      walk(draft);
    }
    return owned;
  }, [stagedMemberDrafts]);

  /**
   * Drafts staged alongside this one (in a stage drawer) that hold number
   * values — offerable as conversion targets before anything exists
   */
  const numericSiblingDrafts = useMemo(
    () =>
      (siblingDrafts ?? []).filter(
        (draft) =>
          !("anyOf" in draft.dataType) &&
          draft.dataType.type === "number" &&
          draft.dataType.abstract !== true,
      ),
    [siblingDrafts],
  );

  /**
   * Drafts the parent drawer already holds, seeded from a reopened draft:
   * closing this drawer can't lose them — the parent's copy survives, and
   * keeping them standalone here would create them twice. The abandon dialog
   * covers only drafts first authored in this drawer. An edit replacing a
   * held draft transfers its membership: the edit is discardable, the
   * original still held.
   */
  const parentHeldDraftUrls = useRef(
    new Set(
      (initialDraft?.memberDrafts ?? []).map((member) => member.versionedUrl),
    ),
  );

  const atRiskDrafts = stagedMemberDrafts.filter(
    (draft) => !parentHeldDraftUrls.current.has(draft.versionedUrl),
  );

  const [abandonDraftsDialogOpen, setAbandonDraftsDialogOpen] = useState(false);
  const [keepingDrafts, setKeepingDrafts] = useState(false);
  const [keepDraftsError, setKeepDraftsError] = useState<string | null>(null);

  /**
   * An allowed-types change held behind the abandon dialog because applying
   * it would drop authored member drafts — ungrouping strips every member,
   * and removing a single entry strips its draft. Their fate goes to the
   * user the same way closing does; the change applies from the dialog.
   */
  const [pendingAllowedTypes, setPendingAllowedTypes] = useState<
    AllowedTypeEntry[] | null
  >(null);

  /** The drafts the open abandon dialog decides over */
  const draftsAtStake = pendingAllowedTypes
    ? atRiskDrafts.filter(
        (draft) =>
          !pendingAllowedTypes.some(
            (entry) =>
              "dataTypeId" in entry && entry.dataTypeId === draft.versionedUrl,
          ),
      )
    : atRiskDrafts;

  /** Where a breadcrumb close should land once the drawer is done closing */
  const pendingClosePathRef = useRef<string | null>(null);

  /**
   * Mirrors `hasEdits`, which is computed below from state declared between
   * here and there — the close handlers only read it on events
   */
  const hasEditsRef = useRef(false);

  const finishClose = () => {
    onClose();
    const path = pendingClosePathRef.current;
    pendingClosePathRef.current = null;
    if (path !== null) {
      void router.push(path);
    }
  };

  const [unsavedChangesDialogOpen, setUnsavedChangesDialogOpen] =
    useState(false);

  /**
   * Closing with staged new members pending puts their fate to the user —
   * they were authored in full, so they're kept or discarded explicitly
   * rather than silently dropped. Closing with any other unsaved edits asks
   * for confirmation the same way. The editor stays open behind either
   * dialog, so cancelling it lands back in the form.
   */
  const requestClose = (navigateTo?: string) => {
    pendingClosePathRef.current = navigateTo ?? null;
    if (atRiskDrafts.length > 0) {
      setAbandonDraftsDialogOpen(true);
      return;
    }
    if (hasEditsRef.current) {
      setUnsavedChangesDialogOpen(true);
      return;
    }
    finishClose();
  };

  const dismissAbandonDialog = () => {
    setAbandonDraftsDialogOpen(false);
    setKeepDraftsError(null);
    setPendingAllowedTypes(null);
    pendingClosePathRef.current = null;
  };

  const dismissUnsavedChangesDialog = () => {
    setUnsavedChangesDialogOpen(false);
    pendingClosePathRef.current = null;
  };

  const discardUnsavedChanges = () => {
    setUnsavedChangesDialogOpen(false);
    finishClose();
  };

  const navigateToCrumb = (path: string) => {
    requestClose(path);
  };

  /** The owning web parsed from the type's URL, e.g. "example-org" */
  const editedWebShortname = editedDataType
    ? (/\/@([\w-]+)\//.exec(editedDataType.schema.$id)?.[1] ?? null)
    : null;
  const editedVersion = editedDataType
    ? editedDataType.schema.$id.split("/v/")[1]
    : null;

  /** Every stored version of the edited type, newest first */
  const editedTypeVersions = useMemo(() => {
    if (!editedDataType) {
      return [];
    }
    const editedBase = editedDataType.metadata.recordId.baseUrl;
    return Object.values(dataTypes)
      .filter((dataType) => dataType.metadata.recordId.baseUrl === editedBase)
      .sort((a, b) =>
        compareOntologyTypeVersions(
          b.metadata.recordId.version,
          a.metadata.recordId.version,
        ),
      );
  }, [editedDataType, dataTypes]);

  const editableWebIds = useMemo(
    () =>
      new Set<string>(
        authenticatedUser
          ? [
              authenticatedUser.accountId,
              ...authenticatedUser.memberOf.map(({ org }) => org.webId),
            ]
          : [],
      ),
    [authenticatedUser],
  );

  /** The backend's policy verdicts, null while loading */
  const editableDataTypeBaseUrls = useDataTypeEditPermissions({
    latestDataTypes,
    skip: readonly,
  });

  /**
   * Whether saving may publish a new version of this type — the backend's
   * own policy check once fetched, approximated by web membership (the
   * default policy grant) until then
   */
  const canEditDataType = useCallback(
    (dataTypeId: VersionedUrl) => {
      if (stagedDrafts.byUrl.has(dataTypeId)) {
        return true;
      }

      const fetched = editableDataTypeBaseUrls?.get(extractBaseUrl(dataTypeId));
      if (fetched !== undefined) {
        return fetched;
      }

      const dataType =
        dataTypes[dataTypeId] ?? latestDataTypes[extractBaseUrl(dataTypeId)];

      return (
        !!dataType &&
        "webId" in dataType.metadata &&
        editableWebIds.has(dataType.metadata.webId)
      );
    },
    [
      dataTypes,
      latestDataTypes,
      editableWebIds,
      stagedDrafts,
      editableDataTypeBaseUrls,
    ],
  );

  const resolveDataType = useCallback(
    (dataTypeId: VersionedUrl) =>
      stagedDrafts.asDataTypes.get(dataTypeId) ??
      dataTypes[dataTypeId] ??
      latestDataTypes[extractBaseUrl(dataTypeId)],
    [dataTypes, latestDataTypes, stagedDrafts],
  );

  /**
   * Whether a parent ref is a group membership rather than a value
   * definition: abstract types hold no values, so extending one declares
   * belonging and bundles its constraints, while the concrete lineage
   * defines what a value is. The hidden universal Value root is neither.
   */
  const isMembershipParentRef = useCallback(
    (dataTypeId: VersionedUrl): boolean =>
      extractBaseUrl(dataTypeId) !==
        blockProtocolDataTypes.value.dataTypeBaseUrl &&
      resolveDataType(dataTypeId)?.schema.abstract === true,
    [resolveDataType],
  );

  const canEditByBaseUrl = useCallback(
    (baseUrl: BaseUrl) => {
      const latest = latestDataTypes[baseUrl];
      return !!latest && canEditDataType(latest.schema.$id);
    },
    [latestDataTypes, canEditDataType],
  );

  /**
   * A composed (via-canonical) pairing awaiting removal confirmation.
   * Nothing stores the pairing itself, so removing it severs its target
   * from the conversion group — the dialog lists every pairing that goes
   * with it before anything changes.
   */
  const [composedRemovalRow, setComposedRemovalRow] =
    useState<ConversionRowState | null>(null);

  /** The types storing an edge incident to this member — republished on severing */
  const composedEdgeHolders = useCallback(
    (memberBaseUrl: BaseUrl): BaseUrl[] => {
      const group = conversionGroups.get(memberBaseUrl);
      if (!group) {
        return [];
      }
      const holders = new Set<BaseUrl>();
      for (const edge of group.edges) {
        if (
          edge.sourceBaseUrl === memberBaseUrl ||
          edge.targetBaseUrl === memberBaseUrl
        ) {
          holders.add(edge.sourceBaseUrl);
        }
      }
      return [...holders];
    },
    [conversionGroups],
  );

  const canRemoveComposedPairing = useCallback(
    (memberBaseUrl: BaseUrl) => {
      const holders = composedEdgeHolders(memberBaseUrl);
      return holders.length > 0 && holders.every(canEditByBaseUrl);
    },
    [composedEdgeHolders, canEditByBaseUrl],
  );

  /**
   * The parent's primitive type tag — `primitive: null` for anyOf-typed
   * parents, and a whole `null` for unknown types. Falls back to the
   * statically-known primitive roots, which are pickable before the graph
   * holds a copy of them.
   */
  const resolveParentPrimitive = useCallback(
    (
      dataTypeId: VersionedUrl,
    ): { primitive: SingleValueConstraints["type"] | null } | null => {
      const schema = resolveDataType(dataTypeId)?.schema;

      if (schema) {
        return { primitive: primitiveTypeFromSchema(schema) };
      }

      const fallback = primitiveRootTypeByBaseUrl.get(
        extractBaseUrl(dataTypeId),
      );
      return fallback ? { primitive: fallback.type } : null;
    },
    [resolveDataType],
  );

  /** A union-typed parent's own `anyOf` arms, `null` for other types */
  const resolveParentUnionArms = (
    dataTypeId: VersionedUrl,
  ): SingleValueSchema[] | null => {
    const schema = resolveDataType(dataTypeId)?.schema;
    return schema && "anyOf" in schema ? [...schema.anyOf] : null;
  };

  /**
   * The parents the constraint card reads inheritance from: every parent
   * entry, as long as there are no list arms (those make the type a union).
   * A child of a group legitimately has several parents — the card applies
   * whenever they all share one primitive.
   */
  const constraintParentIds = useMemo(() => {
    const hasListEntries = allowedTypes.some(
      (entry) => entry.relation === "list",
    );

    return hasListEntries
      ? []
      : allowedTypes
          .filter(
            (entry): entry is ReferenceEntry => entry.relation === "parent",
          )
          .map((entry) => entry.dataTypeId);
  }, [allowedTypes]);

  /** The single primitive every parent shares — null hides the card */
  const constraintPrimitive = useMemo(
    () =>
      sharedParentPrimitive({
        parentDataTypeIds: constraintParentIds,
        resolvePrimitive: (dataTypeId) =>
          resolveParentPrimitive(dataTypeId)?.primitive ?? null,
      }),
    [constraintParentIds, resolveParentPrimitive],
  );

  /**
   * The single primitive the member ("child") entries share — the bare value
   * arm a parentless group takes, since members inherit it via their allOf
   */
  const childEntryPrimitive = useMemo(
    () =>
      sharedParentPrimitive({
        parentDataTypeIds: allowedTypes
          .filter(
            (entry): entry is ReferenceEntry => entry.relation === "child",
          )
          .map((entry) => entry.dataTypeId),
        resolvePrimitive: (dataTypeId) =>
          resolveParentPrimitive(dataTypeId)?.primitive ?? null,
      }),
    [allowedTypes, resolveParentPrimitive],
  );

  /**
   * The primitive a child (group member / "Extended by") pick must
   * share: a child's constraints must compose with this type's. `null` — when
   * the type is a union or its parents disagree — leaves child picks
   * unconstrained. The title names this type in the picker's disabled reason.
   */
  const childCompatibility = useMemo(() => {
    const hasListEntries = allowedTypes.some(
      (entry) => entry.relation === "list",
    );

    const primitive = hasListEntries
      ? null
      : constraintParentIds.length > 0
        ? constraintPrimitive
        : (childEntryPrimitive ??
          (editedDataType
            ? primitiveTypeFromSchema(editedDataType.schema)
            : // A type staged for a group stays in its category — a nested
              // group's members start under the same restriction
              (restrictParentPrimitive ?? null)));

    if (primitive === null) {
      return null;
    }

    return {
      primitive,
      title:
        title.trim() ||
        (primitiveRootTypes.find((rootType) => rootType.type === primitive)
          ?.title ??
          "this type"),
    };
  }, [
    allowedTypes,
    constraintParentIds,
    constraintPrimitive,
    childEntryPrimitive,
    editedDataType,
    restrictParentPrimitive,
    title,
  ]);

  /**
   * The types the edited type's constraints reach: the "Allow another type"
   * entries (each carries the edited type in its `allOf`) and, transitively,
   * every type extending those.
   */
  const childTypeTitles = useMemo(
    () =>
      collectDescendantTypeTitles({
        childDataTypeIds: allowedTypes
          .filter(
            (entry): entry is ReferenceEntry => entry.relation === "child",
          )
          .map((entry) => entry.dataTypeId),
        latestDataTypes,
        resolveDataType,
        excludeBaseUrl: editedDataType?.metadata.recordId.baseUrl,
      }),
    [allowedTypes, latestDataTypes, resolveDataType, editedDataType],
  );

  const inheritedConstraints = useMemo<InheritedConstraints>(
    () =>
      constraintParentIds.length > 0
        ? deriveInheritedConstraints({
            parentDataTypeIds: constraintParentIds,
            resolveDataType,
          })
        : emptyInheritedConstraints,
    [constraintParentIds, resolveDataType],
  );

  const parentEntries = allowedTypes.filter(
    (entry): entry is ReferenceEntry => entry.relation === "parent",
  );
  const childEntries = allowedTypes.filter(
    (entry): entry is ReferenceEntry => entry.relation === "child",
  );
  const listEntries = allowedTypes.filter(
    (entry): entry is ListEntry => entry.relation === "list",
  );

  const childEntryCount = childEntries.length;
  const parentEntryCount = parentEntries.length;

  const membershipParentEntries = parentEntries.filter((entry) =>
    isMembershipParentRef(entry.dataTypeId),
  );

  /**
   * What the card's Extends section would actually show: the universal Value
   * root is plumbing every type ultimately extends, which the field hides,
   * and membership (group) parents display in the Member of section instead.
   */
  const extendsSectionHasVisibleContent =
    allowedTypes.some((entry) => entry.relation === "group") ||
    listEntries.length > 0 ||
    parentEntries.some(
      (entry) =>
        extractBaseUrl(entry.dataTypeId) !==
          blockProtocolDataTypes.value.dataTypeBaseUrl &&
        !isMembershipParentRef(entry.dataTypeId),
    );

  // A read-only view of a type with nothing in either section has an empty
  // card to offer, so better no card at all
  const extendsCardHasVisibleContent =
    extendsSectionHasVisibleContent || membershipParentEntries.length > 0;

  // The synthesized parent a save writes for a parentless group: the
  // members' lowest shared ancestor, so the group's root follows its
  // membership — their primitive root when the chains never meet or can't
  // be resolved
  const groupRootRef =
    parentEntries.length === 0 &&
    listEntries.length === 0 &&
    childEntries.length > 0
      ? (lowestCommonAncestorRef({
          memberDataTypeIds: childEntries.map((entry) => entry.dataTypeId),
          excludeBaseUrl: editedDataType?.metadata.recordId.baseUrl,
          resolveDataType,
          latestDataTypes,
        }) ?? primitiveRootRefFor(childEntryPrimitive))
      : null;

  // The Group row's annotation: the base type every member shares — no chip
  // when the members' primitives disagree
  const groupBaseRef =
    childEntries.length > 0 ? primitiveRootRefFor(childEntryPrimitive) : null;

  // The primitive arm keeps its constraints when list arms hide the card:
  // constraintPrimitive goes null then, but the parents still name the
  // arm's primitive and the card's state still binds it
  const armPrimitive =
    constraintPrimitive ??
    sharedParentPrimitive({
      parentDataTypeIds: parentEntries.map((entry) => entry.dataTypeId),
      resolvePrimitive: (dataTypeId) =>
        resolveParentPrimitive(dataTypeId)?.primitive ?? null,
    });

  /**
   * What a membership-only type is, shown read-only where the value
   * definition would sit: its primitive root reaches it through the groups
   * it belongs to rather than as a stated parent of its own.
   */
  const firstMembershipEntry = membershipParentEntries[0];
  const derivedRootType =
    !extendsSectionHasVisibleContent && firstMembershipEntry
      ? primitiveRootTypes.find((rootType) => rootType.type === armPrimitive)
      : undefined;
  const derivedValueRoot =
    derivedRootType && firstMembershipEntry
      ? {
          title: derivedRootType.title,
          primitive: derivedRootType.type,
          viaTitle:
            resolveDataType(firstMembershipEntry.dataTypeId)?.schema.title ??
            "the groups it belongs to",
        }
      : null;

  const ownConstraintsPart =
    armPrimitive !== null
      ? schemaConstraintsFromValues({
          primitive: armPrimitive,
          activeKinds: constraintState.activeKinds,
          values: constraintState.values,
        })
      : null;

  /**
   * The consequences of the staged Type-card changes worth surfacing before
   * save: a different value type invalidating the current constraints or
   * conversions, the single-extension ↔ group transition flipping the
   * inheritance model, membership changes republishing other types, or
   * extending a converting type whose conversions the new child will not
   * inherit. Compared against the saved state, so the banner always shows
   * the net staged change.
   */
  const describeStagedChangeWarnings = (): string[] => {
    const warnings: string[] = [];

    const primitiveOf = (entries: AllowedTypeEntry[]) => {
      if (entries.some((entry) => entry.relation === "list")) {
        return null;
      }

      const idsOf = (relation: AllowedTypeRelation) =>
        entries
          .filter(
            (entry): entry is ReferenceEntry => entry.relation === relation,
          )
          .map((entry) => entry.dataTypeId);

      // A new parentless group's arm comes from its members instead
      const parentIds = idsOf("parent");
      const ids =
        parentIds.length > 0 || editedDataType ? parentIds : idsOf("child");

      return sharedParentPrimitive({
        parentDataTypeIds: ids,
        resolvePrimitive: (dataTypeId) =>
          resolveParentPrimitive(dataTypeId)?.primitive ?? null,
      });
    };

    const primitiveTitle = (primitive: SingleValueConstraints["type"]) =>
      primitiveRootTypes.find((rootType) => rootType.type === primitive)
        ?.title ?? primitive;

    const oldPrimitive = primitiveOf(initialEntries);
    const newPrimitive = primitiveOf(allowedTypes);

    const displayTitle = title.trim() || "This type";
    const hasConversionRows = conversionRows.some(
      (row) => row.targetBaseUrl !== null,
    );

    if (
      oldPrimitive !== null &&
      newPrimitive !== null &&
      newPrimitive !== oldPrimitive &&
      visibleConstraintKinds({
        primitive: oldPrimitive,
        activeKinds: constraintState.activeKinds,
        inheritedValues: inheritedConstraints.values,
      }).length > 0
    ) {
      warnings.push(
        `The current ${primitiveTitle(oldPrimitive)} constraints will no longer apply to ${primitiveTitle(newPrimitive)} values.`,
      );
    }

    // Conversions are arithmetic over numbers: a type leaving the number
    // value type loses them on save
    if (
      oldPrimitive === "number" &&
      newPrimitive !== "number" &&
      hasConversionRows
    ) {
      warnings.push(
        `“${displayTitle}” has conversions, which only apply to number values — saving removes them.`,
      );
    }

    // Conversions are not inherited: extending a converting type does not
    // make the new type convertible
    const initialReferenceBaseUrls = new Set(
      initialEntries
        .filter((entry): entry is ReferenceEntry => "dataTypeId" in entry)
        .map((entry) => extractBaseUrl(entry.dataTypeId)),
    );
    const addedConvertingParents = allowedTypes
      .filter((entry): entry is ReferenceEntry => entry.relation === "parent")
      .filter(
        (entry) =>
          !initialReferenceBaseUrls.has(extractBaseUrl(entry.dataTypeId)),
      )
      .filter((entry) =>
        conversionGroups.has(extractBaseUrl(entry.dataTypeId)),
      );

    if (addedConvertingParents.length > 0) {
      const parentTitles = summarizeTypeTitles(
        addedConvertingParents.map(
          (entry) =>
            resolveDataType(entry.dataTypeId)?.schema.title ??
            "the extended type",
        ),
      );
      warnings.push(
        `“${parentTitles}” converts to other data types, but “${displayTitle}” will not inherit those conversions — its values won’t convert unless conversions are defined on it.`,
      );
    }

    const childEntriesOf = (entries: AllowedTypeEntry[]) =>
      entries.filter(
        (entry): entry is ReferenceEntry => entry.relation === "child",
      );

    const titlesOf = (entries: ReferenceEntry[]) => {
      const titles = entries
        .map((entry) => resolveDataType(entry.dataTypeId)?.schema.title)
        .filter((childTitle): childTitle is string => childTitle !== undefined);

      return titles.length > 0
        ? summarizeTypeTitles(titles)
        : "the affected types";
    };

    /** Existing members are republished to join; staged drafts are created */
    const splitDraftEntries = (entries: ReferenceEntry[]) => ({
      existing: entries.filter(
        (entry) => !stagedDrafts.byUrl.has(entry.dataTypeId),
      ),
      drafts: entries.filter((entry) =>
        stagedDrafts.byUrl.has(entry.dataTypeId),
      ),
    });

    const initialChildren = childEntriesOf(initialEntries);
    const nextChildren = childEntriesOf(allowedTypes);

    if (initialChildren.length === 0 && nextChildren.length > 0) {
      if (editedDataType) {
        const { existing } = splitDraftEntries(nextChildren);
        if (existing.length > 0) {
          warnings.push(
            `A new version of ${titlesOf(existing)} will be published, inheriting every constraint set on “${displayTitle}”.`,
          );
        }
      } else {
        // A new group is a pure union: parentless, abstract, with a bare
        // value arm — its staged constraints and conversions don't survive.
        // Newly-authored members need no warning: abandoning the drawer asks
        // what to do with them instead
        const { existing } = splitDraftEntries(nextChildren);
        if (existing.length > 0) {
          warnings.push(
            `A new version of ${titlesOf(existing)} will be published.`,
          );
        }

        if (
          oldPrimitive !== null &&
          visibleConstraintKinds({
            primitive: oldPrimitive,
            activeKinds: constraintState.activeKinds,
            inheritedValues: emptyInheritedConstraints.values,
          }).length > 0
        ) {
          warnings.push(
            `“${displayTitle}” keeps no constraints of its own — a group adds none.`,
          );
        }

        if (hasConversionRows) {
          warnings.push(
            `“${displayTitle}” keeps no conversions — an abstract type has no values to convert.`,
          );
        }
      }
    } else if (
      initialChildren.length > 0 &&
      nextChildren.length === 0 &&
      editedDataType
    ) {
      // In create mode nothing was persisted, so dropping back to a single
      // extended type has no consequences worth surfacing
      warnings.push(
        `A new version of ${titlesOf(initialChildren)} will be published.`,
      );
    } else if (editedDataType) {
      // Membership changes republish the affected members
      const initialChildBaseUrls = new Set(
        initialChildren.map((entry) => extractBaseUrl(entry.dataTypeId)),
      );
      const nextChildBaseUrls = new Set(
        nextChildren.map((entry) => extractBaseUrl(entry.dataTypeId)),
      );
      const addedMembers = nextChildren.filter(
        (entry) => !initialChildBaseUrls.has(extractBaseUrl(entry.dataTypeId)),
      );
      const removedMembers = initialChildren.filter(
        (entry) => !nextChildBaseUrls.has(extractBaseUrl(entry.dataTypeId)),
      );

      const { existing: addedExisting } = splitDraftEntries(addedMembers);
      const republishedMembers = [...addedExisting, ...removedMembers];
      if (republishedMembers.length > 0) {
        warnings.push(
          `A new version of ${titlesOf(republishedMembers)} will be published.`,
        );
      }

      // The synthesized root follows the membership — surface it moving
      if (initialEntries.some((entry) => entry.relation === "group")) {
        const originalRootRef = (editedDataType.schema.allOf ?? [])
          .map(({ $ref }) => $ref)
          .find((ref) => extractBaseUrl(ref) !== listDataTypeBaseUrl);

        if (
          originalRootRef &&
          groupRootRef &&
          extractBaseUrl(originalRootRef) !== extractBaseUrl(groupRootRef)
        ) {
          const rootTitle = (ref: VersionedUrl) =>
            resolveDataType(ref)?.schema.title ??
            primitiveRootTypeByBaseUrl.get(extractBaseUrl(ref))?.title ??
            "another type";
          warnings.push(
            `“${displayTitle}” will extend “${rootTitle(groupRootRef)}” instead of “${rootTitle(originalRootRef)}” — the closest type every member shares.`,
          );
        }
      }
    }

    return warnings;
  };

  const stagedChangeWarnings = describeStagedChangeWarnings();

  const applyAllowedTypesChange = (next: AllowedTypeEntry[]) => {
    setAllowedTypes(next);
    // A draft whose entry was removed has nothing referencing it — drop it so
    // saving can't create it
    setStagedMemberDrafts((previous) =>
      previous.filter((draft) =>
        next.some(
          (entry) =>
            "dataTypeId" in entry && entry.dataTypeId === draft.versionedUrl,
        ),
      ),
    );
    setErrors((prev) => ({
      ...prev,
      allowedTypes: undefined,
      groupMembers: undefined,
    }));
  };

  const handleAllowedTypesChange = (rawNext: AllowedTypeEntry[]) => {
    const hadGroupEntry = allowedTypes.some(
      (entry) => entry.relation === "group",
    );
    const keepsGroupEntry = rawNext.some((entry) => entry.relation === "group");

    // Removing the Group entry ungroups the type: the members leave with it
    const next =
      hadGroupEntry && !keepsGroupEntry
        ? rawNext.filter((entry) => entry.relation !== "child")
        : rawNext;

    // A change dropping authored drafts puts their fate to the user first,
    // the way closing does, rather than silently discarding their work
    const dropsAuthoredDrafts = atRiskDrafts.some(
      (draft) =>
        !next.some(
          (entry) =>
            "dataTypeId" in entry && entry.dataTypeId === draft.versionedUrl,
        ),
    );
    if (dropsAuthoredDrafts) {
      setPendingAllowedTypes(next);
      setAbandonDraftsDialogOpen(true);
      return;
    }

    applyAllowedTypesChange(next);
  };

  const hasGroupEntry = allowedTypes.some(
    (entry) => entry.relation === "group",
  );
  const wasGroup = initialEntries.some((entry) => entry.relation === "group");

  /**
   * The types extending this one are reference information rather than
   * part of the type's own definition, so their card sits last, collapsed
   */
  const [extendedByExpanded, setExtendedByExpanded] = useState(false);

  const showExtendedByCard = !hasGroupEntry && childEntryCount > 0;

  /**
   * The header's entry point for creating a type extending this one, shown
   * while no Extended by card offers the same action. It opens a stacked
   * create drawer with this type as the staged parent.
   */
  const [extendTypeDrawerOpen, setExtendTypeDrawerOpen] = useState(false);
  // A group's members are staged and created with the group's save — the
  // header action would create an extending type immediately, persisting a
  // member even when the group edit is then discarded
  const showExtendTypeAction =
    !!editedDataType && !showExtendedByCard && !hasGroupEntry;

  /** The picker's typed search text, seeding the create drawer's name */
  const [createNewInitialTitle, setCreateNewInitialTitle] = useState("");

  /**
   * The drawer's own dismissals (close button, Escape, backdrop), caught
   * pre-animation. A request arriving while a stacked overlay is open was
   * aimed at the overlay — dismissing that layer must not also close this
   * drawer underneath it. Slides pushed after this drawer opened (a type
   * link opens a sibling drawer via the slide stack) count as stacked
   * overlays too: they portal next to this drawer, so interacting with them
   * reads as an outside click here.
   */
  const interceptDrawerClose = () => {
    if (
      extendTypeDrawerOpen ||
      memberDraftDrawerOpen ||
      abandonDraftsDialogOpen ||
      unsavedChangesDialogOpen ||
      composedRemovalRow !== null ||
      slideStackDepth > mountSlideStackDepthRef.current ||
      dataTypeDrawerDepth > mountDataTypeDrawerDepthRef.current
    ) {
      return false;
    }
    if (atRiskDrafts.length === 0 && !hasEditsRef.current) {
      return true;
    }
    requestClose();
    return false;
  };

  /**
   * A type created from this drawer's extend actions was saved already
   * extending this type, so it joins the initial and staged entries alike:
   * shown in the Extended by card, but not an edit of this type to save.
   */
  const handleExtendingTypeCreated = (created: DataTypeWithMetadata) => {
    setExtendTypeDrawerOpen(false);

    if (!editedDataType) {
      return;
    }

    const extendsEditedType = (created.schema.allOf ?? []).some(
      ({ $ref }) =>
        extractBaseUrl($ref) === editedDataType.metadata.recordId.baseUrl,
    );

    if (!extendsEditedType) {
      return;
    }

    const entry: AllowedTypeEntry = {
      dataTypeId: created.schema.$id,
      relation: "child",
    };
    setInitialEntries((previous) => [...previous, entry]);
    setAllowedTypes((previous) => [...previous, entry]);
    setExtendedByExpanded(true);
  };

  /**
   * A member authored in the stacked create drawer: staged only — it joins
   * the member entries now and is created when this drawer saves. Re-staging
   * an edited draft replaces it, keyed by the URL it was opened under (a
   * rename mints a new one).
   */
  const handleMemberDraftStaged = (draft: StagedDataTypeDraft) => {
    setMemberDraftDrawerOpen(false);
    const replacingUrl = editingDraftUrl;
    setEditingDraftUrl(null);

    if (replacingUrl) {
      // A rename of a parent-held draft carries its held status to the new
      // URL — the edit stays discardable, the parent's original survives
      if (
        parentHeldDraftUrls.current.has(replacingUrl) &&
        replacingUrl !== draft.versionedUrl
      ) {
        parentHeldDraftUrls.current.delete(replacingUrl);
        parentHeldDraftUrls.current.add(draft.versionedUrl);
      }

      setStagedMemberDrafts((previous) =>
        previous.map((existing) =>
          existing.versionedUrl === replacingUrl ? draft : existing,
        ),
      );
      setAllowedTypes((previous) =>
        previous.map((entry): AllowedTypeEntry =>
          "dataTypeId" in entry && entry.dataTypeId === replacingUrl
            ? { dataTypeId: draft.versionedUrl, relation: "child" }
            : entry,
        ),
      );
      return;
    }

    setStagedMemberDrafts((previous) => [...previous, draft]);
    setAllowedTypes((previous) => [
      ...previous,
      { dataTypeId: draft.versionedUrl, relation: "child" },
    ]);
    setErrors((previous) => ({ ...previous, groupMembers: undefined }));
  };

  const valueParentCount =
    parentEntryCount -
    membershipParentEntries.length -
    parentEntries.filter(
      (entry) =>
        extractBaseUrl(entry.dataTypeId) ===
        blockProtocolDataTypes.value.dataTypeBaseUrl,
    ).length;

  const typeCardDescription = hasGroupEntry
    ? "This type is a group — its values can be any of the group's members below."
    : allowedTypes.length === 0
      ? "Select the type this data type extends, or choose Group to combine several existing types into one."
      : allowedTypes.some((entry) => entry.relation === "list")
        ? "A value of this type can be any of the types below."
        : derivedValueRoot
          ? "Its value type is inherited through the groups this type belongs to."
          : valueParentCount > 1
            ? "This type extends all of the types below, inheriting each one's constraints."
            : "This type extends the type below, inheriting its constraints.";

  const showConstraintCard =
    constraintPrimitive !== null &&
    visibleConstraintKinds({
      primitive: constraintPrimitive,
      activeKinds: constraintState.activeKinds,
      inheritedValues: inheritedConstraints.values,
    }).length > 0;

  const showAddConstraintButton =
    constraintPrimitive !== null && !showConstraintCard;

  /**
   * Conversions are arithmetic over number values, and an abstract type has
   * no values to convert — so only concrete number types take them. A new
   * group saves abstract, so it loses them too.
   */
  // A staged definition carries its conversions as rows: placement — and
  // any republishing of other types — runs when the parent's save creates it
  const conversionsApplicable =
    constraintPrimitive === "number" &&
    editedDataType?.schema.abstract !== true &&
    !(childEntryCount > 0 && !editedDataType);

  const showConversionCard = conversionsApplicable && conversionRows.length > 0;
  const showAddConversionButton =
    conversionsApplicable && !showConversionCard && !readonly;

  /**
   * A group over number types takes conversions by proxy: the group itself is
   * abstract, so they are viewed and set on its concrete members instead. A
   * staged group packs the edits into its draft; the writes run when the
   * root save creates it. A saved abstract type is a group here whatever its
   * parents look like — sub-groups show their family's conversions too.
   */
  const groupConversionsApplicable =
    (hasGroupEntry && childEntryPrimitive === "number") ||
    (editedDataType?.schema.abstract === true &&
      constraintPrimitive === "number");

  const {
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
  } = useGroupConversions({
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
    onRowsEdited: () =>
      setErrors((prev) => ({ ...prev, conversions: undefined })),
  });

  const hasEdits =
    title !== initialFormState.title ||
    titlePlural !== initialFormState.titlePlural ||
    description !== initialFormState.description ||
    labelLeft !== initialFormState.labelLeft ||
    labelRight !== initialFormState.labelRight ||
    !isEqual(allowedTypes, initialEntries) ||
    !isEqual(constraintState, initialFormState.constraintState) ||
    !isEqual(conversionRows, initialFormState.conversionRows) ||
    // Re-staging a member the parent already holds keeps its entry and URL,
    // so only the draft body betrays the edit
    !isEqual(stagedMemberDrafts, initialDraft?.memberDrafts ?? []) ||
    groupRowOverrides.size > 0 ||
    newGroupConversionRows.length > 0;
  hasEditsRef.current = hasEdits;

  // Creation needs the required fields: a name, a description, and at least
  // one type (the schema always expresses a value type, so one must be picked)
  const canSubmit = editedDataType
    ? hasEdits
    : title.trim().length > 0 &&
      description.trim().length > 0 &&
      allowedTypes.length > 0;

  const showGroupConversionCard =
    groupConversionsApplicable && groupConversionRows.length > 0;
  const showAddGroupConversionButton =
    groupConversionsApplicable &&
    !showGroupConversionCard &&
    !readonly &&
    groupConversionChildren.length > 0;

  /** Value labels decorate displayed values — a number or text thing */
  const appearanceApplicable =
    constraintPrimitive === "number" || constraintPrimitive === "string";

  /**
   * The value label this type inherits while it sets none of its own: the
   * graph's closed schema takes the nearest ancestor's whole label, so the
   * Appearance card surfaces it the way the Constraints card surfaces
   * inherited constraints. Level-order, so the nearest ancestor wins; equal
   * depths are ambiguous (the graph rejects those saves) — the first found
   * stands in for display.
   */
  const inheritedLabel = useMemo(() => {
    const visited = new Set<BaseUrl>();
    let level = allowedTypes
      .filter((entry): entry is ReferenceEntry => entry.relation === "parent")
      .map((entry) => entry.dataTypeId);

    while (level.length > 0) {
      const next: VersionedUrl[] = [];
      for (const dataTypeId of level) {
        const baseUrl = extractBaseUrl(dataTypeId);
        if (visited.has(baseUrl)) {
          continue;
        }
        visited.add(baseUrl);
        const schema = resolveDataType(dataTypeId)?.schema;
        if (!schema) {
          continue;
        }
        const { label } = schema;
        if (label && (label.left ?? label.right)) {
          return {
            left: label.left,
            right: label.right,
            fromTitle: schema.title,
          };
        }
        next.push(...(schema.allOf ?? []).map(({ $ref }) => $ref));
      }
      level = next;
    }
    return null;
  }, [allowedTypes, resolveDataType]);

  const conversionTargetOptions = useMemo(() => {
    // The per-target planner gate below is costly across every public type —
    // skip it whenever the conversion picker can't render anyway
    if (!conversionsApplicable || readonly) {
      return [];
    }

    // In create mode the type being made has no base URL yet; any unclaimed
    // one stands in — the planner only needs it absent from the stored data
    const viewedBaseUrl =
      editedDataType?.metadata.recordId.baseUrl ??
      ("https://hash.ai/not-yet-created/" as BaseUrl);

    const canWriteTo = (baseUrl: BaseUrl) =>
      baseUrl === viewedBaseUrl || canEditByBaseUrl(baseUrl);

    // A target is offerable when the planner that will run at save time can
    // place it alongside everything already staged — running the real
    // planner keeps this gate and the save path agreeing, including on
    // permissions and on slots the staged rows already claim or free up
    const stagedDesired = conversionRows
      .filter((row) => !row.viaCanonical && !row.formula)
      .flatMap((row) =>
        row.targetBaseUrl !== null && row.value !== null
          ? [
              {
                targetBaseUrl: row.targetBaseUrl,
                simple: { operator: row.operator, operand: row.value },
              },
            ]
          : [],
      );
    const stagedInitial = initialConversionRows.filter(
      (row) => !row.viaCanonical && (row.factor !== null || row.simple != null),
    );

    const placeable = (targetBaseUrl: BaseUrl) =>
      !planConversionUpdates({
        viewedBaseUrl,
        desiredRows: [...stagedDesired, { targetBaseUrl, factor: 1 }],
        initialRows: stagedInitial,
        latestDataTypes,
        canWriteTo,
      }).unplacedTargets.includes(targetBaseUrl);

    const resolveSchema = (id: VersionedUrl) => resolveDataType(id)?.schema;

    // Family first: the edited type's ancestors, from its staged parents
    const ancestorDepths = ancestorDepthMap({
      selfBaseUrl: viewedBaseUrl,
      parentIds: constraintParentIds,
      resolveSchema,
    });

    const familyDepthOf = (dataTypeId: VersionedUrl): number =>
      familyDepthFrom({ dataTypeId, ancestorDepths, resolveSchema });

    // Fellow members of the group this type is being authored into rank
    // first: the group becomes its closest shared parent on save
    const coMembers = new Set(coMemberBaseUrls ?? []);

    // A conversion only makes sense between units of one quantity: targets
    // are limited to fellow members of the type's parent groups
    const parentGroups = groupAncestorsOf({
      ancestorDepths,
      resolveLatestSchema: (baseUrl) => latestDataTypes[baseUrl]?.schema,
    });

    // Sibling drafts are new pairings on this (also new) type — always
    // placeable, and co-members like everything else staged in the group
    const siblingOptions = numericSiblingDrafts.map((draft) => ({
      baseUrl: draft.baseUrl,
      title: draft.dataType.title,
      disabled: false,
      familyDepth: coMemberRank,
    }));

    return [
      ...Object.values(latestDataTypes)
        .filter(
          (dataType) =>
            isLiveDataType(dataType) &&
            !("anyOf" in dataType.schema) &&
            dataType.schema.type === "number" &&
            dataType.schema.abstract !== true &&
            dataType.metadata.recordId.baseUrl !== viewedBaseUrl &&
            dataType.metadata.recordId.baseUrl !==
              blockProtocolDataTypes.number.dataTypeBaseUrl &&
            (coMembers.has(dataType.metadata.recordId.baseUrl) ||
              belongsToAnyGroup({
                dataTypeId: dataType.schema.$id,
                groupBaseUrls: parentGroups,
                resolveSchema,
              })),
        )
        .map((dataType) => {
          const targetBaseUrl = dataType.metadata.recordId.baseUrl;
          const familyDepth = familyDepthOf(dataType.schema.$id);

          return {
            baseUrl: targetBaseUrl,
            title: dataType.schema.title,
            disabled: !placeable(targetBaseUrl),
            familyDepth: coMembers.has(targetBaseUrl)
              ? Math.min(familyDepth, coMemberRank)
              : familyDepth,
          };
        }),
      ...siblingOptions,
    ]
      .sort(
        (a, b) =>
          a.familyDepth - b.familyDepth || a.title.localeCompare(b.title),
      )
      .map(({ familyDepth: _familyDepth, ...option }) => option);
  }, [
    conversionsApplicable,
    readonly,
    latestDataTypes,
    editedDataType,
    canEditByBaseUrl,
    constraintParentIds,
    numericSiblingDrafts,
    coMemberBaseUrls,
    resolveDataType,
    conversionRows,
    initialConversionRows,
  ]);

  const resolveConversionTitle = useCallback(
    (baseUrl: BaseUrl) =>
      draftsByBaseUrl.get(baseUrl)?.dataType.title ??
      numericSiblingDrafts.find((draft) => draft.baseUrl === baseUrl)?.dataType
        .title ??
      latestDataTypes[baseUrl]?.schema.title ??
      baseUrl,
    [draftsByBaseUrl, numericSiblingDrafts, latestDataTypes],
  );

  /**
   * Every pairing severing the pending removal's target takes with it — the
   * dialog's list, the viewed type's own pairing first
   */
  const composedRemovalPairings = useMemo((): Array<[BaseUrl, BaseUrl]> => {
    const targetBaseUrl = composedRemovalRow?.targetBaseUrl;
    const group = targetBaseUrl ? conversionGroups.get(targetBaseUrl) : null;
    if (!targetBaseUrl || !group) {
      return [];
    }

    const viewedBaseUrl = editedDataType?.metadata.recordId.baseUrl;
    const involvesViewed = (pair: [BaseUrl, BaseUrl]) =>
      pair.some((member) => member === viewedBaseUrl);

    return severedConversionPairings({
      memberBaseUrl: targetBaseUrl,
      group,
    }).sort(
      (a, b) =>
        Number(involvesViewed(b)) - Number(involvesViewed(a)) ||
        resolveConversionTitle(a[0]).localeCompare(
          resolveConversionTitle(b[0]),
        ) ||
        resolveConversionTitle(a[1]).localeCompare(
          resolveConversionTitle(b[1]),
        ),
    );
  }, [
    composedRemovalRow,
    conversionGroups,
    editedDataType,
    resolveConversionTitle,
  ]);

  const confirmComposedRemoval = () => {
    if (!composedRemovalRow) {
      return;
    }
    setConversionRows(
      conversionRows.filter((row) => row.key !== composedRemovalRow.key),
    );
    setErrors((prev) => ({ ...prev, conversions: undefined }));
    setComposedRemovalRow(null);
  };

  /** The picker disables unplaceable targets; this backstops a stale pick */
  const unplacedConversionsError = (targets: BaseUrl[]) =>
    `Conversions to ${summarizeTypeTitles(
      targets.map(resolveConversionTitle),
    )} can't be stored — every type that could hold them either can't be updated by you or already stores another conversion`;

  /** The composed remove button is permission-gated; backstops a stale state */
  const unremovableConversionsError = (targets: BaseUrl[]) =>
    `Conversions with ${summarizeTypeTitles(
      targets.map(resolveConversionTitle),
    )} can't be removed — you can't update every type storing the group's pairings with them`;

  /** Two members' plans rewriting one type differently can't both apply */
  const conflictingConversionsError = (baseUrls: BaseUrl[]) =>
    `The staged conversions change ${summarizeTypeTitles(
      baseUrls.map(resolveConversionTitle),
    )} in more than one way — save them separately`;

  /** The server's own failure detail, keeping distinct causes tellable apart */
  const graphQlErrorDetail = (
    responseErrors: readonly { message: string }[] | undefined,
  ) => responseErrors?.[0]?.message ?? null;

  const applyChildAllOfChange = async ({
    childId,
    addRef,
    removeBaseUrl,
    conversions,
  }: {
    childId: VersionedUrl;
    addRef?: VersionedUrl;
    removeBaseUrl: BaseUrl;
    /**
     * New conversions riding the same republish — a type may both change
     * membership and hold a planned conversion, and two updates to one type
     * would race over its next version
     */
    conversions?: Record<BaseUrl, Conversions>;
  }) => {
    const child = resolveDataType(childId);

    if (!child) {
      throw new Error(`Could not find data type ${childId}`);
    }

    const {
      $id,
      $schema: _$schema,
      kind: _kind,
      allOf,
      ...rest
    } = child.schema;

    const nextAllOf = (allOf ?? []).filter(
      ({ $ref }) => extractBaseUrl($ref) !== removeBaseUrl,
    );

    if (addRef) {
      nextAllOf.push({ $ref: addRef });
    }

    // A child losing its only parent must still extend something — fall
    // back to its primitive root, keeping its value type; a union child has
    // no single primitive, so it falls back to the universal Value root
    if (nextAllOf.length === 0) {
      nextAllOf.push({
        $ref:
          primitiveRootRefFor(primitiveTypeFromSchema(child.schema)) ??
          blockProtocolDataTypes.value.dataTypeId,
      });
    }

    const response = await updateDataType({
      variables: {
        dataTypeId: $id,
        dataType: {
          ...rest,
          allOf: nextAllOf.length > 0 ? nextAllOf : undefined,
        },
        conversions: conversions ?? child.metadata.conversions ?? {},
      },
    });

    if (response.errors?.length || !response.data) {
      const detail = graphQlErrorDetail(response.errors);
      throw new Error(
        `Could not update data type ${child.schema.title}${detail ? `: ${detail}` : ""}`,
      );
    }

    onDataTypeSaved(response.data.updateDataType);
  };

  /** Republish another type with new conversions, its schema unchanged */
  const applyConversionsToType = async ({
    baseUrl: conversionsBaseUrl,
    conversions,
  }: {
    baseUrl: BaseUrl;
    conversions: Record<BaseUrl, Conversions>;
  }) => {
    const dataType = latestDataTypes[conversionsBaseUrl];

    if (!dataType) {
      throw new Error(`Could not find data type ${conversionsBaseUrl}`);
    }

    const { $id, $schema: _$schema, kind: _kind, ...rest } = dataType.schema;

    const response = await updateDataType({
      variables: {
        dataTypeId: $id,
        dataType: rest,
        conversions,
      },
    });

    if (response.errors?.length || !response.data) {
      const detail = graphQlErrorDetail(response.errors);
      throw new Error(
        `Could not update conversions on ${dataType.schema.title}${detail ? `: ${detail}` : ""}`,
      );
    }

    onDataTypeSaved(response.data.updateDataType);
  };

  /**
   * A draft's authored conversion rows with the group card's staged edits
   * applied — the rows its creation will plan and place
   */
  const effectiveDraftConversionRows = (draft: StagedDataTypeDraft) => {
    const rows: NonNullable<StagedDataTypeDraft["conversionRows"]> = [];

    for (const row of draft.conversionRows ?? []) {
      const override = groupRowOverrides.get(
        `draft:${draft.versionedUrl}:${row.targetBaseUrl}`,
      );
      if (override === "removed") {
        continue;
      }
      if (override === undefined) {
        rows.push(row);
      } else if (override.value !== null) {
        rows.push({
          targetBaseUrl: row.targetBaseUrl,
          operator: override.operator,
          value: override.value,
        });
      }
    }

    for (const added of newGroupConversionRows) {
      if (
        added.childBaseUrl === draft.baseUrl &&
        added.targetBaseUrl !== null &&
        added.value !== null
      ) {
        rows.push({
          targetBaseUrl: added.targetBaseUrl,
          operator: added.operator,
          value: added.value,
        });
      }

      // A pairing authored from an existing member toward this draft can't be
      // stored there — the draft doesn't exist to reference yet — so it rides
      // the draft instead, inverted to read from the draft's side
      if (
        added.targetBaseUrl === draft.baseUrl &&
        added.childBaseUrl !== null &&
        !draftsByBaseUrl.has(added.childBaseUrl) &&
        added.value !== null
      ) {
        rows.push({
          targetBaseUrl: added.childBaseUrl,
          operator: inverseOperator[added.operator],
          value: added.value,
        });
      }
    }

    return rows;
  };

  /**
   * The group card's edits for the existing members a draft group owns: one
   * entry per touched member, holding its full desired set
   */
  /**
   * A member's stored direct pairings the group card does not display — a
   * hub's own rows are surfaced under its spokes instead. A packed desired
   * set omitting them would read as their removal at replay time, so they
   * ride along verbatim (no card row exists for an edit to key against).
   */
  const hiddenDirectPairings = (
    childBaseUrl: BaseUrl,
  ): NonNullable<StagedDataTypeDraft["conversionRows"]> => {
    const group = conversionGroups.get(childBaseUrl);
    if (!group) {
      return [];
    }
    const shownTargets = new Set(
      groupConversionRows
        .filter((row) => row.childBaseUrl === childBaseUrl)
        .map((row) => row.targetBaseUrl),
    );
    return conversionRowsForViewer({ viewedBaseUrl: childBaseUrl, group })
      .filter(
        (row) =>
          !row.viaCanonical &&
          row.simple != null &&
          !shownTargets.has(row.targetBaseUrl),
      )
      .map((row) => ({
        targetBaseUrl: row.targetBaseUrl,
        operator: row.simple!.operator,
        value: row.simple!.operand,
      }));
  };

  const liveMemberConversionRows = (
    draft: StagedDataTypeDraft,
  ): NonNullable<StagedDataTypeDraft["memberConversionRows"]> =>
    (draft.memberDataTypeIds ?? []).flatMap((memberId) => {
      const childBaseUrl = extractBaseUrl(memberId);
      const touched =
        baseGroupConversionRows.some(
          (row) =>
            row.childBaseUrl === childBaseUrl && groupRowOverrides.has(row.key),
        ) ||
        newGroupConversionRows.some((row) => row.childBaseUrl === childBaseUrl);
      if (!touched) {
        return [];
      }
      return [
        {
          childBaseUrl,
          rows: [
            ...groupConversionRows.flatMap((row) =>
              row.childBaseUrl === childBaseUrl &&
              !row.viaCanonical &&
              !row.formula &&
              row.targetBaseUrl !== null &&
              !draftsByBaseUrl.has(row.targetBaseUrl) &&
              row.value !== null
                ? [
                    {
                      targetBaseUrl: row.targetBaseUrl,
                      operator: row.operator,
                      value: row.value,
                    },
                  ]
                : [],
            ),
            ...hiddenDirectPairings(childBaseUrl),
          ],
        },
      ];
    });

  /**
   * The draft with every conversion edit from this drawer's group card baked
   * in, recursively: its own rows, its nested drafts', and the edits for the
   * existing members it owns. Creation reads only the draft's own fields, so
   * folding must happen wherever a draft leaves this drawer's scope.
   */
  const foldDraftForSave = (
    draft: StagedDataTypeDraft,
  ): StagedDataTypeDraft => {
    const memberRowSets = new Map(
      (draft.memberConversionRows ?? []).map((entry) => [
        entry.childBaseUrl,
        entry.rows,
      ]),
    );
    // Edits made in this drawer supersede ones packed by a nested drawer
    for (const entry of liveMemberConversionRows(draft)) {
      memberRowSets.set(entry.childBaseUrl, entry.rows);
    }

    const memberConversionRows = [...memberRowSets.entries()].map(
      ([childBaseUrl, rows]) => ({ childBaseUrl, rows }),
    );

    return {
      ...draft,
      conversionRows: effectiveDraftConversionRows(draft),
      ...(memberConversionRows.length > 0
        ? { memberConversionRows }
        : { memberConversionRows: undefined }),
      ...(draft.memberDrafts
        ? { memberDrafts: draft.memberDrafts.map(foldDraftForSave) }
        : {}),
    };
  };

  /**
   * Create a type staged in the stacked drawer. With a group ref — available
   * once the group exists at a saved version — the new type joins it;
   * without one it stands alone on the parents it was authored with. Its
   * conversions are planned now, against the live data — the draft must
   * arrive folded (`foldDraftForSave`), since only its own fields are read.
   */
  const createStagedMember = async (
    draft: StagedDataTypeDraft,
    groupRef?: VersionedUrl,
  ) => {
    if (!activeWorkspaceWebId) {
      throw new Error("No active workspace");
    }

    const conversionRowsForDraft = draft.conversionRows ?? [];
    let ownConversions: Record<BaseUrl, Conversions> | undefined;
    let relatedConversionUpdates: Array<{
      baseUrl: BaseUrl;
      conversions: Record<BaseUrl, Conversions>;
    }> = [];

    if (conversionRowsForDraft.length > 0) {
      const plan = planConversionUpdates({
        viewedBaseUrl: draft.baseUrl,
        desiredRows: conversionRowsForDraft.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          simple: { operator: row.operator, operand: row.value },
        })),
        initialRows: [],
        latestDataTypes,
        canWriteTo: (writeBaseUrl) =>
          writeBaseUrl === draft.baseUrl || canEditByBaseUrl(writeBaseUrl),
      });
      if (plan.unplacedTargets.length > 0) {
        throw new Error(
          `Conversions on ${draft.dataType.title} can't be stored — they would join or merge conversion groups you don't have permission to update`,
        );
      }
      ownConversions = plan.updates.find(
        (update) => update.baseUrl === draft.baseUrl,
      )?.conversions;
      relatedConversionUpdates = plan.updates.filter(
        (update) => update.baseUrl !== draft.baseUrl,
      );
    }

    const response = await createDataType({
      variables: {
        webId: activeWorkspaceWebId,
        dataType: groupRef
          ? {
              ...draft.dataType,
              allOf: [...(draft.dataType.allOf ?? []), { $ref: groupRef }],
            }
          : draft.dataType,
        conversions: ownConversions,
      },
    });

    if (response.errors?.length || !response.data) {
      const detail = graphQlErrorDetail(response.errors);
      throw new Error(
        `Could not create data type ${draft.dataType.title}${detail ? `: ${detail}` : ""}`,
      );
    }

    // A staged group's members follow once a saved version exists to
    // reference: existing types republish to extend it, draft members are
    // created recursively — nesting to any depth. Conversions the plan
    // stores on other types land alongside.
    const created = response.data.createDataType;
    onDataTypeSaved(created);

    // Group-card conversion edits packed for existing members: each member is
    // planned as its own viewer against its saved rows, and its own entry
    // rides the membership republish so one type gets one update
    const memberConversionUpdates = new Map<
      BaseUrl,
      Record<BaseUrl, Conversions>
    >();
    for (const { childBaseUrl, rows } of draft.memberConversionRows ?? []) {
      const memberGroup =
        buildConversionGroups(latestDataTypes).get(childBaseUrl);
      const memberInitialRows = memberGroup
        ? conversionRowsForViewer({
            viewedBaseUrl: childBaseUrl,
            group: memberGroup,
          }).filter((row) => !row.viaCanonical && row.simple != null)
        : [];

      const plan = planConversionUpdates({
        viewedBaseUrl: childBaseUrl,
        desiredRows: rows.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          simple: { operator: row.operator, operand: row.value },
        })),
        initialRows: memberInitialRows,
        latestDataTypes,
        canWriteTo: canEditByBaseUrl,
      });
      if (plan.unplacedTargets.length > 0) {
        throw new Error(
          `Conversions on ${resolveConversionTitle(childBaseUrl)} can't be stored — they would join or merge conversion groups you don't have permission to update`,
        );
      }
      for (const update of plan.updates) {
        memberConversionUpdates.set(update.baseUrl, update.conversions);
      }
    }
    const takeMemberConversions = (baseUrl: BaseUrl) => {
      const conversions = memberConversionUpdates.get(baseUrl);
      memberConversionUpdates.delete(baseUrl);
      return conversions;
    };

    // Draft members first, in conversion-dependency order — their pairings
    // may reference one another, and the store requires targets to exist
    for (const memberDraft of orderDraftsByConversionDependencies(
      draft.memberDrafts ?? [],
    )) {
      await createStagedMember(memberDraft, created.schema.$id);
    }

    if (
      draft.memberDataTypeIds?.length ||
      relatedConversionUpdates.length > 0 ||
      memberConversionUpdates.size > 0
    ) {
      await Promise.all([
        ...(draft.memberDataTypeIds ?? []).map((memberId) =>
          applyChildAllOfChange({
            childId: memberId,
            addRef: created.schema.$id,
            removeBaseUrl: draft.baseUrl,
            conversions: takeMemberConversions(extractBaseUrl(memberId)),
          }),
        ),
        ...relatedConversionUpdates.map(({ baseUrl, conversions }) =>
          applyConversionsToType({ baseUrl, conversions }),
        ),
        ...[...memberConversionUpdates.entries()].map(
          ([baseUrl, conversions]) =>
            applyConversionsToType({ baseUrl, conversions }),
        ),
      ]);
    }
  };

  /**
   * Keep: the staged types outlive the abandoned edit, standalone. Drafts
   * that were created leave the staged list even when others fail — a retry
   * must only attempt the failures, not collide with its own successes.
   */
  const keepAbandonedDrafts = async () => {
    setKeepingDrafts(true);
    setKeepDraftsError(null);

    // Sequential and dependency-ordered: a draft's conversions may reference
    // a sibling draft, which must exist first
    const kept = orderDraftsByConversionDependencies(
      draftsAtStake.map(foldDraftForSave),
    );
    const keptUrls = new Set(kept.map((draft) => draft.versionedUrl));
    const failures: Array<{ draft: StagedDataTypeDraft; reason: unknown }> = [];
    for (const draft of kept) {
      try {
        await createStagedMember(draft);
      } catch (reason) {
        failures.push({ draft, reason });
      }
    }

    const failedUrls = new Set(failures.map(({ draft }) => draft.versionedUrl));

    if (failedUrls.size < kept.length) {
      setStagedMemberDrafts((previous) =>
        previous.filter(
          (draft) =>
            failedUrls.has(draft.versionedUrl) ||
            parentHeldDraftUrls.current.has(draft.versionedUrl) ||
            !keptUrls.has(draft.versionedUrl),
        ),
      );
      await refetchAllDataTypes();
    }

    setKeepingDrafts(false);

    if (failures.length === 0) {
      if (pendingAllowedTypes) {
        applyAllowedTypesChange(pendingAllowedTypes);
        setPendingAllowedTypes(null);
        setAbandonDraftsDialogOpen(false);
        return;
      }
      finishClose();
      return;
    }

    const reason = failures[0]?.reason;
    setKeepDraftsError(
      reason instanceof Error
        ? reason.message
        : "Could not create the new data types",
    );
  };

  /**
   * Discard the drafts at stake: the held allowed-types change applies (its
   * draft filter drops them), or — closing — the drawer finishes closing.
   */
  const discardDraftsAtStake = () => {
    if (pendingAllowedTypes) {
      applyAllowedTypesChange(pendingAllowedTypes);
      setPendingAllowedTypes(null);
      setAbandonDraftsDialogOpen(false);
      setKeepDraftsError(null);
      return;
    }
    finishClose();
  };

  /**
   * The staged conversion rows in the single-step form the planner takes.
   * Rows a staged change invalidated (the type leaving number, a new group)
   * are dropped here, so the plan removes their stored pairings on save —
   * the rows themselves stay staged, surviving a reverted change.
   */
  const desiredConversionRows = () => {
    if (!conversionsApplicable) {
      return [];
    }

    // Zero steps stay in: an authored one is rejected by validation before
    // any plan executes, while one stored on a foreign type must round-trip
    // as a no-op — dropping it would plan its removal from that type, an
    // update its owner never asked for and this user may not be allowed to
    // make, failing an otherwise unrelated save
    return conversionRows
      .filter((row) => !row.viaCanonical && !row.formula)
      .flatMap((row) =>
        row.targetBaseUrl !== null && row.value !== null
          ? [
              {
                targetBaseUrl: row.targetBaseUrl,
                simple: { operator: row.operator, operand: row.value },
              },
            ]
          : [],
      );
  };

  const plannableInitialConversionRows = () =>
    initialConversionRows.filter(
      (row) => !row.viaCanonical && (row.factor !== null || row.simple != null),
    );

  /** The staged value label, or undefined when both sides are empty */
  const stagedLabel = () => {
    const left = labelLeft.trim();
    const right = labelRight.trim();

    if (!left && !right) {
      return undefined;
    }
    return {
      ...(left ? { left } : {}),
      ...(right ? { right } : {}),
    };
  };

  /**
   * The staged edit resolved against the saved type: the rebuilt fields the
   * update takes, and whether the edited type itself must be republished as
   * a new version. Membership-only changes and conversions the plan stores
   * on other types republish those types instead, leaving the edited type
   * at its current version — the footer's save label reads this to promise
   * a new version only when one is coming.
   */
  const deriveStagedEdit = (edited: DataTypeWithMetadata) => {
    const originalSchema = edited.schema;
    const editedBaseUrl = edited.metadata.recordId.baseUrl;

    const originalParentIds = (originalSchema.allOf ?? [])
      .map(({ $ref }) => $ref)
      .filter((id) => extractBaseUrl(id) !== listDataTypeBaseUrl);
    // The editor hides a group's primitive-root parent — ungrouping
    // entirely must resurface it, or the type would be written parentless
    const hiddenParentIds = !initialEntries.some(
      (entry) => entry.relation === "parent",
    )
      ? originalParentIds
      : [];

    // The synthesized group root only replaces the stored parents when the
    // user actually changed membership: it derives from the members' public
    // ancestry, so recomputing it on an unrelated edit would let changes in
    // other webs' types (or a stranger extending this one) silently swap
    // what this type extends
    const initialChildBaseUrls = new Set(
      initialEntries
        .filter((entry): entry is ReferenceEntry => entry.relation === "child")
        .map((entry) => extractBaseUrl(entry.dataTypeId)),
    );
    const membershipChanged =
      childEntries.length !== initialChildBaseUrls.size ||
      childEntries.some(
        (entry) => !initialChildBaseUrls.has(extractBaseUrl(entry.dataTypeId)),
      );

    const stagedParentIds = parentEntries.map(({ dataTypeId }) => dataTypeId);
    const initialParentEntryIds = initialEntries.flatMap((entry) =>
      entry.relation === "parent" ? [entry.dataTypeId] : [],
    );
    const parentEntriesEdited =
      stagedParentIds.length !== initialParentEntryIds.length ||
      stagedParentIds.some((id, index) => initialParentEntryIds[index] !== id);

    // A group's synthesized root is hidden from the entries but stored:
    // untouched parents must round-trip verbatim, so unrelated edits can't
    // rewrite what the type extends. A membership change re-derives the
    // root from the members instead, and an edit of the parent entries
    // themselves writes exactly what they say.
    const droppedOriginalParentIds = originalParentIds.filter(
      (id) =>
        !initialEntries.some(
          (entry) => entry.relation === "parent" && entry.dataTypeId === id,
        ),
    );

    const nextParentIds =
      !parentEntriesEdited && !membershipChanged
        ? originalParentIds
        : parentEntries.length > 0
          ? [
              ...stagedParentIds,
              ...(membershipChanged ? [] : droppedOriginalParentIds),
            ]
          : groupRootRef
            ? [groupRootRef]
            : hiddenParentIds;

    const parentsChanged =
      originalParentIds.length !== nextParentIds.length ||
      originalParentIds.some((id, index) => nextParentIds[index] !== id);

    const initialListEntries = initialEntries.filter(
      (entry): entry is ListEntry => entry.relation === "list",
    );
    const listArmsOf = (entries: ListEntry[]) =>
      JSON.stringify(
        entries.map((entry) => arraySchemaFromListConfig(entry.config)),
      );
    const listsChanged =
      listArmsOf(listEntries) !== listArmsOf(initialListEntries);

    const constraintsChanged =
      constraintPrimitive !== null &&
      JSON.stringify(ownConstraintsPart) !==
        JSON.stringify(
          schemaConstraintsFromValues({
            primitive: constraintPrimitive,
            activeKinds: initialConstraintState.activeKinds,
            values: initialConstraintState.values,
          }),
        );

    // Abstract is sticky on edit: a concrete type keeps taking values
    // even when other types extend it (flipping would break its
    // existing values), and a group stays abstract while it has members.
    // Removing a group's every member ends the group — the type takes
    // values again — while a type abstract without members stays so.
    const originalAbstract = originalSchema.abstract === true;
    const hadInitialChildren = initialEntries.some(
      (entry) => entry.relation === "child",
    );
    const nextAbstract =
      originalAbstract && (childEntries.length > 0 || !hadInitialChildren);
    const abstractChanged = nextAbstract !== originalAbstract;

    // The value label passes through untouched when the appearance card
    // is hidden
    const nextLabel = appearanceApplicable
      ? stagedLabel()
      : originalSchema.label;
    const labelChanged =
      appearanceApplicable &&
      ((originalSchema.label?.left ?? "") !== labelLeft.trim() ||
        (originalSchema.label?.right ?? "") !== labelRight.trim());

    // Composed rows the user removed (confirmed via dialog): their targets
    // are severed from the group. A new row re-targeting the member keys
    // differently, so a confirmed severing survives a re-add.
    const removedComposedTargets = initialConversionRows
      .filter((row) => row.viaCanonical)
      .map((row) => row.targetBaseUrl)
      .filter(
        (targetBaseUrl) =>
          !conversionRows.some((row) => row.key === targetBaseUrl),
      );

    // Planned unconditionally: when conversions stopped applying (e.g.
    // the value type left number), the cleared rows must still remove
    // their stored pairings
    const conversionPlan = planConversionUpdates({
      viewedBaseUrl: editedBaseUrl,
      desiredRows: desiredConversionRows(),
      initialRows: plannableInitialConversionRows(),
      removedComposedTargets,
      latestDataTypes,
      canWriteTo: (baseUrl) =>
        baseUrl === editedBaseUrl || canEditByBaseUrl(baseUrl),
    });
    const ownConversionsEntry = conversionPlan.updates.find(
      (entry) => entry.baseUrl === editedBaseUrl,
    );

    const republishesEditedType =
      title.trim() !== originalSchema.title ||
      titlePlural.trim() !== (originalSchema.titlePlural ?? "") ||
      description.trim() !== originalSchema.description ||
      parentsChanged ||
      listsChanged ||
      constraintsChanged ||
      abstractChanged ||
      labelChanged ||
      ownConversionsEntry !== undefined;

    return {
      originalSchema,
      editedBaseUrl,
      nextParentIds,
      parentsChanged,
      initialListEntries,
      nextAbstract,
      nextLabel,
      conversionPlan,
      ownConversionsEntry,
      republishesEditedType,
    };
  };

  const stagedEdit = editedDataType ? deriveStagedEdit(editedDataType) : null;

  const handleSubmit = async () => {
    if (readonly) {
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    const nextErrors: FormErrors = {};

    if (!trimmedTitle) {
      nextErrors.title = "Please enter a name";
    }
    if (!trimmedDescription) {
      nextErrors.description = "Please enter a description";
    }
    if (allowedTypes.length === 0) {
      nextErrors.allowedTypes = "Select at least one type";
    }

    // An edited type that extended something must keep a parent or list —
    // except a group, which is deliberately parentless: its members extend
    // it, and its own arm is just their shared primitive
    const initiallyExtends = initialEntries.some(
      (entry) => entry.relation === "parent" || entry.relation === "list",
    );

    if (
      !hasGroupEntry &&
      (!editedDataType ? childEntries.length === 0 : initiallyExtends) &&
      allowedTypes.length > 0 &&
      !parentEntries.length &&
      !listEntries.length
    ) {
      nextErrors.allowedTypes = "Select the type this data type extends";
    }

    // Membership rules bind staged changes only: a foreign type extending
    // this group arrives in the member list automatically, and its owner may
    // lack permission to detach it — it must not block unrelated saves
    const initialChildBaseUrlSet = new Set(
      initialEntries
        .filter((entry): entry is ReferenceEntry => entry.relation === "child")
        .map((entry) => extractBaseUrl(entry.dataTypeId)),
    );
    const groupMembershipChanged =
      childEntries.length !== initialChildBaseUrlSet.size ||
      childEntries.some(
        (entry) =>
          !initialChildBaseUrlSet.has(extractBaseUrl(entry.dataTypeId)),
      );

    if (
      (!editedDataType || groupMembershipChanged) &&
      hasGroupEntry &&
      childEntries.length === 0
    ) {
      nextErrors.groupMembers = "Add the data types that belong to this group";
    }

    // Create mode's children are group members; in edit mode that holds only
    // with a group entry — otherwise children are extended-by types, where
    // mixed primitives and list arms are legitimate
    if (
      (!editedDataType || (hasGroupEntry && groupMembershipChanged)) &&
      childEntries.length > 0
    ) {
      if (listEntries.length > 0) {
        nextErrors.allowedTypes =
          "A group can't include list types — remove the list or the extra types";
      } else if (childEntryPrimitive === null) {
        nextErrors.groupMembers = "The grouped types must share one value type";
      }
    }

    // Mirrors the picker rule: the graph intersects every parent's
    // constraints with each value arm, so a parent not admitting arrays
    // would strip the list alternatives from the closed type
    if (listEntries.length > 0 && parentEntries.length > 0) {
      const conflictingTitles = parentEntries
        .filter(({ dataTypeId }) => {
          if (resolveParentPrimitive(dataTypeId)?.primitive === "array") {
            return false;
          }
          return !resolveParentUnionArms(dataTypeId)?.some(
            (arm) => arm.type === "array",
          );
        })
        .map(
          ({ dataTypeId }) =>
            resolveDataType(dataTypeId)?.schema.title ?? "the extended type",
        );

      if (conflictingTitles.length > 0) {
        nextErrors.allowedTypes = `Lists can't be combined with ${summarizeTypeTitles(conflictingTitles)}`;
      }
    }

    // Nothing is a multiple of zero, so the constraint would reject every
    // value. Zero stays typable in the row (it's on the way to "0.x" and
    // "-0.x") and is caught here instead.
    if (
      constraintPrimitive === "number" &&
      constraintState.activeKinds.includes("multipleOf") &&
      constraintState.values.multipleOf === 0
    ) {
      nextErrors.constraints = "Multiple of can't be zero";
    }

    // The bound inputs clamp into the inherited range, but nothing stops a
    // staged pair disagreeing with itself — a range no value satisfies.
    // Gated to edited constraints: a stored type may already carry such a
    // pair, which must not block unrelated saves.
    if (!nextErrors.constraints && constraintState !== initialConstraintState) {
      const { activeKinds, values } = constraintState;
      const boundsConflict =
        activeKinds.includes("minimum") && activeKinds.includes("maximum")
          ? numericBoundsConflict(values.minimum, values.maximum)
          : null;

      if (boundsConflict === "exceeds") {
        nextErrors.constraints = "Minimum can't be greater than maximum";
      } else if (boundsConflict === "exclusiveEqual") {
        nextErrors.constraints =
          "Equal minimum and maximum must both be inclusive to allow a value";
      } else if (
        activeKinds.includes("minLength") &&
        activeKinds.includes("maxLength") &&
        countBoundsConflict(values.minLength, values.maxLength)
      ) {
        nextErrors.constraints =
          "Minimum length can't be greater than maximum length";
      } else if (
        activeKinds.includes("minItems") &&
        activeKinds.includes("maxItems") &&
        countBoundsConflict(values.minItems, values.maxItems)
      ) {
        nextErrors.constraints =
          "Minimum items can't be greater than maximum items";
      }
    }

    // Committed permitted values can fall outside inherited constraints when
    // the parent changes — the graph silently drops them at closure, so the
    // save waits until they're removed. Gated to edited constraints/parents:
    // a stored type may carry already-dropped values, which must not block
    // unrelated saves.
    const enumValues = constraintState.values.enum;
    if (
      !nextErrors.constraints &&
      enumValues &&
      constraintState.activeKinds.includes("enum") &&
      (constraintState !== initialConstraintState ||
        allowedTypes !== initialEntries) &&
      !enumValues.every((value) =>
        satisfiesInherited(value, inheritedConstraints.values),
      )
    ) {
      nextErrors.constraints =
        "Some permitted values fall outside the inherited constraints — remove them before saving";
    }

    // The same rule for list items, whose constraints bake into the entry's
    // config as they are edited
    const listItemSchemas = listEntries.flatMap((entry) =>
      entry.config.shape === "fixed"
        ? entry.config.elements.flatMap((element) =>
            element.sourceItem ? [element.sourceItem] : [],
          )
        : entry.config.sourceItems
          ? [entry.config.sourceItems]
          : [],
    );
    if (
      !nextErrors.allowedTypes &&
      listItemSchemas.some(
        (item) => constraintValuesFromSchema(item).multipleOf === 0,
      )
    ) {
      nextErrors.allowedTypes =
        "A list item's multiple-of constraint can't be zero";
    }

    if (
      !nextErrors.allowedTypes &&
      listItemSchemas.some((item) => {
        const itemValues = constraintValuesFromSchema(item);
        return (
          numericBoundsConflict(itemValues.minimum, itemValues.maximum) !==
            null ||
          countBoundsConflict(itemValues.minLength, itemValues.maxLength)
        );
      })
    ) {
      nextErrors.allowedTypes =
        "A list item's minimum can't be greater than its maximum";
    }

    // Scaling by zero collapses every value and its inverse divides by zero
    const zeroStep = (operator: ConversionOperator, value: number | null) =>
      value === 0 && (operator === "*" || operator === "/");

    // Only rows the user authored or changed are validated: an incoming
    // pairing stored on a foreign type can carry a zero step the owner can
    // neither edit nor remove, and it must not block unrelated saves (the
    // planner already treats unchanged rows as no-ops)
    const changedSingleRows = (
      conversionsApplicable
        ? conversionRows.filter((row) => !row.viaCanonical && !row.formula)
        : []
    ).filter((row) => {
      const initial = initialFormState.conversionRows.find(
        (initialRow) => initialRow.key === row.key,
      );
      return (
        !initial ||
        initial.operator !== row.operator ||
        initial.value !== row.value ||
        initial.targetBaseUrl !== row.targetBaseUrl
      );
    });
    const stagedGroupRows = groupConversionsApplicable
      ? groupConversionRows.filter(
          (row) =>
            !row.viaCanonical &&
            !row.formula &&
            (row.key.startsWith("new-") || groupRowOverrides.has(row.key)),
        )
      : [];

    // Zero steps would otherwise be written as a divide-by-zero inverse
    // pair, and incomplete rows are the ones desiredConversionRows silently
    // drops. Rows left after the card stopped applying are cleared
    // deliberately (warned on the change).
    const zeroStepRows = [...changedSingleRows, ...stagedGroupRows].filter(
      (row) => zeroStep(row.operator, row.value),
    );

    if (zeroStepRows.some((row) => row.operator === "/")) {
      nextErrors.conversions = "A conversion can’t divide by zero";
    } else if (zeroStepRows.length > 0) {
      nextErrors.conversions = "A conversion can’t multiply by zero";
    } else if (
      changedSingleRows.some(
        (row) => row.targetBaseUrl === null || row.value === null,
      ) ||
      stagedGroupRows.some(
        (row) =>
          row.childBaseUrl === null ||
          row.targetBaseUrl === null ||
          row.value === null,
      )
    ) {
      nextErrors.conversions = "Complete or remove the unfinished conversion";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      if (!editedDataType) {
        if (!activeWorkspaceWebId) {
          throw new Error("No active workspace");
        }

        const { baseUrl: newBaseUrl, versionedUrl } = generateTypeUrlsForUser({
          kind: "data-type",
          title: trimmedTitle,
          version: makeOntologyTypeVersion({ major: 1 }),
        });

        const existing = await queryDataTypes({
          variables: {
            request: {
              filter: {
                equal: [
                  { path: ["versionedUrl"] },
                  { parameter: versionedUrl },
                ],
              },
              // The full transaction-time axis also surfaces archived types,
              // whose base URLs still occupy the store
              temporalAxes: fullTransactionTimeAxis,
            },
          },
        });

        if (
          existing.data?.queryDataTypes.dataTypes.length ||
          unavailableTypeUrls?.has(versionedUrl) ||
          // A staged draft sharing this name — at any nesting depth — would
          // mint the same URL: the earlier creation would succeed and the
          // later one collide mid-save
          collectDraftUrls(stagedMemberDrafts, null).includes(versionedUrl)
        ) {
          setErrors({
            title: "A data type with this name already exists in this web",
          });
          return;
        }

        const primary = parentEntries[0];
        let primitive: SingleValueConstraints["type"] | null = null;

        if (primary) {
          const parentInfo = resolveParentPrimitive(primary.dataTypeId);

          if (!parentInfo) {
            throw new Error(`Could not find data type ${primary.dataTypeId}`);
          }

          primitive = parentInfo.primitive;
          if (primitive === null) {
            // A union-typed parent offers no single value type for a child
            // to take, and the graph requires a concrete type to state one
            const parentSchema = resolveDataType(primary.dataTypeId)?.schema;
            if (parentSchema && "anyOf" in parentSchema) {
              setErrors({
                allowedTypes: `“${parentSchema.title}” allows several kinds of value — extend a type with a single value type instead.`,
              });
              return;
            }
          }
        } else if (childEntries.length > 0) {
          // A parentless group: the bare member primitive is its whole arm —
          // the group constrains values to membership, nothing more
          primitive = childEntryPrimitive;
        }

        const dataTypePayload: ConstructDataTypeParams = {
          ...buildOwnConstraints({
            primitive,
            listEntries,
            constraintsPart: ownConstraintsPart,
          }),
          title: trimmedTitle,
          titlePlural: titlePlural.trim() || undefined,
          description: trimmedDescription,
          abstract: childEntries.length > 0,
          label: appearanceApplicable ? stagedLabel() : undefined,
          allOf:
            parentEntries.length > 0
              ? parentEntries.map(({ dataTypeId }) => ({
                  $ref: dataTypeId,
                }))
              : listEntries.length > 0
                ? [{ $ref: listDataTypeId }]
                : groupRootRef
                  ? [{ $ref: groupRootRef }]
                  : undefined,
        };

        // The graph requires a concrete type to state a single `type` — only
        // an abstract type (a group) may combine several through `anyOf`
        if ("anyOf" in dataTypePayload && !dataTypePayload.abstract) {
          setErrors({
            allowedTypes:
              "A data type must accept a single kind of value — only a group can combine several. Remove the extra list entries or types.",
          });
          return;
        }

        // Staged: the definition goes to the parent drawer, which creates it
        // on its own save — nothing is written here. Members that are
        // themselves drafts travel inside the definition, nesting
        // arbitrarily, and authored conversions travel as rows for the
        // creation-time plan.
        if (stageDraft) {
          const memberIds: VersionedUrl[] = [];
          const memberDrafts: StagedDataTypeDraft[] = [];
          for (const entry of childEntries) {
            const memberDraft = stagedDrafts.byUrl.get(entry.dataTypeId);
            if (memberDraft) {
              // Folded now, recursively: the root save creates the draft
              // from this copy, without this drawer's group-card overrides
              // in scope
              memberDrafts.push(foldDraftForSave(memberDraft));
            } else {
              memberIds.push(entry.dataTypeId);
            }
          }

          const draftConversionRows = desiredConversionRows().map((row) => ({
            targetBaseUrl: row.targetBaseUrl,
            operator: row.simple.operator,
            value: row.simple.operand,
          }));

          // Group-card edits for existing members travel per member, as that
          // member's full desired set — planned when the group is created.
          // Members owned by a nested draft group already left inside its
          // fold above.
          const memberConversionRows = groupConversionChildren.flatMap(
            (childBaseUrl) => {
              if (
                draftsByBaseUrl.has(childBaseUrl) ||
                draftOwnedMemberBases.has(childBaseUrl)
              ) {
                return [];
              }
              const touched =
                baseGroupConversionRows.some(
                  (row) =>
                    row.childBaseUrl === childBaseUrl &&
                    groupRowOverrides.has(row.key),
                ) ||
                newGroupConversionRows.some(
                  (row) => row.childBaseUrl === childBaseUrl,
                );
              if (!touched) {
                return [];
              }
              return [
                {
                  childBaseUrl,
                  rows: [
                    ...groupConversionRows.flatMap((row) =>
                      row.childBaseUrl === childBaseUrl &&
                      !row.viaCanonical &&
                      !row.formula &&
                      row.targetBaseUrl !== null &&
                      !draftsByBaseUrl.has(row.targetBaseUrl) &&
                      row.value !== null
                        ? [
                            {
                              targetBaseUrl: row.targetBaseUrl,
                              operator: row.operator,
                              value: row.value,
                            },
                          ]
                        : [],
                    ),
                    ...hiddenDirectPairings(childBaseUrl),
                  ],
                },
              ];
            },
          );

          stageDraft({
            baseUrl: newBaseUrl,
            versionedUrl,
            dataType: dataTypePayload,
            ...(memberIds.length > 0 ? { memberDataTypeIds: memberIds } : {}),
            ...(memberDrafts.length > 0 ? { memberDrafts } : {}),
            ...(draftConversionRows.length > 0
              ? { conversionRows: draftConversionRows }
              : {}),
            ...(memberConversionRows.length > 0
              ? { memberConversionRows }
              : {}),
          });
          return;
        }

        // Planned unconditionally: when conversions stopped applying (e.g.
        // the value type left number), the cleared rows must still remove
        // their stored pairings
        const conversionPlan = planConversionUpdates({
          viewedBaseUrl: newBaseUrl,
          desiredRows: desiredConversionRows(),
          initialRows: plannableInitialConversionRows(),
          latestDataTypes,
          canWriteTo: (baseUrl) =>
            baseUrl === newBaseUrl || canEditByBaseUrl(baseUrl),
        });
        if (conversionPlan.unplacedTargets.length > 0) {
          setErrors({
            conversions: unplacedConversionsError(
              conversionPlan.unplacedTargets,
            ),
          });
          return;
        }

        const groupConversionPlan = planGroupConversionUpdates();
        if (groupConversionPlan.unplacedTargets.length > 0) {
          setErrors({
            conversions: unplacedConversionsError(
              groupConversionPlan.unplacedTargets,
            ),
          });
          return;
        }
        if (groupConversionPlan.conflictBaseUrls.length > 0) {
          setErrors({
            conversions: conflictingConversionsError(
              groupConversionPlan.conflictBaseUrls,
            ),
          });
          return;
        }

        const ownConversions = conversionPlan.updates.find(
          (entry) => entry.baseUrl === newBaseUrl,
        )?.conversions;

        const response = await createDataType({
          variables: {
            webId: activeWorkspaceWebId,
            dataType: dataTypePayload,
            conversions: ownConversions,
          },
        });

        if (response.errors?.length || !response.data) {
          throw new Error(
            graphQlErrorDetail(response.errors) ?? "Could not create data type",
          );
        }

        const created = response.data.createDataType;
        onDataTypeSaved(created);

        // A type both joining the group and holding a planned conversion
        // gets one combined republish — two updates would race its version
        const pendingConversionUpdates = new Map([
          ...conversionPlan.updates
            .filter((entry) => entry.baseUrl !== newBaseUrl)
            .map((entry) => [entry.baseUrl, entry.conversions] as const),
          ...groupConversionPlan.updates.map(
            (entry) => [entry.baseUrl, entry.conversions] as const,
          ),
        ]);
        const takeConversionsFor = (baseUrl: BaseUrl) => {
          const conversions = pendingConversionUpdates.get(baseUrl);
          pendingConversionUpdates.delete(baseUrl);
          return conversions;
        };

        try {
          // Drafts first, in conversion-dependency order: other members'
          // pairings may reference them, and the store requires conversion
          // targets to exist
          for (const draft of orderDraftsByConversionDependencies(
            childEntries.flatMap((entry) => {
              const memberDraft = stagedDrafts.byUrl.get(entry.dataTypeId);
              return memberDraft ? [foldDraftForSave(memberDraft)] : [];
            }),
          )) {
            await createStagedMember(draft, created.schema.$id);
          }

          await Promise.all([
            ...childEntries
              .filter((entry) => !stagedDrafts.byUrl.has(entry.dataTypeId))
              .map(({ dataTypeId }) =>
                applyChildAllOfChange({
                  childId: dataTypeId,
                  addRef: created.schema.$id,
                  removeBaseUrl: created.metadata.recordId.baseUrl,
                  conversions: takeConversionsFor(extractBaseUrl(dataTypeId)),
                }),
              ),
            ...[...pendingConversionUpdates.entries()].map(
              ([baseUrl, conversions]) =>
                applyConversionsToType({ baseUrl, conversions }),
            ),
          ]);
        } catch (error) {
          // The type exists now, so pressing Create again would only hit the
          // name-collision check — surface the real state instead
          void refetchAllDataTypes();
          throw new Error(
            `“${trimmedTitle}” was created, but updating its related types failed${
              error instanceof Error ? `: ${error.message}` : ""
            }. Close this drawer and edit “${trimmedTitle}” to finish the remaining changes.`,
          );
        }

        await refetchAllDataTypes();
        onSaved(created);
      } else {
        const {
          originalSchema,
          editedBaseUrl,
          nextParentIds,
          parentsChanged,
          initialListEntries,
          nextAbstract,
          nextLabel,
          conversionPlan,
          ownConversionsEntry,
          republishesEditedType,
        } = deriveStagedEdit(editedDataType);

        if (conversionPlan.unplacedTargets.length > 0) {
          setErrors({
            conversions: unplacedConversionsError(
              conversionPlan.unplacedTargets,
            ),
          });
          return;
        }

        if (conversionPlan.unremovableTargets.length > 0) {
          setErrors({
            conversions: unremovableConversionsError(
              conversionPlan.unremovableTargets,
            ),
          });
          return;
        }

        const groupConversionPlan = planGroupConversionUpdates();
        if (groupConversionPlan.unplacedTargets.length > 0) {
          setErrors({
            conversions: unplacedConversionsError(
              groupConversionPlan.unplacedTargets,
            ),
          });
          return;
        }
        if (groupConversionPlan.conflictBaseUrls.length > 0) {
          setErrors({
            conversions: conflictingConversionsError(
              groupConversionPlan.conflictBaseUrls,
            ),
          });
          return;
        }

        let latest = editedDataType;

        if (republishesEditedType) {
          const {
            $id: _$id,
            $schema: _$schema,
            kind: _kind,
            allOf: _allOf,
            title: _title,
            titlePlural: _titlePlural,
            icon,
            description: _description,
            label: _label,
            abstract: _abstract,
            ...constraints
          } = originalSchema;

          const oldPrimitive = primitiveTypeFromSchema(originalSchema);
          const newParentInfo = nextParentIds[0]
            ? resolveParentPrimitive(nextParentIds[0])
            : null;
          const newPrimitive = newParentInfo?.primitive ?? null;

          // A legacy union type can't be republished concrete — the graph
          // requires a single `type` — so the save stops with the real
          // reason rather than mirroring arms it would reject
          if ("anyOf" in originalSchema && !nextAbstract) {
            setErrors({
              allowedTypes:
                "This type allows several kinds of value, which can no longer be saved — reduce it to a single value type before republishing.",
            });
            return;
          }

          // Likewise a newly picked union-typed parent
          if (parentsChanged && newPrimitive === null && nextParentIds[0]) {
            const parentSchema = resolveDataType(nextParentIds[0])?.schema;
            if (parentSchema && "anyOf" in parentSchema) {
              setErrors({
                allowedTypes: `“${parentSchema.title}” allows several kinds of value — extend a type with a single value type instead.`,
              });
              return;
            }
          }

          const keepConstraints =
            !parentsChanged ||
            newPrimitive === null ||
            newPrimitive === oldPrimitive;

          const constraintsPart =
            listEntries.length > 0 || initialListEntries.length > 0
              ? buildOwnConstraints({
                  primitive: newPrimitive,
                  listEntries,
                  constraintsPart: ownConstraintsPart,
                })
              : constraintPrimitive !== null
                ? ({
                    type: constraintPrimitive,
                    ...ownConstraintsPart,
                  } as SingleValueSchema)
                : keepConstraints
                  ? constraints
                  : { type: newPrimitive as "boolean" };

          // The graph requires a concrete type to state a single `type` —
          // only an abstract type (a group) may combine several through
          // `anyOf`. This also catches legacy union types, which can't be
          // republished until reduced to one value type.
          if ("anyOf" in constraintsPart && !nextAbstract) {
            setErrors({
              allowedTypes:
                "A data type must accept a single kind of value — only a group can combine several. Remove the extra list entries or types.",
            });
            return;
          }

          const response = await updateDataType({
            variables: {
              dataTypeId: originalSchema.$id,
              dataType: {
                ...constraintsPart,
                title: trimmedTitle,
                titlePlural: titlePlural.trim() || undefined,
                icon,
                description: trimmedDescription,
                label: nextLabel,
                abstract: nextAbstract,
                allOf:
                  nextParentIds.length > 0
                    ? nextParentIds.map(($ref) => ({ $ref }))
                    : listEntries.length > 0
                      ? [{ $ref: listDataTypeId }]
                      : undefined,
              },
              conversions:
                ownConversionsEntry?.conversions ??
                editedDataType.metadata.conversions ??
                {},
            },
          });

          if (response.errors?.length || !response.data) {
            throw new Error(
              graphQlErrorDetail(response.errors) ??
                "Could not update data type",
            );
          }

          latest = response.data.updateDataType;
          onDataTypeSaved(latest);
        }

        const initialChildEntries = initialEntries.filter(
          (entry): entry is ReferenceEntry => entry.relation === "child",
        );

        const originalChildBaseUrls = new Set(
          initialChildEntries.map((entry) => extractBaseUrl(entry.dataTypeId)),
        );
        const nextChildBaseUrls = new Set(
          childEntries.map((entry) => extractBaseUrl(entry.dataTypeId)),
        );

        const addedChildren = childEntries.filter(
          (entry) =>
            !originalChildBaseUrls.has(extractBaseUrl(entry.dataTypeId)),
        );
        const removedChildren = initialChildEntries.filter(
          (entry) => !nextChildBaseUrls.has(extractBaseUrl(entry.dataTypeId)),
        );

        // A type both changing membership and holding a planned conversion
        // gets one combined republish — two updates would race its version
        const pendingConversionUpdates = new Map([
          ...conversionPlan.updates
            .filter((entry) => entry.baseUrl !== editedBaseUrl)
            .map((entry) => [entry.baseUrl, entry.conversions] as const),
          ...groupConversionPlan.updates.map(
            (entry) => [entry.baseUrl, entry.conversions] as const,
          ),
        ]);
        const takeConversionsFor = (baseUrl: BaseUrl) => {
          const conversions = pendingConversionUpdates.get(baseUrl);
          pendingConversionUpdates.delete(baseUrl);
          return conversions;
        };

        try {
          // Drafts first, in conversion-dependency order: other members'
          // pairings may reference them, and the store requires conversion
          // targets to exist
          for (const draft of orderDraftsByConversionDependencies(
            addedChildren.flatMap((entry) => {
              const memberDraft = stagedDrafts.byUrl.get(entry.dataTypeId);
              return memberDraft ? [foldDraftForSave(memberDraft)] : [];
            }),
          )) {
            await createStagedMember(draft, latest.schema.$id);
          }

          await Promise.all([
            ...addedChildren
              .filter((entry) => !stagedDrafts.byUrl.has(entry.dataTypeId))
              .map(({ dataTypeId }) =>
                applyChildAllOfChange({
                  childId: dataTypeId,
                  addRef: latest.schema.$id,
                  removeBaseUrl: editedBaseUrl,
                  conversions: takeConversionsFor(extractBaseUrl(dataTypeId)),
                }),
              ),
            ...removedChildren.map(({ dataTypeId }) =>
              applyChildAllOfChange({
                childId: dataTypeId,
                removeBaseUrl: editedBaseUrl,
                conversions: takeConversionsFor(extractBaseUrl(dataTypeId)),
              }),
            ),
            ...[...pendingConversionUpdates.entries()].map(
              ([baseUrl, conversions]) =>
                applyConversionsToType({ baseUrl, conversions }),
            ),
          ]);
        } catch (error) {
          if (latest === editedDataType) {
            throw error;
          }
          // The type itself was republished, so the staged $id is stale —
          // retrying from this form would target a superseded version
          void refetchAllDataTypes();
          throw new Error(
            `“${trimmedTitle}” was saved, but updating its related types failed${
              error instanceof Error ? `: ${error.message}` : ""
            }. Close this drawer and edit “${trimmedTitle}” to finish the remaining changes.`,
          );
        }

        await refetchAllDataTypes();
        onSaved(latest);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong — please try again";

      // Matched on the collision's own context: the generic "Could not
      // insert into store" wrapper also covers unrelated schema failures
      if (message.includes("base URL but it already existed")) {
        setErrors({
          title:
            "A data type with this URL already exists — it may be archived. Try a different name.",
        });
      } else if (
        message.includes("versioned URL but it already existed") &&
        // A related type racing is already wrapped with the type's name and
        // its own recovery instruction — keep that message intact
        !message.includes("related types failed")
      ) {
        setErrors({
          submit:
            "This data type was changed by someone else while you were editing — close the drawer and reopen it to edit the latest version.",
        });
      } else {
        setErrors({ submit: message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return {
    editedDataType,
    latestDataTypes,
    readonly,
    scopedDataTypesContext,
    submitting,
    title,
    setTitle,
    titlePlural,
    setTitlePlural,
    description,
    setDescription,
    labelLeft,
    setLabelLeft,
    labelRight,
    setLabelRight,
    errors,
    setErrors,
    suggestTitlePlural,
    pluralLoading,
    generationAvailable,
    pluralRequestMade,
    allowedTypes,
    handleAllowedTypesChange,
    hasGroupEntry,
    wasGroup,
    parentEntryCount,
    childEntryCount,
    listEntries,
    extendsCardHasVisibleContent,
    isMembershipParentRef,
    derivedValueRoot,
    typeCardDescription,
    groupBaseRef,
    childCompatibility,
    childEntryPrimitive,
    canEditDataType,
    canEditByBaseUrl,
    stagedDrafts,
    stagedMemberDrafts,
    draftsByBaseUrl,
    editedWebShortname,
    editedVersion,
    editedTypeVersions,
    typeFieldHandle,
    groupMembersFieldHandle,
    cancelButtonRef,
    interceptDrawerClose,
    requestClose,
    navigateToCrumb,
    generateTypeUrlsForUser,
    showExtendTypeAction,
    createNewInitialTitle,
    setCreateNewInitialTitle,
    extendTypeDrawerOpen,
    setExtendTypeDrawerOpen,
    memberDraftDrawerOpen,
    setMemberDraftDrawerOpen,
    editingDraftUrl,
    setEditingDraftUrl,
    handleExtendingTypeCreated,
    handleMemberDraftStaged,
    showConstraintCard,
    showAddConstraintButton,
    constraintPrimitive,
    inheritedConstraints,
    constraintState,
    setConstraintState,
    childTypeTitles,
    showConversionCard,
    showAddConversionButton,
    conversionRows,
    setConversionRows,
    conversionTargetOptions,
    resolveConversionTitle,
    canRemoveComposedPairing,
    composedRemovalRow,
    setComposedRemovalRow,
    composedRemovalPairings,
    confirmComposedRemoval,
    showGroupConversionCard,
    showAddGroupConversionButton,
    groupConversionRows,
    handleGroupConversionRowsChange,
    groupConversionChildren,
    groupTargetOptionsFor,
    conversionSectionKeyFor,
    newGroupConversionRows,
    setNewGroupConversionRows,
    appearanceApplicable,
    inheritedLabel,
    showExtendedByCard,
    extendedByExpanded,
    setExtendedByExpanded,
    stagedChangeWarnings,
    canSubmit,
    stagedEdit,
    handleSubmit,
    abandonDraftsDialogOpen,
    dismissAbandonDialog,
    unsavedChangesDialogOpen,
    dismissUnsavedChangesDialog,
    discardUnsavedChanges,
    draftsAtStake,
    abandoningForAllowedTypesChange: pendingAllowedTypes !== null,
    keepingDrafts,
    keepDraftsError,
    keepAbandonedDrafts,
    discardDraftsAtStake,
    foldDraftForSave,
  };
};
