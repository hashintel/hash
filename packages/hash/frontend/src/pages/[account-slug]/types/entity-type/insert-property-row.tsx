import { PropertyType } from "@blockprotocol/type-system-web";
import { faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import {
  Box,
  TableCell,
  tableCellClasses,
  TableRow,
  Typography,
  useForkRef,
} from "@mui/material";
import {
  bindPopover,
  bindToggle,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { Ref, useId, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Modal } from "../../../../components/Modals/Modal";
import { EntityTypeEditorForm } from "./form-types";
import { PropertySelector } from "./property-selector";
import { PropertyTypeForm } from "./property-type-form";
import { QuestionIcon } from "./question-icon";
import { TypeListSelectorDropdownContext } from "./type-list-selector-dropdown";
import { withHandler } from "./util";

export const InsertPropertyRow = ({
  inputRef,
  onCancel,
  onAdd,
}: {
  inputRef: Ref<HTMLInputElement | null>;
  onCancel: () => void;
  onAdd: (option: PropertyType) => void;
}) => {
  const modalTooltipId = useId();
  const modalPopupState = usePopupState({
    variant: "popover",
    popupId: `createProperty-${modalTooltipId}`,
  });

  const [searchText, setSearchText] = useState("");

  const ourInputRef = useRef<HTMLInputElement>(null);
  const sharedRef = useForkRef(inputRef, ourInputRef);

  const { control } = useFormContext<EntityTypeEditorForm>();
  const properties = useWatch({ control, name: "properties" });

  return (
    <TableRow
      sx={{
        [`.${tableCellClasses.root}`]: {
          py: 1,
        },
      }}
    >
      <TableCell colSpan={2}>
        <TypeListSelectorDropdownContext.Provider
          value={
            // eslint-disable-next-line react/jsx-no-constructed-context-values
            {
              query: searchText,
              createButtonProps: {
                ...withHandler(bindTrigger(modalPopupState), () => {
                  ourInputRef.current?.focus();
                }),
                onMouseDown: (evt) => {
                  evt.preventDefault();
                  evt.stopPropagation();
                },
              },
              variant: "propertyType",
            }
          }
        >
          <PropertySelector
            searchText={searchText}
            onSearchTextChange={setSearchText}
            ref={sharedRef}
            modalPopupState={modalPopupState}
            onAdd={onAdd}
            onCancel={onCancel}
            filterProperty={(property) =>
              !properties.some(
                (includedProperty) => includedProperty.$id === property.$id,
              )
            }
          />
        </TypeListSelectorDropdownContext.Provider>
        <Modal
          {...bindPopover(modalPopupState)}
          disableEscapeKeyDown
          contentStyle={(theme) => ({
            p: "0px !important",
            border: 1,
            borderColor: theme.palette.gray[20],
          })}
        >
          <>
            <Box
              sx={(theme) => ({
                px: 2.5,
                pr: 1.5,
                pb: 1.5,
                pt: 2,
                borderBottom: 1,
                borderColor: theme.palette.gray[20],
                alignItems: "center",
                display: "flex",
              })}
            >
              <Typography variant="regularTextLabels" sx={{ fontWeight: 500 }}>
                Create new property type
              </Typography>
              <QuestionIcon
                sx={{
                  ml: 1.25,
                }}
              />
              <IconButton
                {...bindToggle(modalPopupState)}
                sx={(theme) => ({
                  ml: "auto",
                  svg: {
                    color: theme.palette.gray[50],
                    fontSize: 20,
                  },
                })}
              >
                <FontAwesomeIcon icon={faClose} />
              </IconButton>
            </Box>
            <PropertyTypeForm
              discardButtonProps={bindToggle(modalPopupState)}
              initialTitle={searchText}
              onCreatePropertyType={onAdd}
            />
          </>
        </Modal>
      </TableCell>
    </TableRow>
  );
};
