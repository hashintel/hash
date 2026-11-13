import { useLazyQuery, useMutation } from "@apollo/client";
import { Box, Portal, Stack, Typography } from "@mui/material";
import { isEqual } from "lodash";
import { useRouter } from "next/router";
import { useCallback, useContext, useMemo, useRef, useState } from "react";

import {
  componentsFromVersionedUrl,
  DATA_TYPE_META_SCHEMA,
  extractBaseUrl,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import {
  Banner,
  BreadCrumbs,
  Button,
  Dialog,
  Drawer,
  Form,
  TextArea,
  TextInput,
} from "@hashintel/ds-components";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createDataTypeMutation,
  queryDataTypesQuery,
  updateDataTypeMutation,
} from "../../graphql/queries/ontology/data-type.queries";
import { useAuthenticatedUser } from "./auth-info-context";
import { AllowedTypesField } from "./data-type-editor-drawer/allowed-types-field";
import { buildOwnConstraints } from "./data-type-editor-drawer/build-own-constraints";
import {
  AddConstraintMenu,
  ConstraintsField,
} from "./data-type-editor-drawer/constraints-field";
import { ConversionsField } from "./data-type-editor-drawer/conversions-field";
import { EditableHeader } from "./data-type-editor-drawer/editable-header";
import {
  activeConstraintKinds,
  collectDescendantTypeTitles,
  constraintValuesFromSchema,
  deriveInheritedConstraints,
  emptyInheritedConstraints,
  primitiveArmOfUnion,
  schemaConstraintsFromValues,
  sharedParentPrimitive,
  summarizeTypeTitles,
  visibleConstraintKinds,
} from "./data-type-editor-drawer/shared/constraint-config";
import {
  buildConversionGroups,
  conversionRowStatesFromRows,
  conversionRowsForViewer,
  newConversionRowState,
  planConversionUpdates,
  rowEffectiveFactor,
} from "./data-type-editor-drawer/shared/conversion-config";
import { lowestCommonAncestorRef } from "./data-type-editor-drawer/shared/group-root";
import {
  arraySchemaFromListConfig,
  listConfigFromArraySchema,
  listDataTypeBaseUrl,
  listDataTypeId,
} from "./data-type-editor-drawer/shared/list-config";
import {
  primitiveRootTypeByBaseUrl,
  primitiveRootTypes,
} from "./data-type-editor-drawer/shared/primitive-root-types";
import { useDataTypesContext } from "./data-types-context";
import { DsComponentsScope } from "./ds-components-scope";
import { useGenerateTypeUrlsForUser } from "./use-generate-type-urls-for-user";
import { WorkspaceContext } from "./workspace-context";

import type {
  CreateDataTypeMutation,
  CreateDataTypeMutationVariables,
  QueryDataTypesQuery,
  QueryDataTypesQueryVariables,
  UpdateDataTypeMutation,
  UpdateDataTypeMutationVariables,
} from "../../graphql/api-types.gen";
import type {
  AllowedTypeEntry,
  AllowedTypeRelation,
  AllowedTypesFieldHandle,
} from "./data-type-editor-drawer/allowed-types-field";
import type { DataTypeTreeNode } from "./data-type-editor-drawer/allowed-types-field/data-type-tree";
import type { ConstraintsState } from "./data-type-editor-drawer/constraints-field";
import type { InheritedConstraints } from "./data-type-editor-drawer/shared/constraint-config";
import type {
  ConversionRow,
  ConversionRowState,
} from "./data-type-editor-drawer/shared/conversion-config";
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
import type { RefObject } from "react";

/**
 * A fully-specified new data type held in memory rather than the graph: the
 * drawer that collected it never persisted anything, so discarding the parent
 * drawer discards the draft. Its versioned URL is the one creation will
 * claim, letting it stand in `allOf`-entry lists before it exists.
 */
export type StagedDataTypeDraft = {
  baseUrl: BaseUrl;
  versionedUrl: VersionedUrl;
  dataType: ConstructDataTypeParams;
};

type DataTypeEditorDrawerProps = {
  onClose: () => void;
  /** Distinct per stacked drawer, so each level animates in and out on its own */
  swapKey?: string;
} & (
  | {
      mode: "create";
      initialTitle?: string;
      initialExtendsDataTypeId?: VersionedUrl;
      onCreated: (dataType: DataTypeWithMetadata) => void;
    }
  /**
   * The create form, but submitting stages the definition with the caller
   * instead of writing to the graph — nothing persists until the caller's
   * own save creates the staged types.
   */
  | {
      mode: "stage";
      initialExtendsDataTypeId?: VersionedUrl;
      /** Versioned URLs other staged drafts already claim */
      unavailableTypeUrls?: ReadonlySet<VersionedUrl>;
      onStaged: (draft: StagedDataTypeDraft) => void;
    }
  | {
      mode: "edit";
      dataType: DataTypeWithMetadata;
      /** Show the type in the drawer without allowing changes */
      readonly?: boolean;
      onUpdated: (dataType: DataTypeWithMetadata) => void;
    }
  /**
   * The type is still being fetched: shows the loading drawer. Switching to
   * another mode afterwards swaps the content inside the still-mounted drawer
   * slot, rather than remounting it with its enter animation replayed.
   */
  | {
      mode: "load";
      /** The lookup settled without finding the type — say so instead of loading forever */
      notFound?: boolean;
    }
);

type FormErrors = {
  title?: string;
  description?: string;
  allowedTypes?: string;
  groupMembers?: string;
  conversions?: string;
  submit?: string;
};

const sectionCardSx = {
  background: "white",
  borderRadius: "10px",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.06)",
} as const;

const primitiveTypeFromSchema = (
  schema: DataType,
): SingleValueConstraints["type"] | null =>
  "anyOf" in schema ? null : schema.type;

/**
 * The root type a parentless group extends: the graph requires every type to
 * extend something, and the members' primitive root adds nothing beyond the
 * bare arm the group already carries.
 */
const primitiveRootRefFor = (
  primitive: SingleValueConstraints["type"] | null,
): VersionedUrl | null =>
  primitive !== null
    ? (primitiveRootTypes.find((rootType) => rootType.type === primitive)
        ?.dataTypeId ?? null)
    : null;

type ReferenceEntry = Extract<AllowedTypeEntry, { dataTypeId: VersionedUrl }>;
type ListEntry = Extract<AllowedTypeEntry, { relation: "list" }>;

const DataTypeEditorDrawerInner = ({
  onClose,
  swapKey,
  editedDataType,
  initialTitle,
  initialExtendsDataTypeId,
  onSaved,
  stageDraft,
  unavailableTypeUrls,
  dataTypes,
  latestDataTypes,
  readonly,
}: {
  onClose: () => void;
  swapKey: string;
  /** `null` when creating a new data type */
  editedDataType: DataTypeWithMetadata | null;
  initialTitle?: string;
  initialExtendsDataTypeId?: VersionedUrl;
  onSaved: (dataType: DataTypeWithMetadata) => void;
  /** Submit hands the assembled definition here instead of creating it */
  stageDraft?: (draft: StagedDataTypeDraft) => void;
  /** Versioned URLs treated as taken alongside the graph's own */
  unavailableTypeUrls?: ReadonlySet<VersionedUrl>;
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  readonly?: boolean;
}) => {
  const router = useRouter();

  const { authenticatedUser } = useAuthenticatedUser();
  const { activeWorkspaceWebId } = useContext(WorkspaceContext);
  const generateTypeUrlsForUser = useGenerateTypeUrlsForUser();
  const { refetch: refetchAllDataTypes } = useDataTypesContext();

  const [queryDataTypes] = useLazyQuery<
    QueryDataTypesQuery,
    QueryDataTypesQueryVariables
  >(queryDataTypesQuery, {
    // A validation check: a cached empty result must not mask a type created
    // since the cache was filled
    fetchPolicy: "network-only",
  });

  const [createDataType] = useMutation<
    CreateDataTypeMutation,
    CreateDataTypeMutationVariables
  >(createDataTypeMutation);

  const [updateDataType] = useMutation<
    UpdateDataTypeMutation,
    UpdateDataTypeMutationVariables
  >(updateDataTypeMutation);

  const [initialEntries, setInitialEntries] = useState<AllowedTypeEntry[]>(
    () => {
      if (!editedDataType) {
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

      const listEntries: AllowedTypeEntry[] = [];
      if ("anyOf" in editedSchema) {
        for (const arm of editedSchema.anyOf) {
          if (arm.type === "array") {
            listEntries.push({
              relation: "list",
              config: listConfigFromArraySchema(arm),
            });
          }
        }
      } else if (editedSchema.type === "array") {
        listEntries.push({
          relation: "list",
          config: listConfigFromArraySchema(editedSchema),
        });
      }

      const children = Object.values(latestDataTypes)
        .filter(
          (dataType) =>
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
      // members is that synthesized root; several (API-authored) stay visible.
      const isGroup =
        editedSchema.abstract === true &&
        children.length > 0 &&
        (parents.length <= 1 ||
          parents.every(
            (entry) =>
              entry.relation !== "parent" ||
              primitiveRootTypeByBaseUrl.has(extractBaseUrl(entry.dataTypeId)),
          ));

      return [
        ...(isGroup
          ? [{ relation: "group" } satisfies AllowedTypeEntry]
          : parents),
        ...listEntries,
        ...children,
      ];
    },
  );

  const [initialConstraintState] = useState<ConstraintsState>(() => {
    const schema = editedDataType?.schema;

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
    () => conversionRowStatesFromRows(initialConversionRows),
  );

  const [title, setTitle] = useState(
    editedDataType ? editedDataType.schema.title : (initialTitle ?? ""),
  );
  const [labelLeft, setLabelLeft] = useState(
    editedDataType?.schema.label?.left ?? "",
  );
  const [labelRight, setLabelRight] = useState(
    editedDataType?.schema.label?.right ?? "",
  );
  const [description, setDescription] = useState(
    editedDataType?.schema.description ?? "",
  );
  const [allowedTypes, setAllowedTypes] =
    useState<AllowedTypeEntry[]>(initialEntries);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const typeFieldHandle = useRef<AllowedTypesFieldHandle>(null);
  const groupMembersFieldHandle = useRef<AllowedTypesFieldHandle>(null);

  /**
   * The form as first rendered, for detecting whether anything was edited.
   * The type entries are compared against `initialEntries` instead, which
   * also absorbs extensions created from this drawer — already saved, so not
   * edits of this type.
   */
  const [initialFormState] = useState(() => ({
    title,
    description,
    labelLeft,
    labelRight,
    constraintState,
    conversionRows,
  }));

  const hasEdits =
    title !== initialFormState.title ||
    description !== initialFormState.description ||
    labelLeft !== initialFormState.labelLeft ||
    labelRight !== initialFormState.labelRight ||
    !isEqual(allowedTypes, initialEntries) ||
    !isEqual(constraintState, initialFormState.constraintState) ||
    !isEqual(conversionRows, initialFormState.conversionRows);

  // Creation needs the required fields: a name, a description, and at least
  // one type (the schema always expresses a value type, so one must be picked)
  const canSubmit = editedDataType
    ? hasEdits
    : title.trim().length > 0 &&
      description.trim().length > 0 &&
      allowedTypes.length > 0;

  /**
   * Members authored in the stacked create drawer: definitions held locally
   * and created only when this drawer saves — closing without saving
   * discards them, so nothing reaches the graph for an abandoned edit
   */
  const [stagedMemberDrafts, setStagedMemberDrafts] = useState<
    StagedDataTypeDraft[]
  >([]);
  const [memberDraftDrawerOpen, setMemberDraftDrawerOpen] = useState(false);

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
        abstract: false,
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

  const [abandonDraftsDialogOpen, setAbandonDraftsDialogOpen] = useState(false);
  const [keepingDrafts, setKeepingDrafts] = useState(false);
  const [keepDraftsError, setKeepDraftsError] = useState<string | null>(null);

  /** Where a breadcrumb close should land once the drawer is done closing */
  const pendingClosePathRef = useRef<string | null>(null);

  const finishClose = () => {
    onClose();
    const path = pendingClosePathRef.current;
    pendingClosePathRef.current = null;
    if (path !== null) {
      void router.push(path);
    }
  };

  /**
   * Closing with staged new members pending puts their fate to the user —
   * they were authored in full, so they're kept or discarded explicitly
   * rather than silently dropped. The drawer stays open behind the dialog,
   * so cancelling it lands back in the editor.
   */
  const requestClose = (navigateTo?: string) => {
    pendingClosePathRef.current = navigateTo ?? null;
    if (stagedMemberDrafts.length > 0) {
      setAbandonDraftsDialogOpen(true);
      return;
    }
    finishClose();
  };

  /** The drawer's own dismissals (close button, Escape), caught pre-animation */
  const interceptCloseForDrafts = () => {
    if (stagedMemberDrafts.length === 0) {
      return true;
    }
    requestClose();
    return false;
  };

  const dismissAbandonDialog = () => {
    setAbandonDraftsDialogOpen(false);
    setKeepDraftsError(null);
    pendingClosePathRef.current = null;
  };

  const navigateToCrumb = (path: string) => {
    requestClose(path);
  };

  const editableWebIds = useMemo(
    () =>
      new Set<string>([
        authenticatedUser.accountId,
        ...authenticatedUser.memberOf.map(({ org }) => org.webId),
      ]),
    [authenticatedUser],
  );

  const canEditDataType = useCallback(
    (dataTypeId: VersionedUrl) => {
      if (stagedDrafts.byUrl.has(dataTypeId)) {
        return true;
      }

      const dataType =
        dataTypes[dataTypeId] ?? latestDataTypes[extractBaseUrl(dataTypeId)];

      return (
        !!dataType &&
        "webId" in dataType.metadata &&
        editableWebIds.has(dataType.metadata.webId)
      );
    },
    [dataTypes, latestDataTypes, editableWebIds, stagedDrafts],
  );

  const resolveDataType = useCallback(
    (dataTypeId: VersionedUrl) =>
      stagedDrafts.asDataTypes.get(dataTypeId) ??
      dataTypes[dataTypeId] ??
      latestDataTypes[extractBaseUrl(dataTypeId)],
    [dataTypes, latestDataTypes, stagedDrafts],
  );

  const canEditByBaseUrl = useCallback(
    (baseUrl: BaseUrl) => {
      const latest = latestDataTypes[baseUrl];
      return !!latest && canEditDataType(latest.schema.$id);
    },
    [latestDataTypes, canEditDataType],
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
            : null));

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

  // The synthesized parent for a parentless group: the members' lowest shared
  // ancestor, so the group's root follows its membership — their primitive
  // root when the chains never meet or can't be resolved
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

  const hasGroupEntry = allowedTypes.some(
    (entry) => entry.relation === "group",
  );

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
  const showExtendTypeAction = !!editedDataType && !showExtendedByCard;

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
   * the member entries now and is created when this drawer saves
   */
  const handleMemberDraftStaged = (draft: StagedDataTypeDraft) => {
    setMemberDraftDrawerOpen(false);
    setStagedMemberDrafts((previous) => [...previous, draft]);
    setAllowedTypes((previous) => [
      ...previous,
      { dataTypeId: draft.versionedUrl, relation: "child" },
    ]);
    setErrors((previous) => ({ ...previous, groupMembers: undefined }));
  };

  const typeCardDescription = hasGroupEntry
    ? "This type is a group — its values can be any of the group's members below."
    : allowedTypes.length === 0
      ? "Select the type this data type extends, or choose Group to combine several existing types into one."
      : allowedTypes.some((entry) => entry.relation === "list")
        ? "A value of this type can be any of the types below."
        : parentEntryCount > 1
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
  const conversionsApplicable =
    constraintPrimitive === "number" &&
    editedDataType?.schema.abstract !== true &&
    !(childEntryCount > 0 && !editedDataType) &&
    // A staged definition can't carry conversions: placing them republishes
    // other types, which must wait for the parent drawer's save
    !stageDraft;

  const showConversionCard = conversionsApplicable && conversionRows.length > 0;
  const showAddConversionButton =
    conversionsApplicable && !showConversionCard && !readonly;

  /** Value labels decorate displayed values — a number or text thing */
  const appearanceApplicable =
    constraintPrimitive === "number" || constraintPrimitive === "string";

  const conversionTargetOptions = useMemo(() => {
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
      .flatMap((row) => {
        const factor = rowEffectiveFactor(row);
        return row.targetBaseUrl !== null && factor !== null
          ? [{ targetBaseUrl: row.targetBaseUrl, factor }]
          : [];
      });
    const stagedInitial = initialConversionRows.filter(
      (row) => row.factor !== null && !row.viaCanonical,
    );

    const placeable = (targetBaseUrl: BaseUrl) =>
      !planConversionUpdates({
        viewedBaseUrl,
        desiredRows: [...stagedDesired, { targetBaseUrl, factor: 1 }],
        initialRows: stagedInitial,
        latestDataTypes,
        canWriteTo,
      }).unplacedTargets.includes(targetBaseUrl);

    return Object.values(latestDataTypes)
      .filter(
        (dataType) =>
          !("anyOf" in dataType.schema) &&
          dataType.schema.type === "number" &&
          dataType.schema.abstract !== true &&
          dataType.metadata.recordId.baseUrl !== viewedBaseUrl &&
          dataType.metadata.recordId.baseUrl !==
            blockProtocolDataTypes.number.dataTypeBaseUrl,
      )
      .map((dataType) => {
        const targetBaseUrl = dataType.metadata.recordId.baseUrl;

        return {
          baseUrl: targetBaseUrl,
          title: dataType.schema.title,
          disabled: !placeable(targetBaseUrl),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [
    latestDataTypes,
    editedDataType,
    canEditByBaseUrl,
    conversionRows,
    initialConversionRows,
  ]);

  const resolveConversionTitle = useCallback(
    (baseUrl: BaseUrl) => latestDataTypes[baseUrl]?.schema.title ?? baseUrl,
    [latestDataTypes],
  );

  /** The picker disables unplaceable targets; this backstops a stale pick */
  const unplacedConversionsError = (targets: BaseUrl[]) =>
    `Conversions to ${summarizeTypeTitles(
      targets.map(resolveConversionTitle),
    )} can't be stored — they would join or merge conversion groups you don't have permission to update`;

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
    // back to its primitive root, keeping its value type
    if (nextAllOf.length === 0) {
      const rootRef = primitiveRootRefFor(
        primitiveTypeFromSchema(child.schema),
      );
      if (rootRef) {
        nextAllOf.push({ $ref: rootRef });
      }
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
  };

  /**
   * Create a type staged in the stacked drawer. With a group ref — available
   * once the group exists at a saved version — the new type joins it;
   * without one it stands alone on the parents it was authored with.
   */
  const createStagedMember = async (
    draft: StagedDataTypeDraft,
    groupRef?: VersionedUrl,
  ) => {
    if (!activeWorkspaceWebId) {
      throw new Error("No active workspace");
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
      },
    });

    if (response.errors?.length || !response.data) {
      const detail = graphQlErrorDetail(response.errors);
      throw new Error(
        `Could not create data type ${draft.dataType.title}${detail ? `: ${detail}` : ""}`,
      );
    }
  };

  /** Keep: the staged types outlive the abandoned edit, standalone */
  const keepAbandonedDrafts = async () => {
    setKeepingDrafts(true);
    setKeepDraftsError(null);
    try {
      await Promise.all(
        stagedMemberDrafts.map((draft) => createStagedMember(draft)),
      );
      await refetchAllDataTypes();
      finishClose();
    } catch (error) {
      setKeepDraftsError(
        error instanceof Error
          ? error.message
          : "Could not create the new data types",
      );
    } finally {
      setKeepingDrafts(false);
    }
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
  };

  /**
   * The staged conversion rows as (target, factor) pairs the planner takes.
   * Rows a staged change invalidated (the type leaving number, a new group)
   * are dropped here, so the plan removes their stored pairings on save —
   * the rows themselves stay staged, surviving a reverted change.
   */
  const desiredConversionRows = () => {
    if (!conversionsApplicable) {
      return [];
    }

    return conversionRows
      .filter((row) => !row.viaCanonical && !row.formula)
      .flatMap((row) => {
        const factor = rowEffectiveFactor(row);
        return row.targetBaseUrl !== null && factor !== null
          ? [{ targetBaseUrl: row.targetBaseUrl, factor }]
          : [];
      });
  };

  const plannableInitialConversionRows = () =>
    initialConversionRows.filter(
      (row) => row.factor !== null && !row.viaCanonical,
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

    // The synthesized group root reappears here too — comparing against
    // it keeps no-op saves from re-publishing
    const nextParentIds =
      parentEntries.length > 0
        ? parentEntries.map(({ dataTypeId }) => dataTypeId)
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

    // Planned unconditionally: when conversions stopped applying (e.g.
    // the value type left number), the cleared rows must still remove
    // their stored pairings
    const conversionPlan = planConversionUpdates({
      viewedBaseUrl: editedBaseUrl,
      desiredRows: desiredConversionRows(),
      initialRows: plannableInitialConversionRows(),
      latestDataTypes,
      canWriteTo: (baseUrl) =>
        baseUrl === editedBaseUrl || canEditByBaseUrl(baseUrl),
    });
    const ownConversionsEntry = conversionPlan.updates.find(
      (entry) => entry.baseUrl === editedBaseUrl,
    );

    const republishesEditedType =
      title.trim() !== originalSchema.title ||
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

    if (hasGroupEntry && childEntries.length === 0) {
      nextErrors.groupMembers = "Add the data types that belong to this group";
    }

    if (!editedDataType && childEntries.length > 0) {
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

    // The same predicate desiredConversionRows drops rows by — saving would
    // silently discard the unfinished row otherwise. Rows left after the
    // card stopped applying are cleared deliberately (warned on the change).
    const hasIncompleteConversionRow =
      conversionsApplicable &&
      conversionRows.some(
        (row) =>
          !row.viaCanonical &&
          !row.formula &&
          (row.targetBaseUrl === null || rowEffectiveFactor(row) === null),
      );

    if (hasIncompleteConversionRow) {
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
          unavailableTypeUrls?.has(versionedUrl)
        ) {
          setErrors({
            title: "A data type with this name already exists in this web",
          });
          return;
        }

        const primary = parentEntries[0];
        let primitive: SingleValueConstraints["type"] | null = null;
        let parentUnionArms: SingleValueSchema[] | null = null;

        if (primary) {
          const parentInfo = resolveParentPrimitive(primary.dataTypeId);

          if (!parentInfo) {
            throw new Error(`Could not find data type ${primary.dataTypeId}`);
          }

          primitive = parentInfo.primitive;
          if (primitive === null) {
            parentUnionArms = resolveParentUnionArms(primary.dataTypeId);
          }
        } else if (childEntries.length > 0) {
          // A parentless group: the bare member primitive is its whole arm —
          // the group constrains values to membership, nothing more
          primitive = childEntryPrimitive;
        }

        const dataTypePayload: ConstructDataTypeParams = {
          ...buildOwnConstraints({
            primitive,
            unionArms: parentUnionArms,
            listEntries,
            constraintsPart: ownConstraintsPart,
          }),
          title: trimmedTitle,
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

        // Staged: the definition goes to the parent drawer, which creates it
        // on its own save — nothing is written here
        if (stageDraft) {
          stageDraft({
            baseUrl: newBaseUrl,
            versionedUrl,
            dataType: dataTypePayload,
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

        // A type both joining the group and holding a planned conversion
        // gets one combined republish — two updates would race its version
        const pendingConversionUpdates = new Map(
          conversionPlan.updates
            .filter((entry) => entry.baseUrl !== newBaseUrl)
            .map((entry) => [entry.baseUrl, entry.conversions]),
        );
        const takeConversionsFor = (baseUrl: BaseUrl) => {
          const conversions = pendingConversionUpdates.get(baseUrl);
          pendingConversionUpdates.delete(baseUrl);
          return conversions;
        };

        try {
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
            ...childEntries
              .map((entry) => stagedDrafts.byUrl.get(entry.dataTypeId))
              .filter((draft): draft is StagedDataTypeDraft => !!draft)
              .map((draft) => createStagedMember(draft, created.schema.$id)),
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

        let latest = editedDataType;

        if (republishesEditedType) {
          const {
            $id: _$id,
            $schema: _$schema,
            kind: _kind,
            allOf: _allOf,
            title: _title,
            titlePlural,
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
          const parentUnionArms =
            nextParentIds[0] && newParentInfo && newPrimitive === null
              ? resolveParentUnionArms(nextParentIds[0])
              : null;

          const keepConstraints =
            !parentsChanged ||
            newPrimitive === null ||
            newPrimitive === oldPrimitive;

          const constraintsPart =
            listEntries.length > 0 || initialListEntries.length > 0
              ? buildOwnConstraints({
                  primitive: newPrimitive,
                  unionArms: parentUnionArms,
                  listEntries,
                  constraintsPart: ownConstraintsPart,
                })
              : constraintPrimitive !== null
                ? ({
                    type: constraintPrimitive,
                    ...ownConstraintsPart,
                  } as SingleValueSchema)
                : parentsChanged && parentUnionArms
                  ? buildOwnConstraints({
                      primitive: null,
                      unionArms: parentUnionArms,
                      listEntries: [],
                    })
                  : keepConstraints
                    ? constraints
                    : { type: newPrimitive as "boolean" };

          const response = await updateDataType({
            variables: {
              dataTypeId: originalSchema.$id,
              dataType: {
                ...constraintsPart,
                title: trimmedTitle,
                titlePlural,
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
        const pendingConversionUpdates = new Map(
          conversionPlan.updates
            .filter((entry) => entry.baseUrl !== editedBaseUrl)
            .map((entry) => [entry.baseUrl, entry.conversions]),
        );
        const takeConversionsFor = (baseUrl: BaseUrl) => {
          const conversions = pendingConversionUpdates.get(baseUrl);
          pendingConversionUpdates.delete(baseUrl);
          return conversions;
        };

        try {
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
            ...addedChildren
              .map((entry) => stagedDrafts.byUrl.get(entry.dataTypeId))
              .filter((draft): draft is StagedDataTypeDraft => !!draft)
              .map((draft) => createStagedMember(draft, latest.schema.$id)),
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

      // The graph reports a base-URL collision (e.g. with an archived type)
      // only as a generic insertion failure
      if (message.includes("Could not insert into store")) {
        setErrors({
          title:
            "A data type with this URL already exists — it may be archived. Try a different name.",
        });
      } else {
        setErrors({ submit: message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * A card-label action opening the field's in-body type picker. The marker
   * attribute keeps the field's dismiss-outside handler from closing the
   * picker on pointerdown before the click toggles it shut.
   */
  const addTypeLabelAction = (
    fieldHandle: RefObject<AllowedTypesFieldHandle | null>,
    label: string,
  ) =>
    readonly ? undefined : (
      <Box data-allowed-types-picker sx={{ display: "inline-flex" }}>
        <Button
          variant="subtle"
          size="sm"
          iconName="plus"
          onClick={() => fieldHandle.current?.toggleAddPicker()}
        >
          {label}
        </Button>
      </Box>
    );

  /** The child entries, shown as a group's members or as extenders */
  const membersField = (
    <AllowedTypesField
      value={allowedTypes}
      onChange={handleAllowedTypesChange}
      visibleRelations={["child"]}
      addRelation="child"
      readonly={readonly}
      handle={groupMembersFieldHandle}
      excludedBaseUrl={editedDataType?.metadata.recordId.baseUrl}
      canEditDataType={canEditDataType}
      childCompatibility={childCompatibility}
      onCreateNewType={
        readonly
          ? undefined
          : hasGroupEntry
            ? // A group member is authored in a stacked drawer and staged —
              // created only when this drawer saves
              () => setMemberDraftDrawerOpen(true)
            : editedDataType
              ? // The Extended by card creates the extending type in place:
                // this type already exists for it to reference
                () => setExtendTypeDrawerOpen(true)
              : undefined
      }
      draftNodesById={stagedDrafts.asNodes}
    />
  );

  const conversionCard = showConversionCard ? (
    <Box sx={sectionCardSx}>
      <Box sx={{ padding: "16px 18px 18px" }}>
        <Form.Field
          label="Conversions"
          as="legend"
          description="Convert values of this type to other data types."
          errors={errors.conversions ? [errors.conversions] : undefined}
          labelActions={
            readonly ? undefined : (
              <Button
                variant="subtle"
                size="sm"
                iconName="plus"
                onClick={() =>
                  setConversionRows([
                    ...conversionRows,
                    newConversionRowState(conversionRows),
                  ])
                }
              >
                Add conversion
              </Button>
            )
          }
        >
          <ConversionsField
            rows={conversionRows}
            onChange={(rows) => {
              setConversionRows(rows);
              setErrors((prev) => ({ ...prev, conversions: undefined }));
            }}
            viewedTitle={title}
            targetOptions={conversionTargetOptions}
            resolveTitle={resolveConversionTitle}
            canEditStoredOn={(storedBaseUrl) => {
              const storedDataType = latestDataTypes[storedBaseUrl];
              return (
                !!storedDataType && canEditDataType(storedDataType.schema.$id)
              );
            }}
            readonly={readonly}
          />
        </Form.Field>
      </Box>
    </Box>
  ) : null;

  const addConversionButton = showAddConversionButton ? (
    <Button
      variant="subtle"
      size="sm"
      iconName="plus"
      onClick={() => setConversionRows([newConversionRowState([])])}
    >
      Add conversion
    </Button>
  ) : null;

  // Read-only, the card documents the labels that exist: an unset side is
  // omitted rather than shown as an empty disabled input, and with neither
  // set the card has nothing to say
  const showLabelLeft = !readonly || labelLeft.trim() !== "";
  const showLabelRight = !readonly || labelRight.trim() !== "";

  const appearanceCard =
    appearanceApplicable && (showLabelLeft || showLabelRight) ? (
      <Box sx={sectionCardSx}>
        <Box sx={{ padding: "16px 18px 18px" }}>
          <Form.Field
            label="Appearance"
            as="legend"
            description="Labels shown before and after the value"
          >
            {readonly ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "max-content max-content",
                  columnGap: 2,
                  rowGap: 0.5,
                  alignItems: "baseline",
                }}
              >
                {showLabelLeft ? (
                  <>
                    <Typography
                      sx={{ fontSize: 14, fontWeight: 600, color: "#404040" }}
                    >
                      Before the value:
                    </Typography>
                    <Typography sx={{ fontSize: 14, color: "#404040" }}>
                      {labelLeft}
                    </Typography>
                  </>
                ) : null}
                {showLabelRight ? (
                  <>
                    <Typography
                      sx={{ fontSize: 14, fontWeight: 600, color: "#404040" }}
                    >
                      After the value:
                    </Typography>
                    <Typography sx={{ fontSize: 14, color: "#404040" }}>
                      {labelRight}
                    </Typography>
                  </>
                ) : null}
              </Box>
            ) : (
              <Box sx={{ display: "flex", gap: 2 }}>
                <Form.Field label="Before the value" size="sm">
                  <TextInput
                    value={labelLeft}
                    onChange={setLabelLeft}
                    placeholder="£"
                    size="sm"
                    width="xs"
                  />
                </Form.Field>
                <Form.Field label="After the value" size="sm">
                  <TextInput
                    value={labelRight}
                    onChange={setLabelRight}
                    placeholder="cm"
                    size="sm"
                    width="xs"
                  />
                </Form.Field>
              </Box>
            )}
          </Form.Field>
        </Box>
      </Box>
    ) : null;

  return (
    <>
      <Drawer
        size="lg"
        position="right"
        variant="plain"
        swapKey={swapKey}
        shouldCloseOn="closeButton"
        onClose={onClose}
        onCloseRequest={interceptCloseForDrafts}
        aria-label={editedDataType ? "Edit data type" : "Create data type"}
        // When editing, focus starts on the footer's Cancel/Close rather than
        // in the name input, which suits a fresh type but not an existing one
        initialFocusRef={editedDataType ? cancelButtonRef : undefined}
      >
        <Drawer.Header>
          {/* The fixed height matches the close button, centring the trail against it */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              height: 28,
              // The close button's hover pill hangs on negative margins, placing
              // its visual centre 2px above the header's content row
              marginTop: "-2px",
              "& nav": {
                display: "flex",
                alignItems: "center",
                height: "100%",
              },
              // One step lighter than the ds crumb weight (450); !important beats
              // the layer-polyfill's specificity boost on the recipe rule
              "& li": { fontWeight: "400 !important" },
            }}
          >
            <BreadCrumbs
              size="sm"
              autoFocus="never"
              aria-label="Data type location"
            >
              <BreadCrumbs.Item
                noCollapse
                onClick={() => navigateToCrumb("/types")}
              >
                Types
              </BreadCrumbs.Item>
              <BreadCrumbs.Item
                noCollapse
                onClick={() => navigateToCrumb("/types/data-type")}
              >
                Data types
              </BreadCrumbs.Item>
              <BreadCrumbs.Item noCollapse>
                {editedDataType ? editedDataType.schema.title : "New data type"}
              </BreadCrumbs.Item>
            </BreadCrumbs>
          </Box>
          {editedDataType ? (
            <EditableHeader
              dataTypeUrl={editedDataType.schema.$id}
              readonly={readonly}
              title={title}
              description={description}
              onTitleChange={(next) => {
                setTitle(next);
                setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              onDescriptionChange={(next) => {
                setDescription(next);
                setErrors((prev) => ({ ...prev, description: undefined }));
              }}
              titleError={errors.title}
              descriptionError={errors.description}
              urlActions={
                showExtendTypeAction ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconName="arrowUpRight"
                    iconPosition="right"
                    onClick={() => setExtendTypeDrawerOpen(true)}
                  >
                    Extend this type
                  </Button>
                ) : undefined
              }
            />
          ) : null}
        </Drawer.Header>
        <Drawer.Body className="data-type-editor-body">
          {/* Full-height so the warnings banner can pin to the body's bottom */}
          <Stack spacing={2.5} sx={{ minHeight: "100%" }}>
            {editedDataType ? null : (
              <Box sx={sectionCardSx}>
                <Stack spacing={2} sx={{ padding: "16px 18px 18px" }}>
                  <Form.Field
                    label="Name"
                    required
                    errors={errors.title ? [errors.title] : undefined}
                  >
                    <TextInput
                      value={title}
                      onChange={setTitle}
                      placeholder="e.g. Length"
                      // "search" in the name keeps Bitwarden's inline menu off
                      // this field — it disregards autocomplete="off" and
                      // data-bwignore, but never offers autofill on fields it
                      // classifies as search
                      name="data-type-name-search"
                      required
                      invalid={!!errors.title}
                      autoFocus
                      width="fullWidth"
                    />
                  </Form.Field>

                  <Form.Field
                    label="Description"
                    required
                    errors={
                      errors.description ? [errors.description] : undefined
                    }
                  >
                    <TextArea
                      value={description}
                      onChange={setDescription}
                      placeholder="Describe this data type in one or two sentences"
                      required
                      invalid={!!errors.description}
                      rows={2}
                    />
                  </Form.Field>
                </Stack>
              </Box>
            )}

            <Box sx={sectionCardSx}>
              <Box sx={{ padding: "16px 18px 18px" }}>
                <Form.Field
                  label="Extends"
                  as="legend"
                  description={typeCardDescription}
                  labelActions={
                    // With no types picked the field already shows the
                    // first-type input; a group extends nothing more
                    allowedTypes.length > 0 && !hasGroupEntry
                      ? addTypeLabelAction(
                          typeFieldHandle,
                          "Extend another type",
                        )
                      : undefined
                  }
                  errors={
                    errors.allowedTypes ? [errors.allowedTypes] : undefined
                  }
                >
                  <AllowedTypesField
                    value={allowedTypes}
                    onChange={handleAllowedTypesChange}
                    excludedBaseUrl={editedDataType?.metadata.recordId.baseUrl}
                    canEditDataType={canEditDataType}
                    readonly={readonly}
                    handle={typeFieldHandle}
                    // Children live in the members card below — picks
                    // here always extend
                    visibleRelations={["parent", "list", "group"]}
                    addRelation="parent"
                    // A staged type can't itself be a group — creating its
                    // members would republish other types before the parent
                    // drawer saves
                    offerGroup={!editedDataType && !stageDraft}
                    childCompatibility={childCompatibility}
                    groupRootRef={groupRootRef}
                  />
                </Form.Field>
              </Box>
            </Box>

            {hasGroupEntry ? (
              <Box sx={sectionCardSx}>
                <Box sx={{ padding: "16px 18px 18px" }}>
                  <Form.Field
                    label="Group members"
                    as="legend"
                    labelActions={addTypeLabelAction(
                      groupMembersFieldHandle,
                      childEntryCount > 0 ? "Add another type" : "Add a type",
                    )}
                    errors={
                      errors.groupMembers ? [errors.groupMembers] : undefined
                    }
                  >
                    {membersField}
                  </Form.Field>
                </Box>
              </Box>
            ) : null}

            {showConstraintCard ? (
              <Box sx={sectionCardSx}>
                <Box sx={{ padding: "16px 18px 18px" }}>
                  <Form.Field
                    label="Constraints"
                    as="legend"
                    description={
                      childTypeTitles.length > 0
                        ? `Types extending this one inherit its constraints, so anything set here also applies to ${summarizeTypeTitles(childTypeTitles)}.`
                        : undefined
                    }
                    labelActions={
                      <AddConstraintMenu
                        primitive={constraintPrimitive}
                        inherited={inheritedConstraints}
                        state={constraintState}
                        onChange={setConstraintState}
                        readonly={readonly}
                      />
                    }
                  >
                    <ConstraintsField
                      primitive={constraintPrimitive}
                      inherited={inheritedConstraints}
                      state={constraintState}
                      onChange={setConstraintState}
                      childTypeTitles={childTypeTitles}
                      readonly={readonly}
                    />
                  </Form.Field>
                </Box>
              </Box>
            ) : null}

            {conversionCard}
            {appearanceCard}

            {showAddConstraintButton || addConversionButton ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 1.5,
                }}
              >
                {showAddConstraintButton ? (
                  <AddConstraintMenu
                    primitive={constraintPrimitive}
                    inherited={inheritedConstraints}
                    state={constraintState}
                    onChange={setConstraintState}
                    readonly={readonly}
                  />
                ) : null}
                {addConversionButton}
              </Box>
            ) : null}

            {showExtendedByCard ? (
              <Box sx={sectionCardSx}>
                <Box sx={{ padding: "16px 18px 18px" }}>
                  <Form.Field
                    label="Extended by"
                    as="legend"
                    description={
                      extendedByExpanded
                        ? "These types extend this type, inheriting its constraints."
                        : `${childEntryCount} ${childEntryCount === 1 ? "type extends" : "types extend"} this type.`
                    }
                    labelActions={
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
                      >
                        {extendedByExpanded
                          ? addTypeLabelAction(
                              groupMembersFieldHandle,
                              "Add another type",
                            )
                          : null}
                        <Button
                          variant="ghost"
                          size="xs"
                          iconName={
                            extendedByExpanded ? "chevronDown" : "chevronRight"
                          }
                          tooltip={
                            extendedByExpanded
                              ? "Hide the extending types"
                              : "Show the extending types"
                          }
                          onClick={() =>
                            setExtendedByExpanded((previous) => !previous)
                          }
                        />
                      </Box>
                    }
                    errors={
                      errors.groupMembers ? [errors.groupMembers] : undefined
                    }
                  >
                    {extendedByExpanded ? membersField : null}
                  </Form.Field>
                </Box>
              </Box>
            ) : null}

            {errors.submit ? (
              <Banner tone="error">
                <Banner.Description as="div">
                  {errors.submit}
                </Banner.Description>
              </Banner>
            ) : null}

            {stagedChangeWarnings.length > 0 ? (
              // Always just above the action buttons: the spacer pushes the
              // banner to the body's bottom when content is short, and sticky
              // keeps it pinned at the scrollport bottom when it scrolls. The
              // body-coloured backdrop keeps scrolled cards from showing
              // through the banner's translucent fill.
              <>
                <Box sx={{ flexGrow: 1 }} />
                <Box
                  sx={{
                    position: "sticky",
                    bottom: 0,
                    zIndex: 1,
                    background: "#fbfbfb",
                    borderRadius: "10px",
                  }}
                >
                  <Banner tone="warning">
                    <Banner.Description as="div">
                      {stagedChangeWarnings.map((warning) => (
                        <Typography
                          key={warning}
                          sx={{ fontSize: 14, "& + &": { marginTop: 1 } }}
                        >
                          {warning}
                        </Typography>
                      ))}
                    </Banner.Description>
                  </Banner>
                </Box>
              </>
            ) : null}
          </Stack>
        </Drawer.Body>
        <Drawer.Footer
          secondaryActions={
            readonly ? undefined : (
              <Button
                ref={cancelButtonRef}
                variant="subtle"
                onClick={() => requestClose()}
                disabled={submitting}
              >
                Cancel
              </Button>
            )
          }
          actions={
            readonly ? (
              <Button ref={cancelButtonRef} variant="subtle" onClick={onClose}>
                Close
              </Button>
            ) : (
              <Button
                variant="solid"
                tone="brand"
                loading={submitting}
                disabled={!canSubmit}
                onClick={() => {
                  void handleSubmit();
                }}
              >
                {editedDataType
                  ? stagedEdit?.republishesEditedType
                    ? "Save as new version"
                    : "Save changes"
                  : stageDraft
                    ? "Add to group"
                    : "Create"}
              </Button>
            )
          }
        />
      </Drawer>
      {editedDataType && extendTypeDrawerOpen ? (
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the editor nests itself: a create drawer stacked on the edit drawer
        <DataTypeEditorDrawer
          mode="create"
          swapKey={`${swapKey}-extend`}
          initialExtendsDataTypeId={editedDataType.schema.$id}
          onClose={() => setExtendTypeDrawerOpen(false)}
          onCreated={handleExtendingTypeCreated}
        />
      ) : null}
      {memberDraftDrawerOpen ? (
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the editor nests itself: a staging drawer stacked on this one
        <DataTypeEditorDrawer
          mode="stage"
          swapKey={`${swapKey}-new-member`}
          // The members' shared root seeds the new member's Extends pick,
          // keeping it in the group's value category; the group ref itself
          // is added at creation time, once a saved version exists to point
          // at
          initialExtendsDataTypeId={groupRootRef ?? undefined}
          unavailableTypeUrls={
            new Set(stagedMemberDrafts.map((draft) => draft.versionedUrl))
          }
          onClose={() => setMemberDraftDrawerOpen(false)}
          onStaged={handleMemberDraftStaged}
        />
      ) : null}
      {abandonDraftsDialogOpen ? (
        <Dialog
          size="sm"
          // Dismissing (Cancel, the close button, Escape) returns to the
          // still-open editor; only Keep and Discard close it
          shouldCloseOn="closeButton"
          onClose={dismissAbandonDialog}
          aria-label={
            stagedMemberDrafts.length === 1
              ? "Keep the new data type?"
              : "Keep the new data types?"
          }
        >
          <Dialog.Header
            title={
              stagedMemberDrafts.length === 1
                ? "Keep the new data type?"
                : "Keep the new data types?"
            }
          />
          <Dialog.Body>
            <Typography sx={{ fontSize: 14 }}>
              {summarizeTypeTitles(
                stagedMemberDrafts.map((draft) => draft.dataType.title),
              )}
              {stagedMemberDrafts.length === 1 ? " was" : " were"} created for
              this group, but the group isn’t being saved.
              {stagedMemberDrafts.length === 1
                ? " Keep it as a standalone data type, or discard it."
                : " Keep them as standalone data types, or discard them."}
            </Typography>
            {keepDraftsError ? (
              <Typography
                sx={{
                  fontSize: 13,
                  marginTop: 1,
                  color: ({ palette }) => palette.red[70],
                }}
              >
                {keepDraftsError}
              </Typography>
            ) : null}
          </Dialog.Body>
          <Dialog.Footer
            secondaryActions={
              <Button
                variant="subtle"
                disabled={keepingDrafts}
                onClick={dismissAbandonDialog}
              >
                Cancel
              </Button>
            }
            actions={
              <>
                <Button
                  variant="subtle"
                  loading={keepingDrafts}
                  onClick={() => {
                    void keepAbandonedDrafts();
                  }}
                >
                  {stagedMemberDrafts.length === 1 ? "Keep type" : "Keep types"}
                </Button>
                <Button
                  variant="solid"
                  tone="error"
                  disabled={keepingDrafts}
                  onClick={finishClose}
                >
                  Discard
                </Button>
              </>
            }
          />
        </Dialog>
      ) : null}
    </>
  );
};

export const DataTypeEditorDrawer = ({
  onClose,
  swapKey = "data-type-editor",
  ...modeProps
}: DataTypeEditorDrawerProps) => {
  const { dataTypes, latestDataTypes } = useDataTypesContext();

  const notFound = modeProps.mode === "load" && !!modeProps.notFound;

  return (
    /**
     * The drawer must escape whatever opened it: rendered inside the slide
     * stack it would inherit the slide's stacking context (clipping its
     * backdrop and risking burial under later slides). The portal mounts it
     * at the body, and the scope's z-index puts it above the slide stack
     * (slides sit at `zIndex.drawer + 2 + position`).
     */
    <Portal>
      <DsComponentsScope
        overlayStackRoot
        sx={{
          position: "relative",
          zIndex: ({ zIndex }) => zIndex.modal + 1,
          // The slot recipes carry the layer-polyfill's specificity boost,
          // hence the !important overrides. The footer takes no className
          // when given `actions`, so it is addressed as the body's sibling.
          "& .data-type-editor-body": {
            backgroundColor: "#fbfbfb !important",
          },
          "& .data-type-editor-body + div": {
            backgroundColor: "#fbfbfb !important",
            borderTop: "none !important",
          },
          // The header — the element directly preceding the body
          "& div:has(+ .data-type-editor-body)": {
            borderBottomColor: "var(--colors-neutral-s40) !important",
          },
        }}
      >
        {modeProps.mode !== "load" && dataTypes && latestDataTypes ? (
          <DataTypeEditorDrawerInner
            onClose={onClose}
            swapKey={swapKey}
            editedDataType={
              modeProps.mode === "edit" ? modeProps.dataType : null
            }
            initialTitle={
              modeProps.mode === "create" ? modeProps.initialTitle : undefined
            }
            initialExtendsDataTypeId={
              modeProps.mode === "create" || modeProps.mode === "stage"
                ? modeProps.initialExtendsDataTypeId
                : undefined
            }
            onSaved={
              modeProps.mode === "create"
                ? modeProps.onCreated
                : modeProps.mode === "edit"
                  ? modeProps.onUpdated
                  : // Staging never saves, so nothing arrives here
                    () => undefined
            }
            stageDraft={
              modeProps.mode === "stage" ? modeProps.onStaged : undefined
            }
            unavailableTypeUrls={
              modeProps.mode === "stage"
                ? modeProps.unavailableTypeUrls
                : undefined
            }
            readonly={
              modeProps.mode === "edit" ? modeProps.readonly : undefined
            }
            dataTypes={dataTypes}
            latestDataTypes={latestDataTypes}
          />
        ) : notFound ? (
          <Drawer
            size="lg"
            position="right"
            variant="plain"
            swapKey={swapKey}
            onClose={onClose}
          >
            <Drawer.Body className="data-type-editor-body">
              <Typography sx={{ fontSize: 14 }}>
                This data type could not be loaded — it may have been archived
                or deleted.
              </Typography>
            </Drawer.Body>
            <Drawer.Footer
              actions={
                <Button variant="subtle" onClick={onClose}>
                  Close
                </Button>
              }
            />
          </Drawer>
        ) : (
          <Drawer
            size="lg"
            position="right"
            variant="plain"
            swapKey={swapKey}
            onClose={onClose}
            loading
          >
            <Drawer.Body className="data-type-editor-body">{null}</Drawer.Body>
          </Drawer>
        )}
      </DsComponentsScope>
    </Portal>
  );
};
