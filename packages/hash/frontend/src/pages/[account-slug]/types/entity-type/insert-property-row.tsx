import { PropertyType } from "@blockprotocol/type-system-web";
import {
  TableCell,
  tableCellClasses,
  TableRow,
  useForkRef,
} from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { Ref, useId, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useBlockProtocolCreatePropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreatePropertyType";
import { EntityTypeEditorForm } from "./form-types";
import { PropertyListSelectorDropdownContext } from "./property-list-selector-dropdown";
import { PropertySelector } from "./property-selector";
import {
  PropertyTypeModalFormValues,
  PropertyTypeModalForm,
} from "./property-type-modal-form";
import { QuestionIcon } from "./question-icon";
import { useRefetchPropertyTypes } from "./use-property-types";
import { useRouteNamespace } from "./use-route-namespace";
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

  const routeNamespace = useRouteNamespace();

  const refetchPropertyTypes = useRefetchPropertyTypes();

  const { createPropertyType } = useBlockProtocolCreatePropertyType(
    routeNamespace?.id ?? "",
  );

  const handleSubmit = async (data: PropertyTypeModalFormValues) => {
    const res = await createPropertyType({
      data: {
        propertyType: {
          oneOf: data.expectedValues.map((value) => ({
            $ref: value,
          })),
          description: data.description,
          title: data.name,
          kind: "propertyType",
          pluralTitle: data.name,
        },
      },
    });

    if (res.errors?.length || !res.data) {
      // @todo handle this
      throw new Error("Could not create");
    }

    await refetchPropertyTypes?.();

    onAdd(res.data.propertyType);
  };

  return (
    <TableRow
      sx={{
        [`.${tableCellClasses.root}`]: {
          py: 1,
        },
      }}
    >
      <TableCell colSpan={2}>
        <PropertyListSelectorDropdownContext.Provider
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
        </PropertyListSelectorDropdownContext.Provider>
        <PropertyTypeModalForm
          modalTitle={
            <>
              Create new property type
              <QuestionIcon
                sx={{
                  ml: 1.25,
                }}
              />
            </>
          }
          popupState={modalPopupState}
          onSubmit={handleSubmit}
          submitButtonProps={{ children: <>Create new property type</> }}
          getDefaultValues={() =>
            searchText.length ? { name: searchText } : {}
          }
        />
      </TableCell>
    </TableRow>
  );
};
