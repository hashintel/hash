import {
  Box,
  outlinedInputClasses,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { CloseIcon, IconButton, Select } from "@hashintel/design-system";
import { typedKeys } from "@local/advanced-types/typed-entries";
import { createConversionFunction } from "@local/hash-isomorphic-utils/data-types";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { TriangleExclamationRegularIcon } from "../../../../shared/icons/triangle-exclamation-regular-icon";
import { MenuItem } from "../../../../shared/ui/menu-item";
import { NumberInput } from "../data-type-constraints/shared/number-input";
import { ItemLabel } from "../shared/item-label";
import { applyConversionDefinition } from "./apply-conversion-definition";

import type { DataTypeFormData } from "../data-type-form";
import type {
  ConversionDefinition,
  ConversionValue,
  Conversions,
  DataType,
  DataTypeWithMetadata,
  Operator,
} from "@blockprotocol/type-system";

const characterToOpMap = {
  "+": "+",
  "–": "-",
  "×": "*",
  "÷": "/",
};

const operatorCharacters = typedKeys(characterToOpMap);

type OperatorCharacter = (typeof operatorCharacters)[number];

const operatorToOpCharacterMap: Record<Operator, OperatorCharacter> = {
  "+": "+",
  "-": "–",
  "*": "×",
  "/": "÷",
};

const formatConversionValue = (
  value: ConversionValue,
  sourceTitle: string,
): string => {
  if (value === "self") {
    return sourceTitle;
  }
  if (Array.isArray(value)) {
    const [operator, left, right] = value;
    return `(${formatConversionValue(left, sourceTitle)} ${operatorToOpCharacterMap[operator]} ${formatConversionValue(right, sourceTitle)})`;
  }
  return formatNumber(value.const);
};

const ReadOnlyCalculation = ({
  definition,
  inheritedFrom,
  sourceTitle,
  targetTitle,
}: {
  definition: ConversionDefinition;
  inheritedFrom: string | null;
  sourceTitle: string;
  targetTitle: string;
}) => {
  return (
    <Box>
      <ItemLabel
        tooltip={
          <Box>
            The calculation to convert {sourceTitle} to {targetTitle}.
            {inheritedFrom ? (
              <>
                {" "}
                <br />
                Inherited from {inheritedFrom}.
              </>
            ) : (
              ""
            )}
          </Box>
        }
      >
        {sourceTitle} to {targetTitle}
      </ItemLabel>
      <Typography variant="smallTextParagraphs" sx={{ fontWeight: 300 }}>
        {formatConversionValue(definition.expression, sourceTitle)} ={" "}
        {targetTitle}
      </Typography>
    </Box>
  );
};

const OperatorDropdown = ({
  operator,
  onChange,
}: {
  operator: Operator;
  onChange: (operator: Operator) => void;
}) => {
  return (
    <Select
      value={operator}
      onChange={(event) => {
        onChange(event.target.value as Operator);
      }}
      sx={{
        "& svg": {
          display: "none",
        },
        [`& .${outlinedInputClasses.root}`]: {
          boxShadow: "none",
        },
        [`& .${outlinedInputClasses.input}`]: {
          fontSize: 15,
          lineHeight: 1,
          minHeight: "fit-content",
          p: "2px 7px !important",
          textAlign: "center",
        },
      }}
    >
      {operatorCharacters.map((opCharacter) => (
        <MenuItem
          key={opCharacter}
          value={characterToOpMap[opCharacter]}
          sx={{ justifyContent: "center", padding: "8px 10px", fontSize: 14 }}
        >
          {opCharacter}
        </MenuItem>
      ))}
    </Select>
  );
};

const ConversionFormulaEditor = ({
  definition,
  direction,
  error,
  inheritedFrom,
  isReadOnly,
  onChange,
  self,
  target,
}: {
  definition: ConversionDefinition;
  direction: "from" | "to";
  inheritedFrom: string | null;
  error?: string;
  isReadOnly: boolean;
  onChange: (
    direction: "from" | "to",
    definition: ConversionDefinition,
  ) => void;
  self: DataType;
  target: DataTypeWithMetadata;
}) => {
  const [operator, left, right] = definition.expression;

  if (
    isReadOnly ||
    left !== "self" ||
    Array.isArray(right) ||
    right === "self"
  ) {
    return (
      <ReadOnlyCalculation
        definition={definition}
        inheritedFrom={inheritedFrom}
        sourceTitle={direction === "to" ? self.title : target.schema.title}
        targetTitle={direction === "to" ? target.schema.title : self.title}
      />
    );
  }

  return (
    <Box>
      <ItemLabel
        tooltip={
          <Box>
            The calculation to convert{" "}
            {direction === "to" ? self.title : target.schema.title} to{" "}
            {direction === "to" ? target.schema.title : self.title}.
            {inheritedFrom ? (
              <>
                {" "}
                <br />
                Inherited from {inheritedFrom}.
              </>
            ) : (
              ""
            )}
          </Box>
        }
      >
        {direction === "to" ? self.title : target.schema.title} to{" "}
        {direction === "to" ? target.schema.title : self.title}
      </ItemLabel>
      <Stack direction="row" alignItems="center" gap={0.5} mt={0.5}>
        <Typography variant="smallTextParagraphs" sx={{ fontWeight: 300 }}>
          {direction === "to" ? self.title : target.schema.title}
        </Typography>
        <OperatorDropdown
          operator={operator}
          onChange={(newOp) => {
            onChange(direction, { expression: [newOp, left, right] });
          }}
        />
        <NumberInput
          onChange={(newRightConst) => {
            onChange(direction, {
              expression: [
                operator,
                left,
                { const: newRightConst ?? 1, type: "number" },
              ],
            });
          }}
          value={right.const}
          sx={{
            px: 1,
            py: "4px",
            borderRadius: 1.5,
            minWidth: 50,
            mt: 0,
            width: right.const.toString().length * 8 + 50,
          }}
        />
        <Typography variant="smallTextParagraphs" sx={{ fontWeight: 300 }}>
          = {direction === "to" ? target.schema.title : self.title}
        </Typography>
        {error !== undefined && (
          <Tooltip title={error} placement="top">
            <TriangleExclamationRegularIcon
              sx={{
                fontSize: 14,
                color: ({ palette }) => palette.red[70],
                ml: 0.5,
              }}
            />
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
};

export const ConversionEditor = ({
  conversions,
  dataType,
  inheritedFromTitle,
  isReadOnly,
  target,
}: {
  conversions: Conversions;
  dataType: DataType;
  inheritedFromTitle: string | null;
  isReadOnly: boolean;
  target: DataTypeWithMetadata;
}) => {
  const { from, to } = conversions;

  const { control, setValue } = useFormContext<DataTypeFormData>();

  const ownConversions = useWatch({ control, name: "conversions" });

  const isEditable = !isReadOnly && !inheritedFromTitle;

  const onDefinitionChange = (
    direction: "from" | "to",
    definition: ConversionDefinition,
  ) => {
    setValue("conversions", {
      ...ownConversions,
      [target.metadata.recordId.baseUrl]: applyConversionDefinition({
        conversions,
        definition,
        direction,
      }),
    });
  };

  const unexpectedResult = useMemo(() => {
    const fromFn = createConversionFunction([from]);
    const toFn = createConversionFunction([to]);

    const result = fromFn(toFn(1));

    return result === 1 ? null : result;
  }, [from, to]);

  return (
    <Stack
      gap={2}
      mt={0.5}
      key={target.metadata.recordId.baseUrl}
      sx={({ palette }) => ({
        background: palette.gray[15],
        borderRadius: 2,
        border: `1px solid ${palette.gray[20]}`,
        px: 1.5,
        py: 1,
        width: "fit-content",
      })}
    >
      <Stack direction="row" alignItems="flex-start" gap={1}>
        <ConversionFormulaEditor
          definition={from}
          direction="from"
          error={
            unexpectedResult !== null
              ? `Converting 1 ${dataType.title} to ${target.schema.title} and back results in ${unexpectedResult} ${dataType.title}.`
              : undefined
          }
          inheritedFrom={inheritedFromTitle}
          isReadOnly={!isEditable}
          onChange={onDefinitionChange}
          self={dataType}
          target={target}
        />
        {isEditable && (
          <Tooltip title={`Remove conversion to ${target.schema.title}`}>
            <IconButton
              onClick={() => {
                const newConversions = ownConversions ?? {};

                delete newConversions[target.metadata.recordId.baseUrl];

                setValue("conversions", newConversions);
              }}
              sx={({ palette }) => ({
                mt: 0.1,
                "& svg": { fontSize: 11 },
                "&:hover": {
                  background: "none",
                  "& svg": { fill: palette.red[70] },
                },
                p: 0.5,
              })}
              type="button"
            >
              <CloseIcon
                sx={({ palette, transitions }) => ({
                  fill: palette.gray[40],
                  transition: transitions.create("fill"),
                })}
              />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <ConversionFormulaEditor
        definition={to}
        direction="to"
        error={
          unexpectedResult !== null
            ? `Converting 1 ${dataType.title} to ${target.schema.title} and back results in ${unexpectedResult} ${dataType.title}.`
            : undefined
        }
        inheritedFrom={inheritedFromTitle}
        isReadOnly={!isEditable}
        onChange={onDefinitionChange}
        self={dataType}
        target={target}
      />
    </Stack>
  );
};
