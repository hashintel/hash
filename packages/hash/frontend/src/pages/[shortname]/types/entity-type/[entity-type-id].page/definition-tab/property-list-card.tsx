import { PropertyType, VersionedUri } from "@blockprotocol/type-system";
import { faList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { OwnedById } from "@hashintel/hash-shared/types";
import {
  Box,
  Checkbox,
  checkboxClasses,
  Collapse,
  svgIconClasses,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
} from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import {
  forwardRef,
  ReactNode,
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
import { PropertyTitle } from "./property-list-card/property-title";
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
} from "./shared/entity-type-table";
import { InsertTypeRow, InsertTypeRowProps } from "./shared/insert-type-row";
import { MultipleValuesCell } from "./shared/multiple-values-cell";
import { QuestionIcon } from "./shared/question-icon";
import { TypeFormModal } from "./shared/type-form";
import { TYPE_MENU_CELL_WIDTH, TypeMenuCell } from "./shared/type-menu-cell";
import { useStateCallback } from "./shared/use-state-callback";

const CollapsibleTableRow = forwardRef(
  (
    {
      expanded,
      depth,
      lineHeight,
      children,
    }: {
      expanded: boolean;
      depth: number;
      lineHeight: number;
      children: ReactNode;
    },
    ref,
  ) => {
    return (
      <TableRow>
        <TableCell
          colSpan={12}
          sx={{ p: "0 !important", position: "relative" }}
        >
          <Table>
            <Collapse in={expanded} sx={{ position: "relative", top: -12 }}>
              <Box
                ref={ref}
                sx={{
                  position: "absolute",
                  height: lineHeight,
                  width: "1px",
                  left: `${13.4 + 20 * depth}px`,
                  background: ({ palette }) => palette.gray[30],
                  zIndex: 1,
                }}
              />
              <Box mt={1.5}>{children}</Box>
            </Collapse>
          </Table>
        </TableCell>
      </TableRow>
    );
  },
);

const PropertyRow = forwardRef(
  (
    {
      property,
      isArray,
      isRequired,
      expectedValuesColumnWidth,
      depth = 0,
      allowArraysTableCell,
      requiredTableCell,
      menuTableCell,
    }: {
      property: PropertyType;
      expectedValuesColumnWidth: number;
      isArray: boolean;
      isRequired?: boolean;
      depth?: number;
      allowArraysTableCell?: ReactNode;
      requiredTableCell?: ReactNode;
      menuTableCell?: ReactNode;
    },
    forwardedRef,
  ) => {
    const propertyTypes = usePropertyTypes();

    const [expanded, setExpanded] = useState(true);

    const lineRef = useRef<HTMLDivElement | null>();
    const lastItemRef = useRef<HTMLDivElement | null>();
    const [lineHeight, setLineHeight] = useState(0);

    const [selectedExpectedValueIndex, setSelectedExpectedValueIndex] =
      useState<number>(-1);

    const children = useMemo(() => {
      const selectedProperty = property.oneOf[selectedExpectedValueIndex]
        ? property.oneOf[selectedExpectedValueIndex]
        : null;

      const selectedObjectProperties =
        selectedProperty && "properties" in selectedProperty
          ? selectedProperty.properties
          : undefined;

      return selectedObjectProperties
        ? Object.entries(selectedObjectProperties).reduce(
            (
              childrenArray: ({
                array: boolean;
                required: boolean;
              } & PropertyType)[],
              [propertyId, ref],
            ) => {
              const $ref = "items" in ref ? ref.items.$ref : ref.$ref;
              const propertyType = propertyTypes?.[$ref];

              if (propertyType) {
                const array = "type" in ref;
                const required = Boolean(
                  selectedProperty &&
                    "required" in selectedProperty &&
                    selectedProperty.required?.includes(propertyId),
                );
                return [...childrenArray, { ...propertyType, array, required }];
              }

              return childrenArray;
            },
            [],
          )
        : [];
    }, [selectedExpectedValueIndex, property.oneOf, propertyTypes]);

    return (
      <>
        <EntityTypeTableRow ref={forwardedRef}>
          <TableCell width={260} sx={{ position: "relative" }}>
            <PropertyTitle
              property={property}
              array={isArray}
              expanded={expanded}
              setExpanded={setExpanded}
              depth={depth}
            />
          </TableCell>
          <TableCell width={expectedValuesColumnWidth}>
            <PropertyExpectedValues
              property={property}
              selectedExpectedValueIndex={selectedExpectedValueIndex}
              setSelectedExpectedValueIndex={setSelectedExpectedValueIndex}
            />
          </TableCell>

          {allowArraysTableCell ?? (
            <EntityTypeTableCenteredCell width={170}>
              <Checkbox
                disabled
                checked={isArray}
                sx={{
                  pr: 1,
                  [`.${svgIconClasses.root}`]: {
                    color: "inherit",
                  },
                  [`&.${checkboxClasses.checked}.${checkboxClasses.disabled}`]:
                    {
                      color: ({ palette }) => `${palette.blue[30]} !important`,
                    },
                }}
              />
            </EntityTypeTableCenteredCell>
          )}

          {requiredTableCell ?? (
            <EntityTypeTableCenteredCell width={100}>
              <Checkbox
                disabled
                checked={isRequired}
                sx={{
                  [`.${svgIconClasses.root}`]: {
                    color: "inherit",
                  },
                  [`&.${checkboxClasses.checked}.${checkboxClasses.disabled}`]:
                    {
                      color: ({ palette }) => `${palette.blue[30]} !important`,
                    },
                }}
              />
            </EntityTypeTableCenteredCell>
          )}

          {menuTableCell ?? (
            <TypeMenuCell
              typeId={property.$id}
              variant="property"
              canEdit={false}
              canRemove={false}
            />
          )}
        </EntityTypeTableRow>

        {children.length ? (
          <CollapsibleTableRow
            expanded={expanded}
            depth={depth}
            lineHeight={lineHeight}
            ref={lineRef}
          >
            {children.map((prop, pos) => (
              <PropertyRow
                key={prop.$id}
                property={prop}
                expectedValuesColumnWidth={expectedValuesColumnWidth}
                depth={depth + 1}
                isArray={prop.array}
                isRequired={prop.required}
                ref={(row: HTMLDivElement | undefined) => {
                  if (row && pos === children.length - 1) {
                    lastItemRef.current = row;
                    setLineHeight(
                      row.getBoundingClientRect().top -
                        (lineRef.current?.getBoundingClientRect().top ?? 0) +
                        21,
                    );
                  }
                }}
              />
            ))}
          </CollapsibleTableRow>
        ) : null}
      </>
    );
  },
);

export const PropertyTypeRow = ({
  propertyIndex,
  expectedValuesColumnWidth,
  onRemove,
  onUpdateVersion,
}: {
  propertyIndex: number;
  expectedValuesColumnWidth: number;
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
      <PropertyRow
        property={property}
        isArray={array}
        expectedValuesColumnWidth={expectedValuesColumnWidth}
        allowArraysTableCell={
          <MultipleValuesCell index={propertyIndex} variant="property" />
        }
        requiredTableCell={
          <EntityTypeTableCenteredCell width={100}>
            <Controller
              render={({ field: { value, ...field } }) => (
                <Checkbox {...field} checked={value} />
              )}
              control={control}
              name={`properties.${propertyIndex}.required`}
            />
          </EntityTypeTableCenteredCell>
        }
        menuTableCell={
          <TypeMenuCell
            editButtonProps={bindTrigger(editModalPopupState)}
            onRemove={onRemove}
            typeId={property.$id}
            variant="property"
          />
        }
      />

      <TypeFormModal
        as={PropertyTypeForm}
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

  // @todo make more efficient
  const filteredPropertyTypes = propertyTypes.filter(
    (type) =>
      !properties.some((includedProperty) => includedProperty.$id === type.$id),
  );

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

  const [expectedValueColumnWidth, setExpectedValueColumnWidth] = useState(0);

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
          <TableCell
            ref={(ref: HTMLTableCellElement | undefined) => {
              if (ref?.offsetWidth) {
                setExpectedValueColumnWidth(ref.offsetWidth);
              }
            }}
          >
            Expected values
          </TableCell>
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
            expectedValuesColumnWidth={expectedValueColumnWidth}
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
