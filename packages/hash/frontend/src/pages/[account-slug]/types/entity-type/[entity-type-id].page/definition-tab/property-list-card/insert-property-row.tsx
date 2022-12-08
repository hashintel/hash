import { PropertyType } from "@blockprotocol/type-system";
import {
  TableCell,
  tableCellClasses,
  TableRow,
  useForkRef,
} from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { Ref, useId, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useBlockProtocolCreatePropertyType } from "../../../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreatePropertyType";
import { EntityTypeEditorForm } from "../../shared/form-types";
import { useRefetchPropertyTypes } from "../../shared/property-types-context";
import { PropertyTypeSelector } from "./insert-property-row/property-type-selector";
import {
  formDataToPropertyType,
  PropertyTypeForm,
} from "./shared/property-type-form";
import { PropertyTypeFormValues } from "./shared/property-type-form-values";
import { QuestionIcon } from "./shared/question-icon";
import { useRouteNamespace } from "../../../../../shared/use-route-namespace";
import { withHandler } from "./shared/with-handler";

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

  const { routeNamespace } = useRouteNamespace();

  const refetchPropertyTypes = useRefetchPropertyTypes();

  const { createPropertyType } = useBlockProtocolCreatePropertyType(
    routeNamespace?.accountId ?? "",
  );

  const handleSubmit = async (data: PropertyTypeFormValues) => {
    const res = await createPropertyType({
      data: {
        propertyType: formDataToPropertyType(data),
      },
    });

    if (res.errors?.length || !res.data) {
      // @todo handle this
      throw new Error("Could not create");
    }

    await refetchPropertyTypes?.();

    onAdd(res.data.schema);
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
        <PropertyTypeForm
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
