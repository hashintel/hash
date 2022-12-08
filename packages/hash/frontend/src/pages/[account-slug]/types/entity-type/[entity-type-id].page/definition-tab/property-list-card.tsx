import { VersionedUri } from "@blockprotocol/type-system";
import {
  Checkbox,
  iconButtonClasses,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  tableRowClasses,
} from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { useId, useLayoutEffect, useRef } from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { useBlockProtocolUpdatePropertyType } from "../../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolUpdatePropertyType";
import {
  EntityTypeTable,
  EntityTypeTableButtonRow,
  EntityTypeTableCenteredCell,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
} from "./property-list-card/entity-type-table";
import {
  usePropertyTypes,
  useRefetchPropertyTypes,
} from "../shared/property-types-context";
import { EmptyPropertyListCard } from "./property-list-card/empty-property-list-card";
import { EntityTypeEditorForm } from "../shared/form-types";
import { InsertPropertyRow } from "./property-list-card/insert-property-row";
import { MultipleValuesCell } from "./property-list-card/multiple-values-cell";
import { PropertyExpectedValues } from "./property-list-card/property-expected-values";
import { PropertyMenu } from "./property-list-card/property-menu";
import {
  formDataToPropertyType,
  PropertyTypeForm,
} from "./property-list-card/shared/property-type-form";
import { QuestionIcon } from "./property-list-card/shared/question-icon";
import { StyledPlusCircleIcon } from "../../../../shared/styled-plus-circle-icon";
import { useStateCallback } from "./property-list-card/use-state-callback";

export const PropertyTypeRow = ({
  propertyIndex,
  onRemove,
  onUpdatePropertyTypeVersion,
}: {
  propertyIndex: number;
  onRemove: () => void;
  onUpdatePropertyTypeVersion: (nextId: VersionedUri) => void;
}) => {
  const { control } = useFormContext<EntityTypeEditorForm>();

  const [$id] = useWatch({
    control,
    name: [`properties.${propertyIndex}.$id`],
  });

  const popupId = useId();
  const menuPopupState = usePopupState({
    variant: "popover",
    popupId: `property-menu-${popupId}`,
  });

  const editModalId = useId();
  const editModalPopupState = usePopupState({
    variant: "popover",
    popupId: `edit-property-type-modal-${editModalId}`,
  });

  const { updatePropertyType } = useBlockProtocolUpdatePropertyType();
  const refetchPropertyTypes = useRefetchPropertyTypes();

  const propertyTypes = usePropertyTypes();
  const property = propertyTypes?.[$id];

  const onUpdatePropertyTypeVersionRef = useRef(onUpdatePropertyTypeVersion);
  useLayoutEffect(() => {
    onUpdatePropertyTypeVersionRef.current = onUpdatePropertyTypeVersion;
  });

  if (!property) {
    if (propertyTypes) {
      throw new Error("Missing property type");
    }

    return null;
  }

  return (
    <>
      <EntityTypeTableRow>
        <TableCell>
          <EntityTypeTableTitleCellText>
            {property.title}
          </EntityTypeTableTitleCellText>
        </TableCell>
        <TableCell>
          <PropertyExpectedValues property={property} />
        </TableCell>

        <MultipleValuesCell propertyIndex={propertyIndex} />

        <EntityTypeTableCenteredCell>
          <Controller
            render={({ field: { value, ...field } }) => (
              <Checkbox {...field} checked={value} />
            )}
            control={control}
            name={`properties.${propertyIndex}.required`}
          />
        </EntityTypeTableCenteredCell>

        <TableCell
          sx={{
            [`.${iconButtonClasses.root}`]: {
              opacity: 0,
              [`.${tableRowClasses.root}:hover &`]: {
                opacity: 1,
              },
            },
          }}
        >
          <PropertyMenu
            editButtonProps={bindTrigger(editModalPopupState)}
            onRemove={onRemove}
            property={property}
            popupState={menuPopupState}
          />
        </TableCell>
      </EntityTypeTableRow>
      <PropertyTypeForm
        popupState={editModalPopupState}
        modalTitle={<>Edit Property Type</>}
        onSubmit={async (data) => {
          // @todo verify this works
          const res = await updatePropertyType({
            data: {
              propertyTypeId: $id,
              propertyType: formDataToPropertyType(data),
            },
          });

          if (!res.data) {
            throw new Error("Failed to update property type");
          }

          await refetchPropertyTypes?.();

          onUpdatePropertyTypeVersionRef.current(
            // @todo temporary bug fix
            res.data.schema.$id.replace("//v", "/v") as VersionedUri,
          );

          editModalPopupState.close();
        }}
        submitButtonProps={{ children: <>Edit property type</> }}
        fieldProps={{ name: { disabled: true } }}
        getDefaultValues={() => ({
          name: property.title,
          description: property.description,
          // @todo handle exotic values
          expectedValues: property.oneOf.map((dataType) => {
            if (!("$ref" in dataType)) {
              throw new Error("Handle exotic data types");
            }
            return dataType.$ref;
          }),
        })}
      />
    </>
  );
};

export const PropertyListCard = () => {
  const { control, getValues, setValue } =
    useFormContext<EntityTypeEditorForm>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "properties",
  });

  const [addingNewProperty, setAddingNewProperty] = useStateCallback(false);
  const addingNewPropertyRef = useRef<HTMLInputElement>(null);

  if (!addingNewProperty && fields.length === 0) {
    return (
      <EmptyPropertyListCard
        onClick={() => {
          setAddingNewProperty(true, () => {
            addingNewPropertyRef.current?.focus();
          });
        }}
      />
    );
  }

  return (
    <EntityTypeTable>
      <TableHead>
        <EntityTypeTableHeaderRow>
          <TableCell>Property name</TableCell>
          <TableCell width={180}>Expected values</TableCell>
          <EntityTypeTableCenteredCell width={170}>
            Allow multiple values <QuestionIcon />
          </EntityTypeTableCenteredCell>
          <EntityTypeTableCenteredCell width={100}>
            Required
          </EntityTypeTableCenteredCell>
          <TableCell width={70} />
        </EntityTypeTableHeaderRow>
      </TableHead>
      <TableBody>
        {fields.map((type, index) => (
          <PropertyTypeRow
            key={type.id}
            propertyIndex={index}
            onRemove={() => {
              remove(index);
            }}
            onUpdatePropertyTypeVersion={(nextId) => {
              setValue(`properties.${index}.$id`, nextId, {
                shouldDirty: true,
              });
            }}
          />
        ))}
      </TableBody>
      <TableFooter>
        {addingNewProperty ? (
          <InsertPropertyRow
            inputRef={addingNewPropertyRef}
            onCancel={() => {
              setAddingNewProperty(false);
            }}
            onAdd={(propertyType) => {
              setAddingNewProperty(false);
              if (
                !getValues("properties").some(
                  ({ $id }) => $id === propertyType.$id,
                )
              ) {
                append({
                  $id: propertyType.$id,
                  required: false,
                  array: false,
                  minValue: 0,
                  maxValue: 1,
                  infinity: true,
                });
              }
            }}
          />
        ) : (
          <EntityTypeTableButtonRow
            icon={<StyledPlusCircleIcon />}
            onClick={() => {
              setAddingNewProperty(true, () => {
                addingNewPropertyRef.current?.focus();
              });
            }}
          >
            Add a property
          </EntityTypeTableButtonRow>
        )}
      </TableFooter>
    </EntityTypeTable>
  );
};
