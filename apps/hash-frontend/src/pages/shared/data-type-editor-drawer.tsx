import { useLazyQuery, useMutation } from "@apollo/client";
import { Box, Portal, Stack, Typography } from "@mui/material";
import { isEqual } from "lodash";
import { useRouter } from "next/router";
import { useCallback, useContext, useMemo, useRef, useState } from "react";

import {
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

import { useUserOrOrgShortnameByWebId } from "../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
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
import type { RefObject } from "react";

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
  conversions?: string;
  submit?: string;
};

const sectionCardSx = {
  background: "white",
  borderRadius: "10px",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.06)",
} as const;

/** A field label with its helper text inline beside it, not underneath */
const InlineFieldLabel = ({
  label,
  description,
}: {
  label: string;
  description: string;
}) => (
  <>
    {label}
    <Box
      component="span"
      sx={{
        marginLeft: 1,
        fontWeight: 400,
        fontSize: 14,
        color: "var(--colors-fg-subtle)",
      }}
    >
      {description}
    </Box>
  </>
);

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
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  readonly?: boolean;
}) => {
  const router = useRouter();

  const { authenticatedUser } = useAuthenticatedUser();
  const { activeWorkspaceWebId } = useContext(WorkspaceContext);
  const { shortname: editedWebShortname } = useUserOrOrgShortnameByWebId({
    webId:
      editedDataType && "webId" in editedDataType.metadata
        ? editedDataType.metadata.webId
        : null,
  });
  const generateTypeUrlsForUser = useGenerateTypeUrlsForUser();
  const { refetch: refetchAllDataTypes } = useDataTypesContext();

  const navigateToCrumb = (path: string) => {
    onClose();
    void router.push(path);
  };

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

  const [initialEntries] = useState<AllowedTypeEntry[]>(() => {
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

    // A group's primitive-root parent is plumbing — the graph requires every
    // type to extend something — so the editor shows only the members, and
    // the save path re-synthesizes the root ref
    const visibleParents =
      editedSchema.abstract === true &&
      children.length > 0 &&
      parents.every(
        (entry) =>
          entry.relation !== "parent" ||
          primitiveRootTypeByBaseUrl.has(extractBaseUrl(entry.dataTypeId)),
      )
        ? []
        : parents;

    return [...visibleParents, ...listEntries, ...children];
  });

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
  const extendsFieldHandle = useRef<AllowedTypesFieldHandle>(null);
  const implementedByFieldHandle = useRef<AllowedTypesFieldHandle>(null);

  /** The form as first rendered, for detecting whether anything was edited */
  const [initialFormState] = useState(() => ({
    title,
    description,
    labelLeft,
    labelRight,
    allowedTypes,
    constraintState,
    conversionRows,
  }));

  const hasEdits =
    title !== initialFormState.title ||
    description !== initialFormState.description ||
    labelLeft !== initialFormState.labelLeft ||
    labelRight !== initialFormState.labelRight ||
    !isEqual(allowedTypes, initialFormState.allowedTypes) ||
    !isEqual(constraintState, initialFormState.constraintState) ||
    !isEqual(conversionRows, initialFormState.conversionRows);

  // Creation needs the required fields: a name, a description, and at least
  // one type (the schema always expresses a value type, so one must be picked)
  const canSubmit = editedDataType
    ? hasEdits
    : title.trim().length > 0 &&
      description.trim().length > 0 &&
      allowedTypes.length > 0;

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
      const dataType =
        dataTypes[dataTypeId] ?? latestDataTypes[extractBaseUrl(dataTypeId)];

      return (
        !!dataType &&
        "webId" in dataType.metadata &&
        editableWebIds.has(dataType.metadata.webId)
      );
    },
    [dataTypes, latestDataTypes, editableWebIds],
  );

  const resolveDataType = useCallback(
    (dataTypeId: VersionedUrl) =>
      dataTypes[dataTypeId] ?? latestDataTypes[extractBaseUrl(dataTypeId)],
    [dataTypes, latestDataTypes],
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
   * The primitive a child ("Allow another type" / "Implemented by") pick must
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

  const childEntryCount = allowedTypes.filter(
    (entry) => entry.relation === "child",
  ).length;

  const parentEntryCount = allowedTypes.filter(
    (entry) => entry.relation === "parent",
  ).length;

  const [pendingEntriesChange, setPendingEntriesChange] = useState<{
    next: AllowedTypeEntry[];
    warnings: string[];
    /** The change invalidates the type's conversions — drop them on apply */
    clearConversions: boolean;
  } | null>(null);

  /**
   * The structural consequences of a Type-card change worth confirming:
   * a different value type invalidating the current constraints or
   * conversions, the single-extension ↔ group transition flipping the
   * inheritance model, or extending a converting type whose conversions the
   * new child will not inherit.
   */
  const describeEntriesChangeWarnings = (
    next: AllowedTypeEntry[],
  ): { warnings: string[]; clearConversions: boolean } => {
    const warnings: string[] = [];
    let clearConversions = false;

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

    const oldPrimitive = primitiveOf(allowedTypes);
    const newPrimitive = primitiveOf(next);

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
        `The value type changes from ${primitiveTitle(oldPrimitive)} to ${primitiveTitle(newPrimitive)}, so the current ${primitiveTitle(oldPrimitive)} constraints will no longer apply.`,
      );
    }

    // Conversions are arithmetic over numbers: a type leaving the number
    // value type loses them
    if (
      oldPrimitive === "number" &&
      newPrimitive !== "number" &&
      hasConversionRows
    ) {
      warnings.push(
        `“${displayTitle}” has conversions, which only apply to number values — this change removes them.`,
      );
      clearConversions = true;
    }

    // Conversions are not inherited: extending a converting type does not
    // make the new type convertible. Any already-selected type was warned
    // about on pick, so a member flipping back to the parent slot is exempt
    const currentReferenceBaseUrls = new Set(
      allowedTypes
        .filter((entry): entry is ReferenceEntry => entry.relation !== "list")
        .map((entry) => extractBaseUrl(entry.dataTypeId)),
    );
    const addedConvertingParents = next
      .filter((entry): entry is ReferenceEntry => entry.relation === "parent")
      .filter(
        (entry) =>
          !currentReferenceBaseUrls.has(extractBaseUrl(entry.dataTypeId)),
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

    const titlesOf = (entries: AllowedTypeEntry[]) => {
      const titles = entries
        .filter((entry): entry is ReferenceEntry => entry.relation === "child")
        .map((entry) => resolveDataType(entry.dataTypeId)?.schema.title)
        .filter((childTitle): childTitle is string => childTitle !== undefined);

      return titles.length > 0
        ? summarizeTypeTitles(titles)
        : "the added types";
    };

    const oldChildCount = allowedTypes.filter(
      (entry) => entry.relation === "child",
    ).length;
    const newChildCount = next.filter(
      (entry) => entry.relation === "child",
    ).length;

    if (oldChildCount === 0 && newChildCount > 0) {
      if (editedDataType) {
        warnings.push(
          `“${displayTitle}” becomes a group: ${titlesOf(next)} will extend it and inherit every constraint set on it.`,
        );
      } else {
        // A new group is a pure union: parentless, abstract, with a bare
        // value arm — its staged constraints and conversions don't survive
        warnings.push(
          `“${displayTitle}” becomes a group: it will be saved as an abstract type whose values must use one of its member types, and ${titlesOf(next)} will be republished to extend it.`,
        );

        if (
          oldPrimitive !== null &&
          visibleConstraintKinds({
            primitive: oldPrimitive,
            activeKinds: constraintState.activeKinds,
            inheritedValues: emptyInheritedConstraints.values,
          }).length > 0
        ) {
          warnings.push(
            `Its constraints are removed too — a group adds no constraints of its own.`,
          );
        }

        if (hasConversionRows) {
          warnings.push(
            `Its conversions are removed too — an abstract type has no values to convert.`,
          );
          clearConversions = true;
        }
      }
    } else if (oldChildCount > 0 && newChildCount === 0 && editedDataType) {
      // In create mode nothing was persisted, so dropping back to a single
      // extended type has no consequences worth confirming
      warnings.push(
        `“${displayTitle}” stops being a group: ${titlesOf(allowedTypes)} will no longer extend it or inherit its constraints.`,
      );
    }

    return { warnings, clearConversions };
  };

  /**
   * Creation knows two shapes: extending one type, or a parentless abstract
   * group every pick is a member of. The picker stages the first pick as a
   * parent, so a second reference pick converts it to a member — and dropping
   * back to one reference restores it as the extended parent. Existing types
   * keep their staged relations, as do selections with list arms (those join
   * a parent arm rather than forming a group).
   */
  const normalizeEntryRelations = (
    entries: AllowedTypeEntry[],
  ): AllowedTypeEntry[] => {
    if (editedDataType || entries.some((entry) => entry.relation === "list")) {
      return entries;
    }

    const toRelation: AllowedTypeRelation =
      entries.length >= 2 ? "child" : "parent";

    return entries.map((entry) =>
      entry.relation === "list" || entry.relation === toRelation
        ? entry
        : { ...entry, relation: toRelation },
    );
  };

  const handleAllowedTypesChange = (rawNext: AllowedTypeEntry[]) => {
    const next = normalizeEntryRelations(rawNext);
    const { warnings, clearConversions } = describeEntriesChangeWarnings(next);

    if (warnings.length > 0) {
      setPendingEntriesChange({ next, warnings, clearConversions });
      return;
    }

    setAllowedTypes(next);
    setErrors((prev) => ({ ...prev, allowedTypes: undefined }));
  };

  /**
   * A second pick makes the first a group member, republished to extend the
   * group — impossible without permission to edit it, so the add picker is
   * blocked up front
   */
  const groupFormationBlockedReason = useMemo(() => {
    if (editedDataType || allowedTypes.length !== 1) {
      return undefined;
    }

    const [only] = allowedTypes;
    if (!only || only.relation === "list" || canEditDataType(only.dataTypeId)) {
      return undefined;
    }

    const blockedTitle =
      resolveDataType(only.dataTypeId)?.schema.title ?? "the selected type";
    return `Adding another type creates a group, which republishes “${blockedTitle}” to extend it — you don't have permission to edit “${blockedTitle}”`;
  }, [editedDataType, allowedTypes, canEditDataType, resolveDataType]);

  /**
   * A saved concrete type that other types are grouped under — only
   * pre-existing data can be in this state, since saving a group always
   * turns it abstract.
   */
  const isConcreteGroup =
    !!editedDataType &&
    editedDataType.schema.abstract !== true &&
    childEntryCount > 0;

  const typeCardDescription =
    allowedTypes.length === 0
      ? "Select one type to extend it, or add several to group them under an abstract type."
      : childEntryCount > 0
        ? "A value of this type can be any of the types below."
        : allowedTypes.some((entry) => entry.relation === "list")
          ? "Values of this type can be any of the types below."
          : allowedTypes.length === 1
            ? "This type extends the type below."
            : "This type extends all of the types below.";

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
    !(childEntryCount > 0 && !editedDataType);

  const showConversionCard = conversionsApplicable && conversionRows.length > 0;
  const showAddConversionButton =
    conversionsApplicable && !showConversionCard && !readonly;

  /** Value labels decorate displayed values — a number or text thing */
  const appearanceApplicable =
    constraintPrimitive === "number" || constraintPrimitive === "string";

  const conversionTargetOptions = useMemo(() => {
    const viewedBaseUrl = editedDataType?.metadata.recordId.baseUrl;

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
      .map((dataType) => ({
        baseUrl: dataType.metadata.recordId.baseUrl,
        title: dataType.schema.title,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [latestDataTypes, editedDataType]);

  const resolveConversionTitle = useCallback(
    (baseUrl: BaseUrl) => latestDataTypes[baseUrl]?.schema.title ?? baseUrl,
    [latestDataTypes],
  );

  const applyChildAllOfChange = async ({
    childId,
    addRef,
    removeBaseUrl,
  }: {
    childId: VersionedUrl;
    addRef?: VersionedUrl;
    removeBaseUrl: BaseUrl;
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
        conversions: child.metadata.conversions ?? {},
      },
    });

    if (response.errors?.length || !response.data) {
      throw new Error(`Could not update data type ${child.schema.title}`);
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
      throw new Error(
        `Could not update conversions on ${dataType.schema.title}`,
      );
    }
  };

  /** The staged conversion rows as (target, factor) pairs the planner takes */
  const desiredConversionRows = () =>
    conversionRows
      .filter((row) => !row.viaCanonical && !row.formula)
      .flatMap((row) => {
        const factor = rowEffectiveFactor(row);
        return row.targetBaseUrl !== null && factor !== null
          ? [{ targetBaseUrl: row.targetBaseUrl, factor }]
          : [];
      });

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

    const parentEntries = allowedTypes.filter(
      (entry): entry is ReferenceEntry => entry.relation === "parent",
    );
    const childEntries = allowedTypes.filter(
      (entry): entry is ReferenceEntry => entry.relation === "child",
    );
    const listEntries = allowedTypes.filter(
      (entry): entry is ListEntry => entry.relation === "list",
    );

    // An edited type that extended something must keep a parent or list —
    // except a new group, which is deliberately parentless: its members
    // extend it, and its own arm is just their shared primitive
    const initiallyExtends = initialEntries.some(
      (entry) => entry.relation === "parent" || entry.relation === "list",
    );

    if (
      (!editedDataType ? childEntries.length === 0 : initiallyExtends) &&
      allowedTypes.length > 0 &&
      !parentEntries.length &&
      !listEntries.length
    ) {
      nextErrors.allowedTypes = "Select the type this data type extends";
    }

    if (!editedDataType && childEntries.length > 0) {
      if (listEntries.length > 0) {
        nextErrors.allowedTypes =
          "A group can't include list types — remove the list or the extra types";
      } else if (childEntryPrimitive === null) {
        nextErrors.allowedTypes = "The grouped types must share one value type";
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

    // The synthesized parent for a parentless group — see primitiveRootRefFor
    const groupRootRef =
      parentEntries.length === 0 &&
      listEntries.length === 0 &&
      childEntries.length > 0
        ? primitiveRootRefFor(childEntryPrimitive)
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

        if (existing.data?.queryDataTypes.dataTypes.length) {
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

        // Planned unconditionally: when conversions stopped applying (e.g.
        // the value type left number), the cleared rows must still remove
        // their stored pairings
        const conversionPlan = planConversionUpdates({
          viewedBaseUrl: newBaseUrl,
          desiredRows: desiredConversionRows(),
          initialRows: plannableInitialConversionRows(),
          groups: conversionGroups,
          latestDataTypes,
        });
        const ownConversions = conversionPlan.find(
          (entry) => entry.baseUrl === newBaseUrl,
        )?.conversions;

        const response = await createDataType({
          variables: {
            webId: activeWorkspaceWebId,
            dataType: {
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
            },
            conversions: ownConversions,
          },
        });

        if (response.errors?.length || !response.data) {
          throw new Error("Could not create data type");
        }

        const created = response.data.createDataType;

        try {
          await Promise.all([
            ...childEntries.map(({ dataTypeId }) =>
              applyChildAllOfChange({
                childId: dataTypeId,
                addRef: created.schema.$id,
                removeBaseUrl: created.metadata.recordId.baseUrl,
              }),
            ),
            ...conversionPlan
              .filter((entry) => entry.baseUrl !== newBaseUrl)
              .map(applyConversionsToType),
          ]);
        } catch (error) {
          // The type exists now, so pressing Create again would only hit the
          // name-collision check — surface the real state instead
          refetchAllDataTypes();
          throw new Error(
            `“${trimmedTitle}” was created, but updating its related types failed${
              error instanceof Error ? `: ${error.message}` : ""
            }. Close this drawer and edit “${trimmedTitle}” to finish the remaining changes.`,
          );
        }

        refetchAllDataTypes();
        onSaved(created);
      } else {
        const originalSchema = editedDataType.schema;
        const editedBaseUrl = editedDataType.metadata.recordId.baseUrl;

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

        // Deliberately grouping types turns the group abstract — but a saved
        // concrete type whose extenders show up here as children must stay
        // concrete: flipping it would break its existing values. Removing a
        // group's every member ends the group: the type takes values again,
        // while a type that was abstract without members stays abstract.
        const originalAbstract = originalSchema.abstract === true;
        const hadInitialChildren = initialEntries.some(
          (entry) => entry.relation === "child",
        );
        const nextAbstract =
          childEntries.length > 0
            ? originalAbstract || !isConcreteGroup
            : originalAbstract && !hadInitialChildren;
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
          groups: conversionGroups,
          latestDataTypes,
        });
        const ownConversionsEntry = conversionPlan.find(
          (entry) => entry.baseUrl === editedBaseUrl,
        );

        let latest = editedDataType;

        if (
          trimmedTitle !== originalSchema.title ||
          trimmedDescription !== originalSchema.description ||
          parentsChanged ||
          listsChanged ||
          constraintsChanged ||
          abstractChanged ||
          labelChanged ||
          ownConversionsEntry !== undefined
        ) {
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
            throw new Error("Could not update data type");
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

        try {
          await Promise.all([
            ...addedChildren.map(({ dataTypeId }) =>
              applyChildAllOfChange({
                childId: dataTypeId,
                addRef: latest.schema.$id,
                removeBaseUrl: editedBaseUrl,
              }),
            ),
            ...removedChildren.map(({ dataTypeId }) =>
              applyChildAllOfChange({
                childId: dataTypeId,
                removeBaseUrl: editedBaseUrl,
              }),
            ),
            ...conversionPlan
              .filter((entry) => entry.baseUrl !== editedBaseUrl)
              .map(applyConversionsToType),
          ]);
        } catch (error) {
          if (latest === editedDataType) {
            throw error;
          }
          // The type itself was republished, so the staged $id is stale —
          // retrying from this form would target a superseded version
          refetchAllDataTypes();
          throw new Error(
            `“${trimmedTitle}” was saved, but updating its related types failed${
              error instanceof Error ? `: ${error.message}` : ""
            }. Close this drawer and edit “${trimmedTitle}” to finish the remaining changes.`,
          );
        }

        refetchAllDataTypes();
        onSaved(latest);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong — please try again";

      // The graph reports a base-URL collision (e.g. with an archived type)
      // only as a generic insertion failure
      if (message === "Could not insert into store") {
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

  const appearanceCard = appearanceApplicable ? (
    <Box sx={sectionCardSx}>
      <Box sx={{ padding: "16px 18px 18px" }}>
        <Form.Field
          label="Appearance"
          as="legend"
          description="Labels shown before and after the value"
        >
          <Box sx={{ display: "flex", gap: 2 }}>
            <Form.Field label="Before the value" size="sm">
              <TextInput
                value={labelLeft}
                onChange={setLabelLeft}
                placeholder="£"
                disabled={readonly}
                size="sm"
                width="xs"
              />
            </Form.Field>
            <Form.Field label="After the value" size="sm">
              <TextInput
                value={labelRight}
                onChange={setLabelRight}
                placeholder="cm"
                disabled={readonly}
                size="sm"
                width="xs"
              />
            </Form.Field>
          </Box>
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
              webShortname={editedWebShortname}
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
            />
          ) : null}
        </Drawer.Header>
        <Drawer.Body className="data-type-editor-body">
          <Stack spacing={2.5}>
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

            {isConcreteGroup ? (
              <>
                <Box sx={sectionCardSx}>
                  <Box sx={{ padding: "16px 18px 18px" }}>
                    <Form.Field
                      label="Constraints"
                      as="legend"
                      labelActions={
                        readonly ? undefined : (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1.5,
                            }}
                          >
                            {addTypeLabelAction(
                              extendsFieldHandle,
                              parentEntryCount > 0
                                ? "Extend another type"
                                : "Add a type to extend",
                            )}
                            {constraintPrimitive !== null ? (
                              <AddConstraintMenu
                                primitive={constraintPrimitive}
                                inherited={inheritedConstraints}
                                state={constraintState}
                                onChange={setConstraintState}
                                readonly={readonly}
                              />
                            ) : null}
                          </Box>
                        )
                      }
                    >
                      <Stack spacing={2.5}>
                        <Form.Field
                          label={
                            <InlineFieldLabel
                              label="Extends"
                              description={`This type inherits the constraints of the ${parentEntryCount === 1 ? "type" : "types"} it extends.`}
                            />
                          }
                          as="legend"
                        >
                          <AllowedTypesField
                            value={allowedTypes}
                            onChange={handleAllowedTypesChange}
                            // Lists are value alternatives, not relations —
                            // shown here so a saved list arm stays editable
                            visibleRelations={["parent", "list"]}
                            addRelation="parent"
                            readonly={readonly}
                            handle={extendsFieldHandle}
                            excludedBaseUrl={
                              editedDataType.metadata.recordId.baseUrl
                            }
                            canEditDataType={canEditDataType}
                          />
                        </Form.Field>
                        {constraintPrimitive !== null ? (
                          <ConstraintsField
                            primitive={constraintPrimitive}
                            inherited={inheritedConstraints}
                            state={constraintState}
                            onChange={setConstraintState}
                            childTypeTitles={[]}
                            readonly={readonly}
                          />
                        ) : null}
                      </Stack>
                    </Form.Field>
                  </Box>
                </Box>

                <Box sx={sectionCardSx}>
                  <Box sx={{ padding: "16px 18px 18px" }}>
                    <Form.Field
                      label={
                        <InlineFieldLabel
                          label="Implemented by"
                          description="These types implement this type, inheriting its constraints."
                        />
                      }
                      as="legend"
                      labelActions={addTypeLabelAction(
                        implementedByFieldHandle,
                        childEntryCount > 0 ? "Add another type" : "Add a type",
                      )}
                      errors={
                        errors.allowedTypes ? [errors.allowedTypes] : undefined
                      }
                    >
                      <AllowedTypesField
                        value={allowedTypes}
                        onChange={handleAllowedTypesChange}
                        visibleRelations={["child"]}
                        addRelation="child"
                        readonly={readonly}
                        handle={implementedByFieldHandle}
                        excludedBaseUrl={
                          editedDataType.metadata.recordId.baseUrl
                        }
                        canEditDataType={canEditDataType}
                        childCompatibility={childCompatibility}
                      />
                    </Form.Field>
                  </Box>
                </Box>
              </>
            ) : (
              <>
                <Box sx={sectionCardSx}>
                  <Box sx={{ padding: "16px 18px 18px" }}>
                    <Form.Field
                      label="Type"
                      as="legend"
                      description={typeCardDescription}
                      labelActions={
                        // With no types picked the field already shows the
                        // first-type input, so an add button is redundant
                        allowedTypes.length > 0
                          ? addTypeLabelAction(
                              typeFieldHandle,
                              "Allow another type",
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
                        excludedBaseUrl={
                          editedDataType?.metadata.recordId.baseUrl
                        }
                        canEditDataType={canEditDataType}
                        readonly={readonly}
                        handle={typeFieldHandle}
                        // Group members stay members — without a parent entry
                        // the picker's first-pick heuristic would misfile them
                        addRelation={childEntryCount > 0 ? "child" : undefined}
                        addDisabledReason={groupFormationBlockedReason}
                        childCompatibility={childCompatibility}
                      />
                    </Form.Field>
                  </Box>
                </Box>

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
              </>
            )}

            {conversionCard}
            {appearanceCard}

            {(showAddConstraintButton && !isConcreteGroup) ||
            addConversionButton ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 1.5,
                }}
              >
                {showAddConstraintButton && !isConcreteGroup ? (
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

            {errors.submit ? (
              <Banner tone="error">
                <Banner.Description as="div">
                  {errors.submit}
                </Banner.Description>
              </Banner>
            ) : null}
          </Stack>
        </Drawer.Body>
        <Drawer.Footer
          secondaryActions={
            readonly ? undefined : (
              <Button
                ref={cancelButtonRef}
                variant="subtle"
                onClick={onClose}
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
                {editedDataType ? "Save changes" : "Create"}
              </Button>
            )
          }
        />
      </Drawer>

      {pendingEntriesChange ? (
        <Dialog
          size="sm"
          onClose={() => setPendingEntriesChange(null)}
          aria-label="Confirm data type change"
        >
          <Dialog.Header title="Change this data type?" />
          <Dialog.Body>
            {pendingEntriesChange.warnings.map((warning) => (
              <Typography
                key={warning}
                sx={{ fontSize: 14, "& + &": { marginTop: 1 } }}
              >
                {warning}
              </Typography>
            ))}
          </Dialog.Body>
          <Dialog.Footer
            secondaryActions={
              <Button
                variant="subtle"
                onClick={() => setPendingEntriesChange(null)}
              >
                Cancel
              </Button>
            }
            actions={
              <Button
                variant="solid"
                tone="brand"
                onClick={() => {
                  setAllowedTypes(pendingEntriesChange.next);
                  if (pendingEntriesChange.clearConversions) {
                    setConversionRows([]);
                  }
                  setErrors((prev) => ({ ...prev, allowedTypes: undefined }));
                  setPendingEntriesChange(null);
                }}
              >
                Continue
              </Button>
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
              modeProps.mode === "create"
                ? modeProps.initialExtendsDataTypeId
                : undefined
            }
            onSaved={
              modeProps.mode === "create"
                ? modeProps.onCreated
                : modeProps.onUpdated
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
