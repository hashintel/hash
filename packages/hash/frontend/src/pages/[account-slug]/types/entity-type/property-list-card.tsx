import { VersionedUri } from "@blockprotocol/type-system-web";
import {
  Box,
  ButtonBase,
  Checkbox,
  checkboxClasses,
  iconButtonClasses,
  svgIconClasses,
  Table,
  TableBody,
  tableBodyClasses,
  TableCell,
  tableCellClasses,
  TableFooter,
  TableHead,
  TableRow,
  tableRowClasses,
  Typography,
} from "@mui/material";
import { experimental_sx, styled } from "@mui/system";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { useId, useLayoutEffect, useRef } from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { useBlockProtocolUpdatePropertyType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolUpdatePropertyType";
import { WhiteCard } from "../../shared/white-card";
import { EmptyPropertyListCard } from "./empty-property-list-card";
import { EntityTypeEditorForm } from "./form-types";
import { InsertPropertyRow } from "./insert-property-row";
import { MultipleValuesCell } from "./multiple-values-cell";
import { PropertyExpectedValues } from "./property-expected-values";
import { PropertyMenu } from "./property-menu";
import { formDataToPropertyType, PropertyTypeForm } from "./property-type-form";
import { QuestionIcon } from "./question-icon";
import { StyledPlusCircleIcon } from "./styled-plus-circle-icon";
import {
  usePropertyTypes,
  useRefetchPropertyTypes,
} from "./use-property-types";
import { useStateCallback } from "./util";

const CenteredTableCell = styled(TableCell)(
  experimental_sx({
    px: "0px !important",
    textAlign: "center",
  }),
);

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
      <TableRow
        sx={[
          (theme) => ({
            [`.${tableCellClasses.root}`]: {
              "&:first-of-type": {
                borderTopLeftRadius: theme.borderRadii.md,
                borderBottomLeftRadius: theme.borderRadii.md,
              },
              "&:last-of-type": {
                borderTopRightRadius: theme.borderRadii.md,
                borderBottomRightRadius: theme.borderRadii.md,
              },
            },
          }),
          (theme) => ({
            [`&:hover .${tableCellClasses.root}`]: {
              background: theme.palette.gray[10],
            },
          }),
        ]}
      >
        <TableCell>
          <Typography variant="smallTextLabels" fontWeight={500}>
            {property.title}
          </Typography>
        </TableCell>
        <TableCell>
          <PropertyExpectedValues property={property} />
        </TableCell>

        <MultipleValuesCell propertyIndex={propertyIndex} />

        <CenteredTableCell sx={{ textAlign: "center" }}>
          <Controller
            render={({ field: { value, ...field } }) => (
              <Checkbox {...field} checked={value} />
            )}
            control={control}
            name={`properties.${propertyIndex}.required`}
          />
        </CenteredTableCell>

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
      </TableRow>
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
    <WhiteCard>
      <Box sx={{ p: 0.5 }}>
        <Table
          sx={(theme) => ({
            height: "100%",
            [`.${tableCellClasses.root}`]: {
              pl: 3.5,
              pr: 1,
              py: 0.5,
              border: "none",
            },
            [`.${tableCellClasses.head}`]: {
              py: 1.5,
              borderBottom: 1,
              borderColor: theme.palette.gray[20],
              fontWeight: "inherit",
              lineHeight: "inherit",

              [`.${svgIconClasses.root}`]: {
                verticalAlign: "middle",
                ml: 0.75,
              },
            },
            [`.${tableBodyClasses.root}:before`]: {
              lineHeight: "6px",
              content: `"\\200C"`,
              display: "block",
            },
            [`.${tableCellClasses.body} .${checkboxClasses.root}`]: {
              textAlign: "center",
            },
          })}
        >
          <TableHead>
            <Typography
              component={TableRow}
              variant="smallTextLabels"
              sx={{
                fontWeight: 600,
              }}
            >
              <TableCell>Property name</TableCell>
              <TableCell width={180}>Expected values</TableCell>
              <CenteredTableCell width={170}>
                Allow multiple values <QuestionIcon />
              </CenteredTableCell>
              <CenteredTableCell width={100}>Required</CenteredTableCell>
              <TableCell width={70} />
            </Typography>
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
              <TableRow>
                <TableCell
                  colSpan={
                    // Sufficiently large to span full width
                    100
                  }
                  sx={{
                    p: "0 !important",
                  }}
                >
                  <ButtonBase
                    disableRipple
                    disableTouchRipple
                    onClick={() => {
                      setAddingNewProperty(true, () => {
                        addingNewPropertyRef.current?.focus();
                      });
                    }}
                    sx={(theme) => ({
                      color: theme.palette.gray[50],
                      py: 1.5,
                      width: "100%",
                      borderRadius: 1,
                      "&:hover": {
                        backgroundColor: theme.palette.gray[10],
                        color: theme.palette.gray[70],
                      },
                    })}
                  >
                    <StyledPlusCircleIcon />
                    <Typography
                      variant="smallTextLabels"
                      fontWeight={500}
                      ml={1}
                    >
                      Add a property
                    </Typography>
                  </ButtonBase>
                </TableCell>
              </TableRow>
            )}
          </TableFooter>
        </Table>
      </Box>
    </WhiteCard>
  );
};
