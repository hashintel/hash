import {
  extractBaseUri,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system";
import { faList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@local/design-system";
import { OwnedById } from "@local/hash-isomorphic-utils/types";
import {
  Checkbox,
  Fade,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
} from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";

import { useBlockProtocolCreatePropertyType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-property-type";
import { useBlockProtocolUpdatePropertyType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-property-type";
import { StyledPlusCircleIcon } from "../../../../shared/styled-plus-circle-icon";
import { useRouteNamespace } from "../../../../shared/use-route-namespace";
import { EntityTypeEditorForm } from "../shared/form-types";
import {
  usePropertyTypes,
  useRefetchPropertyTypes,
} from "../shared/property-types-context";
import { getPropertyTypeSchema } from "./property-list-card/get-property-type-schema";
import { PropertyExpectedValues } from "./property-list-card/property-expected-values";
import { PropertyTypeForm } from "./property-list-card/property-type-form";
import { propertyTypeToFormDataExpectedValues } from "./property-list-card/property-type-to-form-data-expected-values";
import { PropertyTypeFormValues } from "./property-list-card/shared/property-type-form-values";
import { EmptyListCard } from "./shared/empty-list-card";
import {
  EntityTypeTable,
  EntityTypeTableButtonRow,
  EntityTypeTableCenteredCell,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
} from "./shared/entity-type-table";
import { InsertTypeRow, InsertTypeRowProps } from "./shared/insert-type-row";
import { MultipleValuesCell } from "./shared/multiple-values-cell";
import { QuestionIcon } from "./shared/question-icon";
import { TypeFormModal } from "./shared/type-form";
import { TYPE_MENU_CELL_WIDTH, TypeMenuCell } from "./shared/type-menu-cell";
import { useStateCallback } from "./shared/use-state-callback";

export const PropertyTypeRow = ({
  propertyIndex,
  onRemove,
  onUpdateVersion,
}: {
  propertyIndex: number;
  onRemove: () => void;
  onUpdateVersion: (nextId: VersionedUri) => void;
}) => {
  const { control } = useFormContext<EntityTypeEditorForm>();

  const [$id, array] = useWatch({
    control,
    name: [
      `properties.${propertyIndex}.$id`,
      `properties.${propertyIndex}.array`,
    ],
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
  const onUpdateVersionRef = useRef(onUpdateVersion);
  useLayoutEffect(() => {
    onUpdateVersionRef.current = onUpdateVersion;
  });

  const propertyTypes = usePropertyTypes();
  const property = propertyTypes?.[$id];

  const getDefaultValues = useCallback(() => {
    if (!property) {
      throw new Error("Missing property type");
    }

    const [expectedValues, flattenedCustomExpectedValueList] =
      propertyTypeToFormDataExpectedValues(property);

    return {
      name: property.title,
      description: property.description,
      expectedValues,
      flattenedCustomExpectedValueList,
    };
  }, [property]);

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
            <Fade in={array} appear={false}>
              <FontAwesomeIcon
                sx={{
                  color: ({ palette }) => palette.gray[70],
                  fontSize: 14,
                  ml: 1,
                }}
                icon={faList}
              />
            </Fade>
          </EntityTypeTableTitleCellText>
        </TableCell>
        <TableCell>
          <PropertyExpectedValues property={property} />
        </TableCell>

        <MultipleValuesCell index={propertyIndex} variant="property" />

        <EntityTypeTableCenteredCell>
          <Controller
            render={({ field: { value, ...field } }) => (
              <Checkbox {...field} checked={value} />
            )}
            control={control}
            name={`properties.${propertyIndex}.required`}
          />
        </EntityTypeTableCenteredCell>

        <TypeMenuCell
          editButtonProps={bindTrigger(editModalPopupState)}
          onRemove={onRemove}
          typeId={property.$id}
          popupState={menuPopupState}
          variant="property"
        />
      </EntityTypeTableRow>
      <TypeFormModal
        as={PropertyTypeForm}
        baseUri={extractBaseUri($id)}
        popupState={editModalPopupState}
        modalTitle={<>Edit Property Type</>}
        onSubmit={async (data) => {
          const res = await updatePropertyType({
            data: {
              propertyTypeId: $id,
              propertyType: getPropertyTypeSchema(data),
            },
          });

          if (!res.data) {
            throw new Error("Failed to update property type");
          }

          await refetchPropertyTypes?.();

          onUpdateVersionRef.current(res.data.schema.$id);

          editModalPopupState.close();
        }}
        submitButtonProps={{ children: <>Edit property type</> }}
        disabledFields={["name"]}
        getDefaultValues={getDefaultValues}
      />
    </>
  );
};

const InsertPropertyRow = (
  props: Omit<InsertTypeRowProps<PropertyType>, "options" | "variant">,
) => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const properties = useWatch({ control, name: "properties" });

  const propertyTypesObj = usePropertyTypes();
  const propertyTypes = Object.values(propertyTypesObj ?? {});

  const filteredPropertyTypes = useMemo(() => {
    const propertyBaseUris = properties.map((includedProperty) =>
      extractBaseUri(includedProperty.$id),
    );

    return propertyTypes.filter(
      (type) => !propertyBaseUris.includes(extractBaseUri(type.$id)),
    );
  }, [properties, propertyTypes]);

  return (
    <InsertTypeRow
      {...props}
      options={filteredPropertyTypes}
      variant="property"
    />
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
  const [searchText, setSearchText] = useState("");
  const addingNewPropertyRef = useRef<HTMLInputElement>(null);

  const cancelAddingNewProperty = () => {
    setAddingNewProperty(false);
    setSearchText("");
  };

  const { routeNamespace } = useRouteNamespace();
  const { createPropertyType } = useBlockProtocolCreatePropertyType(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    (routeNamespace?.accountId as OwnedById) ?? null,
  );

  const refetchPropertyTypes = useRefetchPropertyTypes();
  const modalTooltipId = useId();
  const createModalPopupState = usePopupState({
    variant: "popover",
    popupId: `createProperty-${modalTooltipId}`,
  });

  const handleAddPropertyType = (propertyType: PropertyType) => {
    cancelAddingNewProperty();
    if (!getValues("properties").some(({ $id }) => $id === propertyType.$id)) {
      append({
        $id: propertyType.$id,
        required: false,
        array: false,
        minValue: 0,
        maxValue: 1,
        infinity: true,
      });
    }
  };

  const handleSubmit = async (data: PropertyTypeFormValues) => {
    const res = await createPropertyType({
      data: {
        propertyType: getPropertyTypeSchema(data),
      },
    });

    if (res.errors?.length || !res.data) {
      // @todo handle this
      throw new Error("Could not create");
    }

    await refetchPropertyTypes?.();

    handleAddPropertyType(res.data.schema);
  };

  if (!addingNewProperty && fields.length === 0) {
    return (
      <EmptyListCard
        onClick={() => {
          setAddingNewProperty(true, () => {
            addingNewPropertyRef.current?.focus();
          });
        }}
        icon={<FontAwesomeIcon icon={faList} />}
        headline={<>Add a property</>}
        description={
          <>
            Properties store individual pieces of information about some aspect
            of an entity
          </>
        }
        subDescription={
          <>
            e.g. a <strong>person</strong> entity might have a{" "}
            <strong>date of birth</strong> property which expects a{" "}
            <strong>date</strong>
          </>
        }
      />
    );
  }

  return (
    <EntityTypeTable>
      <TableHead>
        <EntityTypeTableHeaderRow>
          <TableCell width={260}>Property name</TableCell>
          <TableCell>Expected values</TableCell>
          <EntityTypeTableCenteredCell width={170}>
            Allow arrays{" "}
            <QuestionIcon
              tooltip={
                <>
                  Allowing arrays permits the entry of more than one value for a
                  given property
                </>
              }
            />
          </EntityTypeTableCenteredCell>
          <EntityTypeTableCenteredCell width={100}>
            Required
          </EntityTypeTableCenteredCell>
          <TableCell width={TYPE_MENU_CELL_WIDTH} />
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
            onUpdateVersion={(nextId) => {
              setValue(`properties.${index}.$id`, nextId, {
                shouldDirty: true,
              });
            }}
          />
        ))}
      </TableBody>
      <TableFooter>
        {addingNewProperty ? (
          <>
            <InsertPropertyRow
              inputRef={addingNewPropertyRef}
              onCancel={cancelAddingNewProperty}
              onAdd={handleAddPropertyType}
              createModalPopupState={createModalPopupState}
              searchText={searchText}
              onSearchTextChange={setSearchText}
            />
            <TypeFormModal
              as={PropertyTypeForm}
              modalTitle={
                <>
                  Create new property type
                  <QuestionIcon
                    sx={{
                      display: "flex",
                      ml: 1.25,
                    }}
                    tooltip={
                      <>
                        You should only create a new property type if you can't
                        find an existing one which corresponds to the
                        information you're trying to capture.
                      </>
                    }
                  />
                </>
              }
              popupState={createModalPopupState}
              onSubmit={handleSubmit}
              submitButtonProps={{ children: <>Create new property type</> }}
              getDefaultValues={() => ({
                expectedValues: [],
                ...(searchText.length ? { name: searchText } : {}),
              })}
            />
          </>
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
