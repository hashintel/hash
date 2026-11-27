import { Box, Container, Stack, Typography } from "@mui/material";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";
import { ArrowUpRightFromSquareRegularIcon } from "@hashintel/design-system";
import {
  Banner,
  BreadCrumbs,
  Button,
  Chip,
  Dialog,
  Drawer,
  Form,
  Icon,
  Menu,
  TextArea,
  TextInput,
} from "@hashintel/ds-components";

import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { DataTypesContext } from "../shared/data-types-context";
import { AppearanceCard } from "./data-type-form/cards/appearance";
import {
  AddConstraintMenu,
  ConstraintsCard,
} from "./data-type-form/cards/constraints";
import {
  ConversionsCard,
  GroupConversionsCard,
} from "./data-type-form/cards/conversions";
import { SectionCard } from "./data-type-form/cards/data-type-card";
import { ExtendedByCard } from "./data-type-form/cards/extended-by";
import { ExtendsCard } from "./data-type-form/cards/extends";
import { GroupMembersCard } from "./data-type-form/cards/group-members";
import { summarizeTypeTitles } from "./data-type-form/constraint-util";
import {
  newConversionRowState,
  newGroupConversionRowState,
} from "./data-type-form/conversion-util";
import {
  collectDraftUrls,
  useDataTypeFormState,
} from "./data-type-form/data-type-form-state";
import { EditableHeader } from "./data-type-form/editable-header";
import { isBaseDataTypeBaseUrl } from "./data-type-form/primitive-root-types";
import { SelectDataTypeInput } from "./data-type-form/select-data-type-input";

import type { ConstraintPrimitive } from "./data-type-form/constraint-util";
import type {
  DataTypeFormStateProps,
  StagedDataTypeDraft,
} from "./data-type-form/data-type-form-state";
import type { SelectDataTypeInputHandle } from "./data-type-form/select-data-type-input";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { RefObject, ComponentType } from "react";

export type { StagedDataTypeDraft };

/** The create and stage prop shapes a nested (stacked) drawer accepts */
export type StackedDrawerProps = { onClose: () => void; swapKey?: string } & (
  | {
      mode: "create";
      initialTitle?: string;
      initialExtendsDataTypeId?: VersionedUrl;
      onCreated: (dataType: DataTypeWithMetadata) => void;
    }
  | {
      mode: "stage";
      initialTitle?: string;
      initialExtendsDataTypeId?: VersionedUrl;
      parentGroupTitle?: string;
      siblingDrafts?: StagedDataTypeDraft[];
      coMemberBaseUrls?: BaseUrl[];
      initialDraft?: StagedDataTypeDraft;
      restrictParentPrimitive?: ConstraintPrimitive;
      unavailableTypeUrls?: ReadonlySet<VersionedUrl>;
      onStaged: (draft: StagedDataTypeDraft) => void;
    }
);

export type DataTypeFormProps = DataTypeFormStateProps & {
  swapKey: string;
  /** The drawer component, injected so the editor can nest itself without an import cycle */
  StackedDrawer: ComponentType<StackedDrawerProps>;
  /**
   * Where the editor is hosted: inside its own drawer (the default), or laid
   * directly onto a page, which drops the drawer chrome and breadcrumbs in
   * favour of the page's own
   */
  variant?: "drawer" | "page";
  /** Re-opens the editor on another stored version of the edited type */
  onSwitchVersion?: (dataType: DataTypeWithMetadata) => void;
};

export const DataTypeForm = ({
  swapKey,
  StackedDrawer,
  variant = "drawer",
  onSwitchVersion,
  ...stateProps
}: DataTypeFormProps) => {
  const {
    onClose,
    initialDraft,
    restrictParentPrimitive,
    parentGroupTitle,
    initialExtendsDataTypeId,
    stageDraft,
    unavailableTypeUrls,
  } = stateProps;
  const {
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
    requestLeave,
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
    abandoningForAllowedTypesChange,
    keepingDrafts,
    keepDraftsError,
    keepAbandonedDrafts,
    discardDraftsAtStake,
    foldDraftForSave,
  } = useDataTypeFormState(stateProps);

  /**
   * A card-label action opening the field's in-body type picker. The marker
   * attribute keeps the field's dismiss-outside handler from closing the
   * picker on pointerdown before the click toggles it shut.
   */
  const addTypeLabelAction = (
    fieldHandle: RefObject<SelectDataTypeInputHandle | null>,
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
    <SelectDataTypeInput
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
              (typedName) => {
                setCreateNewInitialTitle(typedName);
                setMemberDraftDrawerOpen(true);
              }
            : editedDataType
              ? // The Extended by card creates the extending type in place:
                // this type already exists for it to reference
                (typedName) => {
                  setCreateNewInitialTitle(typedName);
                  setExtendTypeDrawerOpen(true);
                }
              : undefined
      }
      onEditDraft={
        readonly
          ? undefined
          : (dataTypeId) => {
              setEditingDraftUrl(dataTypeId);
              setMemberDraftDrawerOpen(true);
            }
      }
      draftNodesById={stagedDrafts.asNodes}
    />
  );

  const conversionCard = showConversionCard ? (
    <ConversionsCard
      error={errors.conversions}
      // Without eligible targets (the type is in no group) a new row would
      // have nothing to offer
      addRow={
        readonly || conversionTargetOptions.length === 0
          ? undefined
          : () =>
              setConversionRows([
                ...conversionRows,
                newConversionRowState(conversionRows),
              ])
      }
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
        return !!storedDataType && canEditDataType(storedDataType.schema.$id);
      }}
      canRemoveComposed={canRemoveComposedPairing}
      onRemoveComposed={setComposedRemovalRow}
      readonly={readonly}
    />
  ) : null;

  const addConversionButton =
    showAddConversionButton && conversionTargetOptions.length > 0 ? (
      <Button
        variant="subtle"
        size="sm"
        iconName="plus"
        onClick={() => setConversionRows([newConversionRowState([])])}
      >
        Add conversion
      </Button>
    ) : null;

  const groupConversionCard = showGroupConversionCard ? (
    <GroupConversionsCard
      error={errors.conversions}
      addRow={
        readonly
          ? undefined
          : () =>
              setNewGroupConversionRows([
                ...newGroupConversionRows,
                newGroupConversionRowState(groupConversionRows),
              ])
      }
      rows={groupConversionRows}
      onChange={handleGroupConversionRowsChange}
      childOptions={groupConversionChildren.map((baseUrl) => ({
        baseUrl,
        title: resolveConversionTitle(baseUrl),
        // A new pairing is stored on (or republishes) the member — without
        // edit permission on it nothing can be saved. A draft is this
        // drawer's own, created on save.
        disabled: !draftsByBaseUrl.has(baseUrl) && !canEditByBaseUrl(baseUrl),
      }))}
      targetOptionsFor={groupTargetOptionsFor}
      resolveTitle={resolveConversionTitle}
      sectionKeyFor={conversionSectionKeyFor}
      canEditStoredOn={(storedBaseUrl) => {
        if (draftsByBaseUrl.has(storedBaseUrl)) {
          return true;
        }
        const storedDataType = latestDataTypes[storedBaseUrl];
        return !!storedDataType && canEditDataType(storedDataType.schema.$id);
      }}
      readonly={readonly}
    />
  ) : null;

  const addGroupConversionButton = showAddGroupConversionButton ? (
    <Button
      variant="subtle"
      size="sm"
      iconName="plus"
      onClick={() =>
        setNewGroupConversionRows([newGroupConversionRowState([])])
      }
    >
      Add conversion
    </Button>
  ) : null;

  const appearanceCard = appearanceApplicable ? (
    <AppearanceCard
      labelLeft={labelLeft}
      labelRight={labelRight}
      onLabelLeftChange={setLabelLeft}
      onLabelRightChange={setLabelRight}
      inheritedLabel={inheritedLabel}
      readonly={readonly}
    />
  ) : null;

  const bodyContent = (
    <>
      {/* Full-height so the warnings banner can pin to the body's bottom */}
      <Stack spacing={2.5} sx={{ minHeight: "100%" }}>
        {editedDataType ? null : (
          <SectionCard>
            <Stack spacing={2} sx={{ padding: "16px 18px 18px" }}>
              <Box sx={{ display: "flex", gap: 2, "& > *": { flex: 1 } }}>
                <Form.Field
                  label="Name"
                  required
                  errors={errors.title ? [errors.title] : undefined}
                >
                  <TextInput
                    value={title}
                    onChange={setTitle}
                    onBlur={() => {
                      if (!titlePlural) {
                        suggestTitlePlural(title);
                      }
                    }}
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
                <Form.Field label="Plural name">
                  <TextInput
                    value={titlePlural}
                    onChange={setTitlePlural}
                    // Held until the suggestion runs, as on entity types:
                    // leaving the name field fills it when AI is available
                    disabled={
                      !title.trim() ||
                      pluralLoading ||
                      // Never lock out a plural the user already typed —
                      // availability can resolve mid-form
                      (generationAvailable &&
                        !pluralRequestMade &&
                        !titlePlural)
                    }
                    loading={pluralLoading}
                    placeholder={
                      !title.trim()
                        ? "Enter the name first"
                        : pluralLoading
                          ? "Suggesting…"
                          : "e.g. Lengths"
                    }
                    name="data-type-plural-search"
                    width="fullWidth"
                  />
                </Form.Field>
              </Box>

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
          </SectionCard>
        )}

        {readonly && !extendsCardHasVisibleContent ? null : (
          <ExtendsCard
            description={typeCardDescription}
            action={
              // A user extends exactly one type, so the action only
              // offers a pick while none is staged — e.g. child entries
              // exist but the parent was removed (with no entries at
              // all the field already shows the first-type input).
              // Types with several parents still display them all; they
              // just can't gain more.
              allowedTypes.length > 0 &&
              !hasGroupEntry &&
              parentEntryCount === 0 &&
              listEntries.length === 0
                ? addTypeLabelAction(typeFieldHandle, "Extend a type")
                : undefined
            }
            error={errors.allowedTypes}
            value={allowedTypes}
            onChange={handleAllowedTypesChange}
            excludedBaseUrl={editedDataType?.metadata.recordId.baseUrl}
            canEditDataType={canEditDataType}
            readonly={readonly}
            handle={typeFieldHandle}
            isMembershipParentRef={isMembershipParentRef}
            derivedValueRoot={derivedValueRoot}
            offerGroup={!editedDataType || wasGroup}
            childCompatibility={childCompatibility}
            groupBaseRef={groupBaseRef}
            parentPickScope={restrictParentPrimitive}
            pinnedGroupTitle={parentGroupTitle}
            lockedDataTypeId={
              !editedDataType ? initialExtendsDataTypeId : undefined
            }
          />
        )}

        {hasGroupEntry ? (
          <GroupMembersCard
            action={addTypeLabelAction(
              groupMembersFieldHandle,
              childEntryCount > 0 ? "Add another type" : "Add a type",
            )}
            error={errors.groupMembers}
          >
            {membersField}
          </GroupMembersCard>
        ) : null}

        {showConstraintCard && constraintPrimitive !== null ? (
          <ConstraintsCard
            primitive={constraintPrimitive}
            inherited={inheritedConstraints}
            state={constraintState}
            onChange={(state) => {
              setConstraintState(state);
              setErrors((prev) => ({ ...prev, constraints: undefined }));
            }}
            childTypeTitles={childTypeTitles}
            readonly={readonly}
            error={errors.constraints}
          />
        ) : null}

        {conversionCard}
        {groupConversionCard}
        {appearanceCard}

        {showAddConstraintButton ||
        addConversionButton ||
        addGroupConversionButton ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 1.5,
            }}
          >
            {showAddConstraintButton && constraintPrimitive !== null ? (
              <AddConstraintMenu
                primitive={constraintPrimitive}
                inherited={inheritedConstraints}
                state={constraintState}
                onChange={setConstraintState}
                readonly={readonly}
              />
            ) : null}
            {addConversionButton}
            {addGroupConversionButton}
          </Box>
        ) : null}

        {showExtendedByCard ? (
          <ExtendedByCard
            childEntryCount={childEntryCount}
            expanded={extendedByExpanded}
            onToggleExpanded={() =>
              setExtendedByExpanded((previous) => !previous)
            }
            action={addTypeLabelAction(
              groupMembersFieldHandle,
              "Add another type",
            )}
            error={errors.groupMembers}
          >
            {membersField}
          </ExtendedByCard>
        ) : null}

        {errors.submit ? (
          <Banner tone="error">
            <Banner.Description as="div">{errors.submit}</Banner.Description>
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
    </>
  );

  const extendTypeAction = showExtendTypeAction ? (
    <Button
      variant="ghost"
      size="sm"
      iconName="arrowUpRight"
      iconPosition="right"
      onClick={() => {
        setCreateNewInitialTitle("");
        setExtendTypeDrawerOpen(true);
      }}
    >
      Extend this type
    </Button>
  ) : null;

  // New tab, so in-progress drawer edits stay put
  const openPageAction = editedDataType ? (
    <Button
      variant="ghost"
      size="sm"
      href={generateLinkParameters(editedDataType.schema.$id).href}
      target="_blank"
      aria-label="Open the full-page editor in a new tab"
      prefix={<ArrowUpRightFromSquareRegularIcon sx={{ fontSize: 12 }} />}
    />
  ) : null;

  const headerFields = editedDataType ? (
    <EditableHeader
      readonly={readonly}
      title={title}
      titlePlural={titlePlural}
      description={description}
      onTitleChange={(next) => {
        setTitle(next);
        setErrors((prev) => ({ ...prev, title: undefined }));
      }}
      onTitlePluralChange={setTitlePlural}
      onDescriptionChange={(next) => {
        setDescription(next);
        setErrors((prev) => ({ ...prev, description: undefined }));
      }}
      titleError={errors.title}
      descriptionError={errors.description}
      actions={extendTypeAction ?? undefined}
    />
  ) : null;

  const cancelButton = (
    <Button
      ref={cancelButtonRef}
      variant="subtle"
      onClick={() => requestClose()}
      disabled={submitting}
    >
      Cancel
    </Button>
  );

  const submitButton = (
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
          ? initialDraft
            ? "Update type"
            : "Add to group"
          : "Create"}
    </Button>
  );

  const pageActions = readonly ? null : (
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 1.5,
        marginTop: 2.5,
      }}
    >
      {cancelButton}
      {submitButton}
    </Box>
  );

  /**
   * The version readout beside the breadcrumbs (and above the page header):
   * a dropdown over the stored versions when there are several, plus a chip
   * flagging that a non-latest version is in view. Only the latest version
   * is editable, whatever the user's permissions.
   */
  // Base types (the primitive roots and Value) sit at v1 forever — a
  // version readout on them is noise
  const displayedVersion =
    editedDataType &&
    !isBaseDataTypeBaseUrl(editedDataType.metadata.recordId.baseUrl)
      ? editedVersion
      : null;

  const versionMenuItems = editedTypeVersions.map((versionedType, index) => ({
    text: `v${versionedType.metadata.recordId.version}${index === 0 ? " (latest)" : ""}`,
    onClick: () => {
      if (
        onSwitchVersion &&
        versionedType.schema.$id !== editedDataType?.schema.$id
      ) {
        requestLeave(() => onSwitchVersion(versionedType));
      }
    },
  }));

  const latestVersionChip =
    displayedVersion &&
    editedTypeVersions[0] &&
    String(editedTypeVersions[0].metadata.recordId.version) !==
      displayedVersion ? (
      <Chip size="sm" variant="soft" color="blue">
        latest v{String(editedTypeVersions[0].metadata.recordId.version)}
      </Chip>
    ) : null;

  const versionIndicator = displayedVersion ? (
    <>
      {editedTypeVersions.length > 1 && onSwitchVersion ? (
        <Menu
          items={versionMenuItems}
          trigger={
            <Button
              variant="ghost"
              size="xs"
              iconName="chevronDown"
              iconPosition="right"
            >
              v{displayedVersion}
            </Button>
          }
        />
      ) : (
        <Typography
          component="span"
          sx={{
            fontSize: 13,
            color: ({ palette }) => palette.gray[60],
            marginLeft: 0.5,
          }}
        >
          v{displayedVersion}
        </Typography>
      )}
      {latestVersionChip}
    </>
  ) : null;

  return (
    <DataTypesContext.Provider value={scopedDataTypesContext}>
      {variant === "page" ? (
        editedDataType ? (
          <>
            <Box
              sx={({ palette }) => ({
                borderBottom: 1,
                borderColor: palette.gray[20],
                paddingTop: 3.75,
                paddingBottom: 3,
                backgroundColor: palette.common.white,
              })}
            >
              <Container maxWidth="md">
                {versionIndicator ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      marginBottom: 1,
                    }}
                  >
                    {versionIndicator}
                  </Box>
                ) : null}
                {headerFields}
              </Container>
            </Box>
            <Box sx={{ paddingY: 4 }}>
              <Container maxWidth="md">
                {bodyContent}
                {pageActions}
              </Container>
            </Box>
          </>
        ) : (
          // Creation fills its host's container (the new-type page), keeping
          // the form aligned with the host's own heading
          <Box sx={{ paddingBottom: 5 }}>
            {bodyContent}
            {pageActions}
          </Box>
        )
      ) : (
        <Drawer
          size="lg"
          position="right"
          variant="plain"
          swapKey={swapKey}
          shouldCloseOn="closeButtonAndOverlay"
          onClose={onClose}
          onCloseRequest={interceptDrawerClose}
          aria-label={editedDataType ? "Edit data type" : "Create data type"}
          // When editing, focus starts on the footer's Cancel/Close rather than
          // in the name input, which suits a fresh type but not an existing one
          initialFocusRef={editedDataType ? cancelButtonRef : undefined}
        >
          <Drawer.Header
            closeButtonLayout="float"
            className="data-type-editor-header"
          >
            {openPageAction ? (
              // Floated like the drawer's own close button (an earlier
              // right-float), so it lands directly beside it on the same row
              <Box
                sx={{
                  float: "right",
                  position: "relative",
                  zIndex: 1,
                  marginTop:
                    "calc(var(--panel-top-padding) * -1 + var(--panel-close-button-gap))",
                  marginLeft: 1,
                }}
              >
                {openPageAction}
              </Box>
            ) : null}
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
                {editedWebShortname ? (
                  <BreadCrumbs.Item
                    noCollapse
                    onClick={() =>
                      navigateToCrumb(`/@${editedWebShortname}?tab=Types`)
                    }
                  >
                    @{editedWebShortname}
                  </BreadCrumbs.Item>
                ) : null}
                <BreadCrumbs.Item
                  noCollapse
                  onClick={() => navigateToCrumb("/types/data-type")}
                >
                  Data types
                </BreadCrumbs.Item>
                {editedDataType ? (
                  <BreadCrumbs.Item noCollapse current>
                    {editedDataType.schema.title}
                  </BreadCrumbs.Item>
                ) : (
                  <BreadCrumbs.Item noCollapse>New data type</BreadCrumbs.Item>
                )}
                {displayedVersion ? (
                  editedTypeVersions.length > 1 && onSwitchVersion ? (
                    // One custom (non-Item) child rendering verbatim as a
                    // trail entry: the version menu with the latest-version
                    // chip beside it, sharing the entry so no separator
                    // lands between them
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <Menu
                        items={versionMenuItems}
                        trigger={
                          <Box
                            component="button"
                            type="button"
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 0.5,
                              fontSize: "var(--font-sizes-sm)",
                              // !important: the crumb recipe's layer-polyfill
                              // specificity boost outweighs the sx class
                              fontWeight: "500 !important",
                              fontFamily: "inherit",
                              color: "var(--colors-neutral-s120) !important",
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                            }}
                          >
                            v{displayedVersion}
                            <Icon name="chevronDown" size="xs" />
                          </Box>
                        }
                      />
                      {latestVersionChip}
                    </Box>
                  ) : (
                    <BreadCrumbs.Item noCollapse current>
                      v{displayedVersion}
                    </BreadCrumbs.Item>
                  )
                ) : null}
              </BreadCrumbs>
            </Box>
            {headerFields}
          </Drawer.Header>
          <Drawer.Body className="data-type-editor-body">
            {bodyContent}
          </Drawer.Body>
          <Drawer.Footer
            className="data-type-editor-footer"
            secondaryActions={
              readonly ? (
                <Button
                  ref={cancelButtonRef}
                  variant="subtle"
                  onClick={onClose}
                >
                  Close
                </Button>
              ) : (
                cancelButton
              )
            }
            actions={readonly ? undefined : submitButton}
          />
        </Drawer>
      )}
      {editedDataType && extendTypeDrawerOpen ? (
        <StackedDrawer
          mode="create"
          swapKey={`${swapKey}-extend`}
          initialTitle={createNewInitialTitle || undefined}
          // Always extend from the latest version, whichever one is in view
          initialExtendsDataTypeId={
            editedTypeVersions[0]?.schema.$id ?? editedDataType.schema.$id
          }
          onClose={() => setExtendTypeDrawerOpen(false)}
          onCreated={handleExtendingTypeCreated}
        />
      ) : null}
      {memberDraftDrawerOpen ? (
        <StackedDrawer
          mode="stage"
          swapKey={`${swapKey}-new-member`}
          initialTitle={createNewInitialTitle || undefined}
          parentGroupTitle={title.trim() || "Unnamed"}
          // Folded, so conversions staged in the group card (or packed on the
          // drafts) are visible from inside the reopened member drawer
          siblingDrafts={stagedMemberDrafts
            .filter((draft) => draft.versionedUrl !== editingDraftUrl)
            .map(foldDraftForSave)}
          coMemberBaseUrls={groupConversionChildren}
          initialDraft={(() => {
            const editedDraft = editingDraftUrl
              ? stagedDrafts.byUrl.get(editingDraftUrl)
              : undefined;
            return editedDraft ? foldDraftForSave(editedDraft) : undefined;
          })()}
          // The member must stay in the group's value category, so its
          // Extends pick is scoped to that primitive's family — root,
          // descendants, or a new group of them. An empty group inherits the
          // restriction it was itself opened under. The group ref itself is
          // added at creation time, once a saved version exists to point at.
          restrictParentPrimitive={
            childEntryPrimitive ?? restrictParentPrimitive
          }
          // URLs claimed at any depth of the drawer stack stay taken —
          // including the one this unsaved group will itself mint
          unavailableTypeUrls={
            new Set([
              ...(unavailableTypeUrls ?? []),
              ...collectDraftUrls(stagedMemberDrafts, editingDraftUrl),
              ...(!editedDataType && title.trim()
                ? [
                    generateTypeUrlsForUser({
                      kind: "data-type",
                      title: title.trim(),
                      version: makeOntologyTypeVersion({ major: 1 }),
                    }).versionedUrl,
                  ]
                : []),
            ])
          }
          onClose={() => {
            setMemberDraftDrawerOpen(false);
            setEditingDraftUrl(null);
          }}
          onStaged={handleMemberDraftStaged}
        />
      ) : null}
      {composedRemovalRow?.targetBaseUrl ? (
        <Dialog
          size="sm"
          // Dismissing (Cancel, the close button, Escape) keeps the pairing
          shouldCloseOn="closeButton"
          onClose={() => setComposedRemovalRow(null)}
          aria-label="Remove conversions?"
        >
          <Dialog.Header title="Remove conversions?" />
          <Dialog.Body>
            <Typography sx={{ fontSize: 14 }}>
              “{resolveConversionTitle(composedRemovalRow.targetBaseUrl)}” will
              be removed from this conversion group, removing all of these
              conversions:
            </Typography>
            <Box component="ul" sx={{ margin: "8px 0 0", paddingLeft: 2.5 }}>
              {composedRemovalPairings.map(([first, second]) => (
                <Typography
                  component="li"
                  key={`${first}:${second}`}
                  sx={{ fontSize: 14, fontWeight: 600 }}
                >
                  {resolveConversionTitle(first)} ↔{" "}
                  {resolveConversionTitle(second)}
                </Typography>
              ))}
            </Box>
          </Dialog.Body>
          <Dialog.Footer
            secondaryActions={
              <Button
                variant="subtle"
                onClick={() => setComposedRemovalRow(null)}
              >
                Cancel
              </Button>
            }
            actions={
              <Button
                variant="solid"
                tone="error"
                onClick={confirmComposedRemoval}
              >
                Remove all conversions
              </Button>
            }
          />
        </Dialog>
      ) : null}

      {abandonDraftsDialogOpen ? (
        <Dialog
          size="sm"
          // Dismissing (Cancel, the close button, Escape) returns to the
          // still-open editor; only Keep and Discard close it
          shouldCloseOn="closeButton"
          onClose={dismissAbandonDialog}
          aria-label={
            draftsAtStake.length === 1
              ? "Keep the new data type?"
              : "Keep the new data types?"
          }
        >
          <Dialog.Header
            title={
              draftsAtStake.length === 1
                ? "Keep the new data type?"
                : "Keep the new data types?"
            }
          />
          <Dialog.Body>
            <Typography sx={{ fontSize: 14 }}>
              {summarizeTypeTitles(
                draftsAtStake.map((draft) => draft.dataType.title),
              )}
              {draftsAtStake.length === 1 ? " was" : " were"} created for this
              group,
              {abandoningForAllowedTypesChange
                ? draftsAtStake.length === 1
                  ? " but is being removed from it."
                  : " but are being removed from it."
                : " but the group isn’t being saved."}
              {draftsAtStake.length === 1
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
                Back to editor
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
                  {draftsAtStake.length === 1 ? "Keep type" : "Keep types"}
                </Button>
                <Button
                  variant="solid"
                  tone="error"
                  disabled={keepingDrafts}
                  onClick={discardDraftsAtStake}
                >
                  Discard
                </Button>
              </>
            }
          />
        </Dialog>
      ) : null}

      {unsavedChangesDialogOpen ? (
        <Dialog
          size="sm"
          // Dismissing (the close button, Escape) returns to the still-open
          // editor; only Discard closes it
          shouldCloseOn="closeButton"
          onClose={dismissUnsavedChangesDialog}
          aria-label={
            editedDataType
              ? "Discard unsaved changes?"
              : "Discard new data type?"
          }
        >
          <Dialog.Header
            title={
              editedDataType
                ? "Discard unsaved changes?"
                : "Discard new data type?"
            }
          />
          <Dialog.Body>
            <Typography sx={{ fontSize: 14 }}>
              {editedDataType
                ? `Your changes to “${title}” haven’t been saved and will be lost.`
                : "The new data type hasn’t been saved and will be lost."}
            </Typography>
          </Dialog.Body>
          <Dialog.Footer
            secondaryActions={
              <Button variant="subtle" onClick={dismissUnsavedChangesDialog}>
                Keep editing
              </Button>
            }
            actions={
              <Button
                variant="solid"
                tone="error"
                onClick={discardUnsavedChanges}
              >
                {editedDataType ? "Discard changes" : "Discard"}
              </Button>
            }
          />
        </Dialog>
      ) : null}
    </DataTypesContext.Provider>
  );
};
