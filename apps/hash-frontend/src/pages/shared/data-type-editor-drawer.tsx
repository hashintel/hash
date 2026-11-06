import { useLazyQuery, useMutation } from "@apollo/client";
import { Box, Portal, Stack } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useContext, useMemo, useState } from "react";

import {
  extractBaseUrl,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import {
  Banner,
  BreadCrumbs,
  Button,
  Drawer,
  Form,
  TextArea,
  TextInput,
} from "@hashintel/ds-components";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { useUserOrOrgShortnameByWebId } from "../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import {
  createDataTypeMutation,
  queryDataTypesQuery,
  updateDataTypeMutation,
} from "../../graphql/queries/ontology/data-type.queries";
import { useAuthenticatedUser } from "./auth-info-context";
import { AllowedTypesField } from "./data-type-editor-drawer/allowed-types-field";
import { EditableHeader } from "./data-type-editor-drawer/editable-header";
import {
  arraySchemaFromListConfig,
  listConfigFromArraySchema,
  listDataTypeBaseUrl,
  listDataTypeId,
} from "./data-type-editor-drawer/shared/list-config";
import { primitiveRootTypeByBaseUrl } from "./data-type-editor-drawer/shared/primitive-root-types";
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
import type { AllowedTypeEntry } from "./data-type-editor-drawer/allowed-types-field";
import type {
  BaseUrl,
  DataType,
  DataTypeWithMetadata,
  SingleValueConstraints,
  SingleValueSchema,
  VersionedUrl,
} from "@blockprotocol/type-system";

type DataTypeEditorDrawerProps = {
  onClose: () => void;
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
      onUpdated: (dataType: DataTypeWithMetadata) => void;
    }
);

type FormErrors = {
  title?: string;
  description?: string;
  allowedTypes?: string;
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

type ReferenceEntry = Extract<AllowedTypeEntry, { dataTypeId: VersionedUrl }>;
type ListEntry = Extract<AllowedTypeEntry, { relation: "list" }>;

/**
 * The edited type's own value constraints: the primary parent's primitive
 * when there are no lists, otherwise the list schemas — joined by `anyOf`
 * with the primitive when both are present, so every selected alternative
 * stays expressed on the type itself.
 */
const buildOwnConstraints = ({
  primitive,
  listEntries,
}: {
  primitive: SingleValueConstraints["type"] | null;
  listEntries: ListEntry[];
}):
  | SingleValueSchema
  | { anyOf: [SingleValueSchema, ...SingleValueSchema[]] } => {
  const arms: SingleValueSchema[] = [
    ...(primitive ? [{ type: primitive } as SingleValueSchema] : []),
    ...listEntries.map((entry) => arraySchemaFromListConfig(entry.config)),
  ];

  if (arms.length === 0) {
    return { type: "string" };
  }
  if (arms.length === 1) {
    return arms[0]!;
  }
  return { anyOf: arms as [SingleValueSchema, ...SingleValueSchema[]] };
};

const DataTypeEditorDrawerInner = ({
  onClose,
  editedDataType,
  initialTitle,
  initialExtendsDataTypeId,
  onSaved,
  dataTypes,
  latestDataTypes,
}: {
  onClose: () => void;
  /** `null` when creating a new data type */
  editedDataType: DataTypeWithMetadata | null;
  initialTitle?: string;
  initialExtendsDataTypeId?: VersionedUrl;
  onSaved: (dataType: DataTypeWithMetadata) => void;
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
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
  >(queryDataTypesQuery);

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

    return [...parents, ...listEntries, ...children];
  });

  const [title, setTitle] = useState(
    editedDataType ? editedDataType.schema.title : (initialTitle ?? ""),
  );
  const [description, setDescription] = useState(
    editedDataType?.schema.description ?? "",
  );
  const [allowedTypes, setAllowedTypes] =
    useState<AllowedTypeEntry[]>(initialEntries);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

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

  const handleSubmit = async () => {
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

    if (
      !editedDataType &&
      allowedTypes.length > 0 &&
      !parentEntries.length &&
      !listEntries.length
    ) {
      nextErrors.allowedTypes = "Select the type this data type extends";
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

        const { versionedUrl } = generateTypeUrlsForUser({
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
              temporalAxes: currentTimeInstantTemporalAxes,
            },
          },
        });

        if (existing.data?.queryDataTypes.dataTypes.length) {
          setErrors({ title: "A data type with this name already exists" });
          return;
        }

        const primary = parentEntries[0];
        let primitive: SingleValueConstraints["type"] | null = null;

        if (primary) {
          const parentInfo = resolveParentPrimitive(primary.dataTypeId);

          if (!parentInfo) {
            throw new Error(`Could not find data type ${primary.dataTypeId}`);
          }

          primitive = parentInfo.primitive ?? "string";
        }

        const response = await createDataType({
          variables: {
            webId: activeWorkspaceWebId,
            dataType: {
              ...buildOwnConstraints({ primitive, listEntries }),
              title: trimmedTitle,
              description: trimmedDescription,
              abstract: false,
              allOf:
                parentEntries.length > 0
                  ? parentEntries.map(({ dataTypeId }) => ({
                      $ref: dataTypeId,
                    }))
                  : [{ $ref: listDataTypeId }],
            },
          },
        });

        if (response.errors?.length || !response.data) {
          throw new Error("Could not create data type");
        }

        const created = response.data.createDataType;

        await Promise.all(
          childEntries.map(({ dataTypeId }) =>
            applyChildAllOfChange({
              childId: dataTypeId,
              addRef: created.schema.$id,
              removeBaseUrl: created.metadata.recordId.baseUrl,
            }),
          ),
        );

        refetchAllDataTypes();
        onSaved(created);
      } else {
        const originalSchema = editedDataType.schema;
        const editedBaseUrl = editedDataType.metadata.recordId.baseUrl;

        const originalParentIds = (originalSchema.allOf ?? [])
          .map(({ $ref }) => $ref)
          .filter((id) => extractBaseUrl(id) !== listDataTypeBaseUrl);
        const nextParentIds = parentEntries.map(({ dataTypeId }) => dataTypeId);

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

        let latest = editedDataType;

        if (
          trimmedTitle !== originalSchema.title ||
          trimmedDescription !== originalSchema.description ||
          parentsChanged ||
          listsChanged
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
            label,
            abstract,
            ...constraints
          } = originalSchema;

          const oldPrimitive = primitiveTypeFromSchema(originalSchema);
          const newParentInfo = nextParentIds[0]
            ? resolveParentPrimitive(nextParentIds[0])
            : null;
          const newPrimitive = newParentInfo?.primitive ?? null;
          const primaryPrimitive = newParentInfo
            ? (newParentInfo.primitive ?? "string")
            : null;

          const keepConstraints =
            !parentsChanged ||
            newPrimitive === null ||
            newPrimitive === oldPrimitive;

          const constraintsPart =
            listEntries.length > 0 || initialListEntries.length > 0
              ? buildOwnConstraints({
                  primitive: primaryPrimitive,
                  listEntries,
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
                label,
                abstract,
                allOf:
                  nextParentIds.length > 0
                    ? nextParentIds.map(($ref) => ({ $ref }))
                    : listEntries.length > 0
                      ? [{ $ref: listDataTypeId }]
                      : undefined,
              },
              conversions: editedDataType.metadata.conversions ?? {},
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
        ]);

        refetchAllDataTypes();
        onSaved(latest);
      }
    } catch (error) {
      setErrors({
        submit:
          error instanceof Error
            ? error.message
            : "Something went wrong — please try again",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      size="lg"
      position="right"
      variant="plain"
      swapKey="data-type-editor"
      shouldCloseOn="closeButton"
      onClose={onClose}
      aria-label={editedDataType ? "Edit data type" : "Create data type"}
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
            "& nav": { display: "flex", alignItems: "center", height: "100%" },
            // One step lighter than the ds crumb weight (450); !important beats
            // the layer-polyfill's specificity boost on the recipe rule
            "& li": { fontWeight: "400 !important" },
          }}
        >
          <BreadCrumbs
            size="md"
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
                  errors={errors.description ? [errors.description] : undefined}
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
                label="Type"
                as="legend"
                description={
                  allowedTypes.length === 0
                    ? "Select one type to extend it, or add several to allow values of any of them."
                    : allowedTypes.length === 1
                      ? "This type extends the type below."
                      : "Values of this type can be any of the types below."
                }
                errors={errors.allowedTypes ? [errors.allowedTypes] : undefined}
              >
                <AllowedTypesField
                  value={allowedTypes}
                  onChange={(next) => {
                    setAllowedTypes(next);
                    setErrors((prev) => ({ ...prev, allowedTypes: undefined }));
                  }}
                  excludedBaseUrl={editedDataType?.metadata.recordId.baseUrl}
                  canEditDataType={canEditDataType}
                />
              </Form.Field>
            </Box>
          </Box>

          {errors.submit ? (
            <Banner tone="error">
              <Banner.Description as="div">{errors.submit}</Banner.Description>
            </Banner>
          ) : null}
        </Stack>
      </Drawer.Body>
      <Drawer.Footer
        secondaryActions={
          <Button variant="subtle" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        }
        actions={
          <Button
            variant="solid"
            tone="brand"
            loading={submitting}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {editedDataType ? "Save changes" : "Create"}
          </Button>
        }
      />
    </Drawer>
  );
};

export const DataTypeEditorDrawer = ({
  onClose,
  ...modeProps
}: DataTypeEditorDrawerProps) => {
  const { dataTypes, latestDataTypes } = useDataTypesContext();

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
        {dataTypes && latestDataTypes ? (
          <DataTypeEditorDrawerInner
            onClose={onClose}
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
            dataTypes={dataTypes}
            latestDataTypes={latestDataTypes}
          />
        ) : (
          <Drawer
            size="lg"
            position="right"
            variant="plain"
            swapKey="data-type-editor"
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
