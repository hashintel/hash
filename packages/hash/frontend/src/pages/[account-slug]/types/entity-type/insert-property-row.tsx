import { PropertyType } from "@blockprotocol/type-system-web";
import {
  TableCell,
  tableCellClasses,
  TableRow,
  useForkRef,
} from "@mui/material";
import {
  bindToggle,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { Ref, useId, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { EntityTypeEditorForm } from "./form-types";
import { PropertyTypeSelector } from "./property-type-selector";
import { PropertyTypeForm } from "./property-type-form";
import { PropertyTypeModal } from "./property-type-modal";
import { QuestionIcon } from "./question-icon";
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
        <PropertyTypeSelector
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
          dropdownProps={{
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
          }}
        />
        <PropertyTypeModal
          popupState={modalPopupState}
          title={
            <>
              Create new property type
              <QuestionIcon
                sx={{
                  ml: 1.25,
                }}
              />
            </>
          }
        >
          <PropertyTypeForm
            discardButtonProps={bindToggle(modalPopupState)}
            initialTitle={searchText}
            onCreatePropertyType={onAdd}
          />
        </PropertyTypeModal>
      </TableCell>
    </TableRow>
  );
};
