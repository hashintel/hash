import { useMutation } from "@apollo/client";
import { AsteriskRegularIcon, IconButton } from "@hashintel/design-system";
import { mergePropertiesAndMetadata } from "@local/hash-graph-sdk/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ModalProps } from "@mui/material";
import { Box, Typography, typographyClasses } from "@mui/material";
import type { FunctionComponent, ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DraggableProvided,
  DraggingStyle,
  NotDraggingStyle,
  OnDragEndResponder,
} from "react-beautiful-dnd";
import { DragDropContext, Draggable, Droppable } from "react-beautiful-dnd";
import { createPortal } from "react-dom";
import { useFieldArray, useForm } from "react-hook-form";

import { useBlockProtocolCreateEntityType } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-entity-type";
import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import type { Org, User } from "../../lib/user-and-org";
import { useLatestEntityTypesOptional } from "../../shared/entity-types-context/hooks";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { ArrowUpRightRegularIcon } from "../../shared/icons/arrow-up-right-regular-icon";
import { CustomLinkIcon } from "../../shared/icons/custom-link-icon";
import { GripDotsVerticalRegularIcon } from "../../shared/icons/grip-dots-vertical-regular-icon";
import { PlusRegularIcon } from "../../shared/icons/plus-regular";
import { XMarkRegularIcon } from "../../shared/icons/x-mark-regular-icon";
import { Button, Link, Modal } from "../../shared/ui";
import { entityTypeIcons } from "../../shared/use-entity-icon";
import { ProfileSectionHeading } from "../[shortname]/shared/profile-section-heading";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { EntityTypeSelector } from "../shared/entity-type-selector";
import { useActiveWorkspace } from "../shared/workspace-context";

/** @see https://github.com/atlassian/react-beautiful-dnd/issues/128#issuecomment-1010053365 */
const useDraggableInPortal = () => {
  const element = useRef<HTMLDivElement>(document.createElement("div")).current;

  useEffect(() => {
    element.style.pointerEvents = "none";
    element.style.position = "absolute";
    element.style.height = "100%";
    element.style.width = "100%";
    element.style.top = "0";

    document.body.appendChild(element);

    return () => {
      document.body.removeChild(element);
    };
  }, [element]);

  return (render: (provided: DraggableProvided) => ReactElement) =>
    (provided: DraggableProvided) => {
      const result = render(provided);

      const style = provided.draggableProps.style as
        | DraggingStyle
        | NotDraggingStyle;

      if ("position" in style) {
        return createPortal(result, element);
      }
      return result;
    };
};

type PinnedEntityTypesFormData = {
  pinnedEntityTypes: EntityTypeWithMetadata[];
};

export const EditPinnedEntityTypesModal: FunctionComponent<
  Omit<ModalProps, "children" | "onClose"> & {
    onClose: () => void;
    profile: User | Org;
    refetchProfile: () => Promise<void>;
  }
> = ({ profile, onClose, refetchProfile, ...modalProps }) => {
  const { authenticatedUser } = useAuthenticatedUser();
  const { latestEntityTypes, isSpecialEntityTypeLookup } =
    useLatestEntityTypesOptional();

  const [displayEntityTypesSearch, setDisplayEntityTypesSearch] =
    useState(false);

  const [updateEntity, { loading }] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation, { errorPolicy: "all" });

  const { createEntityType } = useBlockProtocolCreateEntityType(
    authenticatedUser.accountId as OwnedById,
  );

  const { control, reset, handleSubmit, formState } =
    useForm<PinnedEntityTypesFormData>({
      defaultValues: {
        pinnedEntityTypes: [],
      },
    });

  const initializedFields = useRef(false);

  useEffect(() => {
    if (latestEntityTypes && !initializedFields.current) {
      const initialPinnedEntityTypes = latestEntityTypes.filter(
        ({ metadata }) =>
          profile.pinnedEntityTypeBaseUrls?.includes(metadata.recordId.baseUrl),
      );

      initializedFields.current = true;
      reset({ pinnedEntityTypes: initialPinnedEntityTypes });
    }
  }, [latestEntityTypes, profile.pinnedEntityTypeBaseUrls, reset]);

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "pinnedEntityTypes",
  });

  const { activeWorkspace, refetchActiveWorkspace } = useActiveWorkspace();

  const innerSubmit = handleSubmit(async (data) => {
    const { pinnedEntityTypes } = data;

    const updatedPinnedEntityTypeBaseUrls = pinnedEntityTypes
      .map(({ metadata }) => metadata.recordId.baseUrl)
      .filter((value, index, all) => all.indexOf(value) === index);

    await updateEntity({
      variables: {
        entityUpdate: {
          entityId: profile.entity.metadata.recordId.entityId,
          entityTypeId: profile.entity.metadata.entityTypeId,
          propertyPatches: [
            {
              op: "add",
              path: [
                systemPropertyTypes.pinnedEntityTypeBaseUrl.propertyTypeBaseUrl,
              ],
              property: mergePropertiesAndMetadata(
                updatedPinnedEntityTypeBaseUrls,
                undefined,
              ),
            },
          ],
        },
      },
    });

    /** @todo: error handling */

    void refetchProfile();
    // Display the updated pinned entity types in the sidebar
    if (
      activeWorkspace &&
      activeWorkspace.entity.metadata.recordId.entityId ===
        profile.entity.metadata.recordId.entityId
    ) {
      void refetchActiveWorkspace();
    }
    onClose();
  });

  const handleOnDragEnd = useCallback<OnDragEndResponder>(
    (result) => {
      if (!result.destination) {
        return;
      }

      const items = Array.from(fields);
      const [reorderedItem] = items.splice(result.source.index, 1);

      if (!reorderedItem) {
        return;
      }

      items.splice(result.destination.index, 0, reorderedItem);

      replace(items);
    },
    [fields, replace],
  );

  const handleCreateNewEntityType = useCallback(
    async (title: string) => {
      const { data: createdEntityType } = await createEntityType({
        data: {
          entityType: {
            title,
            type: "object",
            description: "",
            properties: {},
          },
        },
      });

      if (createdEntityType) {
        append(createdEntityType);
      } else {
        /** @todo: error handling */
      }
      setDisplayEntityTypesSearch(false);
    },
    [createEntityType, append],
  );

  const handleDiscard = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const renderDraggable = useDraggableInPortal();

  const isSubmitDisabled = Object.keys(formState.dirtyFields).length === 0;

  const isDragDisabled = fields.length <= 1;

  return (
    <Modal
      {...modalProps}
      sx={{
        "> div": {
          overflow: "hidden",
          padding: 0,
        },
      }}
      header={{
        title: "Pinned types",
        subtitle:
          "Choose up to 5 types to appear in the top-bar of your profile",
      }}
      onClose={onClose}
    >
      <Box>
        <Box
          id="test-pinned-entity-types"
          component="form"
          onSubmit={innerSubmit}
          padding={3}
          paddingTop={2.25}
        >
          <ProfileSectionHeading>Types</ProfileSectionHeading>
          <DragDropContext onDragEnd={handleOnDragEnd}>
            <Droppable droppableId="pinnedEntityTypes">
              {(providedDroppable) => (
                <Box
                  {...providedDroppable.droppableProps}
                  ref={providedDroppable.innerRef}
                  sx={{
                    marginBottom: 1,
                    display: "flex",
                    flexDirection: "column",
                    rowGap: 0.5,
                  }}
                >
                  {fields.map((field, index) => (
                    <Draggable
                      key={field.id}
                      draggableId={field.id.toString()}
                      isDragDisabled={isDragDisabled}
                      index={index}
                    >
                      {renderDraggable((provided) => (
                        <Box
                          ref={provided.innerRef}
                          display="flex"
                          alignItems="center"
                          {...provided.draggableProps}
                        >
                          <Box
                            {...provided.dragHandleProps}
                            sx={{ display: "flex", alignItems: "center" }}
                          >
                            <GripDotsVerticalRegularIcon
                              sx={{
                                color: ({ palette }) => palette.gray[50],
                                fontSize: 16,
                                opacity: isDragDisabled ? 0 : 1,
                                transition: ({ transitions }) =>
                                  transitions.create("opacity"),
                              }}
                            />
                          </Box>
                          <Link
                            noLinkStyle
                            target="_blank"
                            href={generateLinkParameters(field.schema.$id).href}
                            sx={{ flexGrow: 1, marginLeft: 1 }}
                          >
                            <Box
                              display="flex"
                              alignItems="center"
                              columnGap={1.5}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                svg: {
                                  color: ({ palette }) => palette.blue[70],
                                },
                                "&:hover": {
                                  [`.${typographyClasses.root}`]: {
                                    color: ({ palette }) => palette.blue[70],
                                  },
                                },
                              }}
                            >
                              <Box
                                sx={{
                                  width: 15,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {field.schema.icon ??
                                  (isSpecialEntityTypeLookup?.[field.schema.$id]
                                    ?.isLink ? (
                                    <CustomLinkIcon
                                      sx={{
                                        fontSize: 22,
                                        marginLeft: -0.75,
                                        marginRight: -0.75,
                                      }}
                                    />
                                  ) : (
                                    (entityTypeIcons[field.schema.$id] ?? (
                                      <AsteriskRegularIcon
                                        sx={{ fontSize: 12 }}
                                      />
                                    ))
                                  ))}
                              </Box>
                              <Typography
                                sx={{
                                  fontSize: 14,
                                  transition: ({ transitions }) =>
                                    transitions.create("color"),
                                  fontWeight: 500,
                                }}
                              >
                                {field.schema.title}
                              </Typography>
                              <ArrowUpRightRegularIcon sx={{ fontSize: 14 }} />
                            </Box>
                          </Link>
                          <IconButton onClick={() => remove(index)}>
                            <XMarkRegularIcon />
                          </IconButton>
                        </Box>
                      ))}
                    </Draggable>
                  ))}
                  {providedDroppable.placeholder}
                </Box>
              )}
            </Droppable>
            {displayEntityTypesSearch ? (
              <EntityTypeSelector
                excludeEntityTypeIds={[
                  ...fields.map(({ schema }) => schema.$id),
                  systemEntityTypes.page.entityTypeId,
                ]}
                disableCreateNewEmpty
                onSelect={(entityType) => {
                  append(entityType);
                  setDisplayEntityTypesSearch(false);
                }}
                onCancel={() => setDisplayEntityTypesSearch(false)}
                onCreateNew={handleCreateNewEntityType}
                sx={{
                  maxWidth: "unset",
                }}
              />
            ) : (
              <Button
                onClick={() => setDisplayEntityTypesSearch(true)}
                variant="tertiary"
                size="xs"
                startIcon={<PlusRegularIcon />}
                disabled={fields.length >= 5}
              >
                Add {fields.length === 0 ? "type" : "another"}
              </Button>
            )}
          </DragDropContext>
          <Box display="flex" columnGap={1.25} marginTop={3}>
            <Button type="submit" loading={loading} disabled={isSubmitDisabled}>
              Save changes
            </Button>
            <Button variant="tertiary" onClick={handleDiscard}>
              {Object.keys(formState.dirtyFields).length === 0
                ? "Cancel"
                : "Discard"}
            </Button>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};
