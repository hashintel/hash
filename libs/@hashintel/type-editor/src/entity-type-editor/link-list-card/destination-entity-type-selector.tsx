import { VersionedUrl } from "@blockprotocol/type-system";
import {
  EntityTypeIcon,
  popperPlacementInputNoRadius,
  popperPlacementPopperNoRadius,
  popperPlacementSelectors,
  SelectorAutocomplete,
  setPopperPlacementAttribute,
  TYPE_SELECTOR_HEIGHT,
} from "@hashintel/design-system";
import { Box, PopperPlacementType } from "@mui/material";
import { MouseEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useFormContext, useWatch } from "react-hook-form";
import { useResizeObserverRef } from "rooks";

import { useEntityTypesOptions } from "../../shared/entity-types-options-context";
import { EntityTypeEditorFormData } from "../../shared/form-types";
import { useIsReadonly } from "../../shared/read-only-context";
import { useFilterTypeOptions } from "../shared/use-filter-type-options";
import { AnythingChip } from "./anything-chip";
import { DestinationEntityType } from "./destination-entity-type";
import { DestinationTypeContainer } from "./destination-type-container";

const linkEntityTypeSelectorDropdownProps = {
  query: "",
  /**
   * @todo Add a create entity type button
   */
  createButtonProps: null,
  variant: "entity type" as const,
};

export const DestinationEntityTypeSelector = ({
  linkIndex,
}: {
  linkIndex: number;
}) => {
  const { control, setValue } = useFormContext<EntityTypeEditorFormData>();

  const isReadonly = useIsReadonly();

  const [entityTypeSelectorPopupOpen, setEntityTypeSelectorPopupOpen] =
    useState(false);

  const entityTypeSelectorRef = useRef<HTMLDivElement>(null);

  const [tagBorderHeight, setTagBorderHeight] = useState(0);
  const [resizeObserverRef] = useResizeObserverRef(([size]) => {
    if (size) {
      // Using flush sync so that the UI updates immediately, rather than the
      // popup position lagging behind the height of its anchor element
      flushSync(() => {
        setTagBorderHeight(size.contentRect.height);
      });
    }
  });

  const { entityTypes } = useEntityTypesOptions();

  const chosenEntityTypeIds = useWatch({
    control,
    name: `links.${linkIndex}.entityTypes`,
  });

  const entityTypesArray = Object.values(entityTypes).map(
    (type) => type.schema,
  );
  const chosenEntityTypeSchemas = entityTypesArray.filter((type) =>
    chosenEntityTypeIds.includes(type.$id),
  );

  const entityTypeOptions = useFilterTypeOptions({
    typeOptions: entityTypesArray,
    /**
     * we pass the selected values to MUI, and can let it identify which are already selected
     * – it matches values to options by the provided 'isOptionEqualToValue' function
     */
    typesToExclude: [],
  });

  /**
   * We change the position of the input which the entity type list popup
   * appears to be attached to based on whether the popup appears above or below
   * the list of tags. However, popper needs to know whether there's space to
   * place the popup above or below, so moving the box the popup is attached to
   * is not an option (it would create an infinite loop). Instead, what we do
   * is (invisibly) make the box the popup is attached to tall enough to contain
   * the input, whether it's positioned above or below the tags, and reposition
   * the input within that box based on where the popup appears. This value
   * represents the extra space needed either above or below the tags.
   */
  const selectorOffset = TYPE_SELECTOR_HEIGHT + tagBorderHeight;

  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        ...(entityTypeSelectorPopupOpen
          ? { zIndex: theme.zIndex.modal + 1 }
          : { "&, *": { cursor: isReadonly ? "default" : "pointer" } }),

        [entityTypeSelectorPopupOpen ? "& > *" : "&:hover > *"]: isReadonly
          ? {}
          : {
              boxShadow: theme.boxShadows.xs,
              borderColor: `${theme.palette.gray[30]} !important`,
              backgroundColor: "white",
            },
      })}
      ref={entityTypeSelectorRef}
    >
      <DestinationTypeContainer
        onClick={(event: MouseEvent) => {
          event.preventDefault();
          if (isReadonly) {
            return;
          }
          setEntityTypeSelectorPopupOpen(true);
        }}
        {...(entityTypeSelectorPopupOpen
          ? {
              onMouseDown: (event: MouseEvent) => {
                // This prevents the input field blurring when you click on
                // tags. Because the field blurring hides the popup, and
                // therefore the delete icons, without this line you wouldn't
                // be able to hit the delete icons on tags
                event.preventDefault();
              },
            }
          : {})}
      >
        {chosenEntityTypeIds.length ? (
          chosenEntityTypeIds.map((entityTypeId) => {
            const entityType = entityTypes[entityTypeId];

            if (!entityType) {
              throw new Error(
                `Destination entity type ${entityTypeId} not found in options`,
              );
            }

            return (
              <DestinationEntityType
                key={entityTypeId}
                entityTypeSchema={entityType.schema}
                updateVersion={(newVersion: VersionedUrl) =>
                  setValue(
                    `links.${linkIndex}.entityTypes`,
                    chosenEntityTypeIds.map((id) =>
                      id === entityTypeId ? newVersion : id,
                    ),
                    { shouldDirty: true },
                  )
                }
                {...(entityTypeSelectorPopupOpen
                  ? {
                      onDelete: () => {
                        setValue(
                          `links.${linkIndex}.entityTypes`,
                          chosenEntityTypeIds.filter(
                            (id) => id !== entityTypeId,
                          ),
                          { shouldDirty: true },
                        );
                      },
                    }
                  : {})}
              />
            );
          })
        ) : (
          <AnythingChip />
        )}
      </DestinationTypeContainer>
      {entityTypeSelectorPopupOpen ? (
        <Box
          ref={resizeObserverRef}
          onClick={(evt) => {
            evt.stopPropagation();
            evt.preventDefault();
          }}
          sx={[
            (theme) => ({
              position: "absolute",
              left: -19,
              right: -19,
              top: -12,
              bottom: -12,
              background: "white",
              borderRadius: 1.5,
              border: 1,
              borderColor: theme.palette.gray[30],
              boxShadow: theme.boxShadows.md,
            }),
            popperPlacementInputNoRadius,
          ]}
        >
          <SelectorAutocomplete
            disableCloseOnSelect
            multiple
            sx={[
              popperPlacementPopperNoRadius,
              {
                minWidth: 440,
                position: "absolute",
                left: -1,
                width: "calc(100% + 2px)",

                // This ensures there is enough space for the input, above or
                // below
                height: TYPE_SELECTOR_HEIGHT + selectorOffset,
                top: `calc(100% - ${selectorOffset}px)`,
                paddingTop: `${selectorOffset}px`,
                [`${popperPlacementSelectors.top} &`]: {
                  paddingTop: 0,
                },

                // We need this box not to mask clicks
                pointerEvents: "none",
                "> *": {
                  pointerEvents: "all",
                },
              },
            ]}
            // Whenever the input is rendered, the popup is also rendered
            open
            onChange={(_, __, reason, details) => {
              /**
               * MUI has weird behaviour with sorting its value internally, which
               * if we used that to set our value the tags would jump around.
               * To avoid that problem, we handle adding/removing values from
               * our own value manually
               */
              if (details) {
                switch (reason) {
                  case "selectOption":
                    setValue(
                      `links.${linkIndex}.entityTypes`,
                      [...chosenEntityTypeIds, details.option.$id],
                      { shouldDirty: true },
                    );
                    break;

                  case "removeOption":
                    setValue(
                      `links.${linkIndex}.entityTypes`,
                      chosenEntityTypeIds.filter(
                        (id) => id !== details.option.$id,
                      ),
                      { shouldDirty: true },
                    );
                    break;
                }
              }

              return false;
            }}
            isOptionEqualToValue={(option, value) => option.$id === value.$id}
            options={entityTypeOptions}
            optionToRenderData={({ $id, title, description }) => ({
              uniqueId: $id,
              icon: <EntityTypeIcon />,
              typeId: $id,
              title,
              description,
            })}
            dropdownProps={linkEntityTypeSelectorDropdownProps}
            joined
            // We render our tags manually, so we don't want MUI doing it for us
            renderTags={() => <Box />}
            value={chosenEntityTypeSchemas}
            modifiers={[
              /**
               * We need to respond to whether the popup is above or below using
               * CSS at a higher level than our addPositionSelector modifier sets
               * the data attribute usually. But the modifier will notify us, so
               * we can set it on a node we can choose.
               */
              {
                name: "addPositionSelector",
                phase: "write",
                options: {
                  update(placement: PopperPlacementType) {
                    const node = entityTypeSelectorRef.current;
                    if (node) {
                      setPopperPlacementAttribute(node, placement);
                    }
                  },
                },
              },
            ]}
            onKeyDown={(evt) => {
              if (evt.key === "Escape") {
                setEntityTypeSelectorPopupOpen(false);
              }
            }}
            onClickAway={() => {
              setEntityTypeSelectorPopupOpen(false);
            }}
          />
        </Box>
      ) : null}
    </Box>
  );
};
