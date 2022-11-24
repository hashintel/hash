import { PropertyType } from "@blockprotocol/type-system-web";
import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/hash-design-system";
import {
  Box,
  ButtonBase,
  Checkbox,
  checkboxClasses,
  outlinedInputClasses,
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
  useForkRef,
} from "@mui/material";
import { experimental_sx, styled } from "@mui/system";
import {
  bindPopover,
  bindToggle,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { Ref, useId, useRef, useState } from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { Modal } from "../../../../components/Modals/Modal";
import { EmptyPropertyListCard } from "./empty-property-list-card";
import { EntityTypeEditorForm } from "./form-types";
import { MultipleValuesCell } from "./multiple-values-cell";
import { PropertyExpectedValues } from "./property-expected-values";
import { TypeListSelectorDropdownContext } from "./type-list-selector-dropdown";
import { PropertyMenu } from "./property-menu";
import { PropertySelector } from "./property-selector";
import { PropertyTypeForm } from "./property-type-form";
import { QuestionIcon } from "./question-icon";
import { StyledPlusCircleIcon } from "./styled-plus-circle-icon";
import { usePropertyTypes } from "./use-property-types";
import { mustBeVersionedUri, useStateCallback, withHandler } from "./util";
import { WhiteCard } from "../../shared/white-card";

const CenteredTableCell = styled(TableCell)(
  experimental_sx({
    px: "0px !important",
    textAlign: "center",
  }),
);

const InsertPropertyRow = ({
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

export const PropertyTypeRow = ({
  propertyIndex,
  onRemove,
}: {
  propertyIndex: number;
  onRemove: () => void;
}) => {
  const { control } = useFormContext<EntityTypeEditorForm>();

  const propertyTypes = usePropertyTypes();

  const [$id] = useWatch({
    name: [`properties.${propertyIndex}.$id`],
  });

  const propertyId = mustBeVersionedUri($id);
  const property = propertyTypes ? propertyTypes[propertyId] : null;

  if (propertyTypes && !property) {
    throw new Error("Missing property type");
  }

  return property ? (
    <TableRow>
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

      <CenteredTableCell sx={{ px: "0px !important" }}>
        <TextField
          placeholder="Add default value"
          sx={{
            width: "100%",
            [`.${tableRowClasses.root}:not(:hover) & .${outlinedInputClasses.root}:not(:focus-within)`]:
              {
                boxShadow: "none",
                [`.${outlinedInputClasses.notchedOutline}`]: {
                  borderColor: "transparent",
                },
                [`.${outlinedInputClasses.input}::placeholder`]: {
                  color: "transparent",
                },
              },
          }}
          inputProps={{ sx: { textOverflow: "ellipsis" } }}
        />
      </CenteredTableCell>

      <TableCell>
        <PropertyMenu onRemove={onRemove} property={property} />
      </TableCell>
    </TableRow>
  ) : null;
};

export const PropertyListCard = () => {
  const { control, getValues } = useFormContext<EntityTypeEditorForm>();
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
            [`.${tableBodyClasses.root} .${tableRowClasses.root}`]: {
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
              [`&:hover .${tableCellClasses.root}`]: {
                background: theme.palette.gray[10],
              },
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
              <CenteredTableCell width={150}>
                Default value <QuestionIcon />
              </CenteredTableCell>
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
                onAdd={(type) => {
                  setAddingNewProperty(false);
                  if (
                    !getValues("properties").some(({ $id }) => $id === type.$id)
                  ) {
                    append({
                      $id: mustBeVersionedUri(type.$id),
                      required: false,
                      array: false,
                      minValue: 0,
                      maxValue: 0,
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
