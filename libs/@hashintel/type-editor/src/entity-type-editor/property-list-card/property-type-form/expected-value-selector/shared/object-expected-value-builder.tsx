import { extractBaseUrl } from "@blockprotocol/type-system/slim";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  fluidFontClassName,
  Chip,
  FontAwesomeIcon,
} from "@hashintel/design-system";
import {
  Box,
  Checkbox,
  chipClasses,
  Collapse,
  Stack,
  styled,
  Tooltip,
  Typography,
} from "@mui/material";
import { usePopupState } from "material-ui-popup-state/hooks";
import { FunctionComponent, useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { usePropertyTypesOptions } from "../../../../../shared/property-types-options-context";
import { Property } from "../../../shared/expected-value-types";
import { CustomExpectedValueSelector } from "./custom-expected-value-selector";
import { DeleteExpectedValueModal } from "./delete-expected-value-modal";
import { ExpectedValueBadge } from "./expected-value-badge";
import { ExpectedValueSelectorFormValues } from "./expected-value-selector-form-values";

const StyledTableRow = styled(Box)(({ theme }) => ({
  display: "flex",
  borderBottom: `1px solid ${theme.palette.gray[30]} !important`,
  gap: theme.spacing(1.5),
  padding: `${theme.spacing(1)} ${theme.spacing(1.5)}}`,
}));

const StyledTableHeadCell = styled(Box)({
  lineHeight: "18px",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
});

const StyledTableBodyCell = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

interface ObjectExpectedValueRowProps {
  objectId: string;
  property: Property;
  propertyIndex: number;
  allowArraysColumnWidth: number;
  requiredColumnWidth: number;
}

const ObjectExpectedValueRow: FunctionComponent<
  ObjectExpectedValueRowProps
> = ({
  objectId,
  property,
  propertyIndex,
  allowArraysColumnWidth,
  requiredColumnWidth,
}) => {
  const [show, setShow] = useState(false);

  const { setValue } = useFormContext<ExpectedValueSelectorFormValues>();

  const propertyTypes = usePropertyTypesOptions();
  const propertyType = propertyTypes[property.id];

  useEffect(() => {
    if (propertyType) {
      setShow(true);
    }
  }, [propertyType]);

  const { allowArrays, required, animatingOut } = property;

  return propertyType ? (
    <Collapse in={show && !animatingOut} sx={{ width: 1 }}>
      <StyledTableRow sx={{ backgroundColor: "red" }}>
        <StyledTableBodyCell sx={{ justifyContent: "flex-start", flex: 1 }}>
          <FontAwesomeIcon
            icon={faAsterisk}
            sx={(theme) => ({
              color: theme.palette.gray[50],
              verticalAlign: "middle",
            })}
          />
          <Typography
            variant="smallTextLabels"
            component="span"
            ml={1.5}
            color={(theme) => theme.palette.gray[80]}
          >
            {propertyType.title}
          </Typography>
          <Chip
            color="purple"
            label="PROPERTY TYPE"
            sx={{
              ml: 1.5,
              borderColor: "transparent",
              [`.${chipClasses.label}`]: {
                fontWeight: 600,
                fontSize: 11,
              },
            }}
            size="xs"
          />
        </StyledTableBodyCell>
        <StyledTableBodyCell
          sx={{
            width: allowArraysColumnWidth,
          }}
        >
          <Checkbox
            checked={allowArrays}
            onChange={(evt) => {
              setValue(
                `flattenedCustomExpectedValueList.${objectId}.data.properties.${propertyIndex}.allowArrays`,
                evt.target.checked,
              );
            }}
          />
        </StyledTableBodyCell>
        <StyledTableBodyCell
          sx={{
            width: requiredColumnWidth,
          }}
        >
          <Checkbox
            checked={required}
            onChange={(evt) => {
              setValue(
                `flattenedCustomExpectedValueList.${objectId}.data.properties.${propertyIndex}.required`,
                evt.target.checked,
              );
            }}
          />
        </StyledTableBodyCell>
      </StyledTableRow>
    </Collapse>
  ) : null;
};

type ObjectExpectedValueBuilderProps = {
  expectedValueId: string;
  prefix?: string;
  deleteTooltip?: string;
  onDelete?: () => void;
  index?: number[];
};

export const ObjectExpectedValueBuilder: FunctionComponent<
  ObjectExpectedValueBuilderProps
> = ({ expectedValueId, prefix, deleteTooltip, onDelete, index = [] }) => {
  const propertyTypes = usePropertyTypesOptions();

  const { setValue, getValues, control } =
    useFormContext<ExpectedValueSelectorFormValues>();

  const editingExpectedValueIndex = useWatch({
    control,
    name: `editingExpectedValueIndex`,
  });

  const properties = useWatch({
    control,
    name: `flattenedCustomExpectedValueList.${expectedValueId}.data.properties`,
  });

  const [allowArraysColumnWidth, setAllowArraysColumnWidth] = useState(0);
  const [requiredColumnWidth, setRequiredColumnWidth] = useState(0);

  const propertyIds = useMemo(
    () => properties.map(({ id }) => id),
    [properties],
  );

  const deleteModalPopupState = usePopupState({
    variant: "popover",
    popupId: `deleteObject-${expectedValueId}`,
  });

  const [show, setShow] = useState(false);

  useEffect(() => {
    if (properties.length === 0 && show) {
      setShow(false);
    } else if (properties.length > 0 && !show) {
      setShow(true);
    }
  }, [properties, show]);

  const options = useMemo(() => {
    const propertyTypeBaseUrl = getValues(`propertyTypeBaseUrl`);
    return Object.values(propertyTypes)
      .map(({ $id }) => $id)
      .filter(
        (versionedUrl) => extractBaseUrl(versionedUrl) !== propertyTypeBaseUrl,
      );
  }, [propertyTypes, getValues]);

  return (
    <Stack sx={{ mb: 1 }}>
      <ExpectedValueBadge
        typeId="object"
        prefix={prefix}
        deleteTooltip={deleteTooltip}
        onDelete={() => {
          if (properties.length > 0) {
            deleteModalPopupState.open();
          } else {
            onDelete?.();
          }
        }}
      />

      <Box
        sx={({ palette }) => ({
          marginLeft: 1.25,
          flex: 1,
          background: palette.gray[index.length % 2 !== 0 ? 20 : 10],
          borderBottomRightRadius: 4,
          borderBottomLeftRadius: 4,
          position: "relative",
          border: `1px solid ${palette.gray[30]}`,
          borderTopWidth: 0,
        })}
      >
        <Box width={1}>
          <Collapse in={show}>
            <StyledTableRow>
              <StyledTableHeadCell sx={{ flex: 1 }}>NAME</StyledTableHeadCell>
              <StyledTableHeadCell
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                }}
                ref={(ref: HTMLDivElement | null) => {
                  if (ref) {
                    setAllowArraysColumnWidth(ref.offsetWidth);
                  }
                }}
              >
                ALLOW MULTIPLE
                <Tooltip
                  title="Allow multiple values"
                  placement="top"
                  classes={{ popper: fluidFontClassName }}
                >
                  <FontAwesomeIcon
                    icon={faCircleQuestion}
                    sx={{
                      fontSize: 12,
                      color: ({ palette }) => palette.gray[40],
                    }}
                  />
                </Tooltip>
              </StyledTableHeadCell>
              <StyledTableHeadCell
                ref={(ref: HTMLDivElement | null) => {
                  if (ref) {
                    setRequiredColumnWidth(ref.offsetWidth);
                  }
                }}
              >
                REQUIRED
              </StyledTableHeadCell>
            </StyledTableRow>
          </Collapse>

          {properties.length
            ? properties.map((property, propertyIndex) => (
                <ObjectExpectedValueRow
                  key={property.id}
                  objectId={expectedValueId}
                  property={property}
                  propertyIndex={propertyIndex}
                  allowArraysColumnWidth={allowArraysColumnWidth}
                  requiredColumnWidth={requiredColumnWidth}
                />
              ))
            : null}
        </Box>

        <Box sx={{ px: 1.25, py: 1 }}>
          <CustomExpectedValueSelector
            inputLabel="Add to property object"
            collapsedWidth={214}
            value={propertyIds}
            options={options}
            onChange={(_evt, _data, reason, details) => {
              const typeId = details?.option;
              if (typeId) {
                if (reason === "selectOption") {
                  setValue(
                    `flattenedCustomExpectedValueList.${expectedValueId}.data.properties`,
                    [
                      ...properties,
                      {
                        id: details.option,
                        allowArrays: false,
                        required: false,
                      },
                    ],
                  );

                  // trigger popper reposition calculation
                  window.dispatchEvent(new Event("resize"));
                } else if (reason === "removeOption") {
                  setValue(
                    `flattenedCustomExpectedValueList.${expectedValueId}.data.properties`,
                    properties.map((property) => {
                      if (property.id === details.option) {
                        setTimeout(() => {
                          setValue(
                            `flattenedCustomExpectedValueList.${expectedValueId}.data.properties`,
                            properties.filter(
                              ({ id }) => id !== details.option,
                            ),
                          );
                        }, 300);

                        return { ...property, animatingOut: true };
                      }
                      return property;
                    }),
                  );
                }
              }
            }}
            renderOption={(optProps, opt) => {
              const property = propertyTypes[opt];
              return property ? (
                <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
                  <FontAwesomeIcon
                    icon={faAsterisk}
                    sx={(theme) => ({
                      color: theme.palette.gray[50],
                    })}
                  />
                  <Typography
                    variant="smallTextLabels"
                    component="span"
                    ml={1.5}
                    color={(theme) => theme.palette.gray[80]}
                    fontWeight={500}
                  >
                    {property.title}
                  </Typography>
                  <Chip
                    color="purple"
                    label="PROPERTY TYPE"
                    sx={{
                      ml: 1.5,
                      borderColor: "transparent",
                      [`.${chipClasses.label}`]: {
                        fontWeight: 600,
                        fontSize: 11,
                      },
                    }}
                    size="xs"
                  />
                </Box>
              ) : null;
            }}
          />
        </Box>

        <DeleteExpectedValueModal
          expectedValueType="property object"
          popupState={deleteModalPopupState}
          editing={editingExpectedValueIndex !== undefined}
          onDelete={onDelete}
          onClose={() => deleteModalPopupState.close()}
          propertyTypeCount={properties.length}
        />
      </Box>
    </Stack>
  );
};
