import { Box, Typography } from "@mui/material";

import {
  Button,
  Checkbox,
  Chip,
  NumberInput,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";

import {
  constraintKindLabels,
  stringFormatLabels,
} from "../shared/constraint-config";
import { listItemTypeLabels } from "../shared/list-config";
import { ValuePillsInput } from "./constraint-row/value-pills-input";

import type {
  ConstraintKind,
  ConstraintPrimitive,
  ConstraintValues,
  NumericBound,
} from "../shared/constraint-config";
import type { ListItemType } from "../shared/list-config";
import type { StringFormat } from "@blockprotocol/type-system";
import type { SelectItem } from "@hashintel/ds-components";

const formatItems: SelectItem<StringFormat>[] = (
  Object.entries(stringFormatLabels) as [StringFormat, string][]
).map(([value, text]) => ({ value, text }));

const itemTypeItems: SelectItem<ListItemType>[] = (
  Object.entries(listItemTypeLabels) as [ListItemType, string][]
).map(([value, text]) => ({ value, text }));

const BoundControl = ({
  bound,
  disabled,
  onBoundChange,
}: {
  bound: NumericBound | undefined;
  disabled?: boolean;
  onBoundChange: (bound: NumericBound | undefined) => void;
}) => (
  <>
    <NumberInput
      value={bound?.value ?? null}
      onChange={(value) =>
        onBoundChange(
          value === null
            ? undefined
            : { value, exclusive: bound?.exclusive ?? false },
        )
      }
      min={Number.MIN_SAFE_INTEGER}
      step="any"
      hideStepper
      disabled={disabled}
      size="sm"
      width="xs"
      placeholder="None"
    />
    {bound ? (
      <Checkbox
        label="Exclusive"
        size="sm"
        value={bound.exclusive}
        disabled={disabled}
        onChange={(exclusive) => onBoundChange({ ...bound, exclusive })}
      />
    ) : null}
  </>
);

const IntegerInput = ({
  value,
  placeholder,
  disabled,
  onValueChange,
}: {
  value: number | undefined;
  placeholder: string;
  disabled?: boolean;
  onValueChange: (value: number | undefined) => void;
}) => (
  <NumberInput
    value={value ?? null}
    onChange={(next) => onValueChange(next ?? undefined)}
    min={0}
    step={1}
    hideStepper
    disabled={disabled}
    size="sm"
    width="xs"
    placeholder={placeholder}
  />
);

const ConstraintControl = ({
  kind,
  primitive,
  values,
  disabled,
  onValuesChange,
}: {
  kind: ConstraintKind;
  primitive: ConstraintPrimitive;
  values: ConstraintValues;
  disabled?: boolean;
  onValuesChange: (partial: ConstraintValues) => void;
}) => {
  switch (kind) {
    case "minimum":
      return (
        <BoundControl
          bound={values.minimum}
          disabled={disabled}
          onBoundChange={(minimum) => onValuesChange({ minimum })}
        />
      );
    case "maximum":
      return (
        <BoundControl
          bound={values.maximum}
          disabled={disabled}
          onBoundChange={(maximum) => onValuesChange({ maximum })}
        />
      );
    case "multipleOf":
      return (
        <NumberInput
          value={values.multipleOf ?? null}
          onChange={(multipleOf) =>
            onValuesChange({ multipleOf: multipleOf ?? undefined })
          }
          min={0}
          step="any"
          hideStepper
          disabled={disabled}
          size="sm"
          width="xs"
          placeholder="e.g. 0.01"
        />
      );
    case "minLength":
      return (
        <IntegerInput
          value={values.minLength}
          placeholder="None"
          disabled={disabled}
          onValueChange={(minLength) => onValuesChange({ minLength })}
        />
      );
    case "maxLength":
      return (
        <IntegerInput
          value={values.maxLength}
          placeholder="None"
          disabled={disabled}
          onValueChange={(maxLength) => onValuesChange({ maxLength })}
        />
      );
    case "pattern":
      return (
        <Box
          sx={{
            flex: 1,
            maxWidth: 420,
            "& input": {
              fontFamily: "monospace",
              fontSize: 13,
            },
          }}
        >
          <TextInput
            value={values.pattern ?? ""}
            onChange={(pattern) =>
              onValuesChange({ pattern: pattern === "" ? undefined : pattern })
            }
            placeholder="e.g. ^[A-Z]{2}$"
            disabled={disabled}
            size="sm"
            width="fullWidth"
          />
        </Box>
      );
    case "format":
      return (
        <Select<StringFormat>
          items={formatItems}
          value={values.format ?? null}
          onChange={(format) => onValuesChange({ format: format ?? undefined })}
          disabled={disabled}
          size="sm"
          width="fitContent"
        />
      );
    case "enum":
      return (
        <ValuePillsInput
          values={values.enum ?? []}
          numeric={primitive === "number"}
          readonly={disabled}
          onChange={(enumValues) =>
            onValuesChange({
              enum: enumValues.length > 0 ? enumValues : undefined,
            })
          }
        />
      );
    case "items":
      return (
        <Select<ListItemType>
          items={itemTypeItems}
          value={values.items ?? null}
          onChange={(items) => onValuesChange({ items: items ?? undefined })}
          disabled={disabled}
          size="sm"
          width="fitContent"
        />
      );
    case "minItems":
      return (
        <IntegerInput
          value={values.minItems}
          placeholder="No minimum"
          disabled={disabled}
          onValueChange={(minItems) => onValuesChange({ minItems })}
        />
      );
    case "maxItems":
      return (
        <IntegerInput
          value={values.maxItems}
          placeholder="No maximum"
          disabled={disabled}
          onValueChange={(maxItems) => onValuesChange({ maxItems })}
        />
      );
  }
};

export const ConstraintRow = ({
  kind,
  primitive,
  values,
  inheritedFromTitle,
  inheritedValueLabel,
  overridden,
  childTypesSummary,
  readonly,
  onValuesChange,
  onRemove,
}: {
  kind: ConstraintKind;
  primitive: ConstraintPrimitive;
  /** The values shown in the row's control: own when set, otherwise inherited */
  values: ConstraintValues;
  inheritedFromTitle: string | null;
  /** The inherited value, formatted — shown when an override replaces it */
  inheritedValueLabel: string | null;
  overridden: boolean;
  /** Types extending the edited type, which an override also binds */
  childTypesSummary: string | null;
  readonly?: boolean;
  onValuesChange: (partial: ConstraintValues) => void;
  onRemove: (() => void) | null;
}) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
    <Typography
      component="span"
      sx={{
        width: 140,
        flexShrink: 0,
        fontSize: 14,
        fontWeight: 500,
        color: ({ palette }) => palette.gray[80],
      }}
    >
      {constraintKindLabels[kind]}
    </Typography>
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <ConstraintControl
        kind={kind}
        primitive={primitive}
        values={values}
        disabled={readonly}
        onValuesChange={onValuesChange}
      />
      {inheritedFromTitle ? (
        overridden ? (
          <Tooltip content={`Inherited value: ${inheritedValueLabel ?? ""}`}>
            <Chip size="xs" variant="soft" color="orange">
              {childTypesSummary
                ? `Replaces the constraint in ${childTypesSummary}`
                : `Overwrites constraint from ${inheritedFromTitle}`}
            </Chip>
          </Tooltip>
        ) : (
          <Chip size="xs" variant="soft" color="blue">
            {`Inherited from ${inheritedFromTitle}`}
          </Chip>
        )
      ) : null}
    </Box>
    {onRemove ? (
      <Button
        variant="ghost"
        size="xs"
        iconName="close"
        tooltip={overridden ? "Remove override" : "Remove constraint"}
        onClick={onRemove}
      />
    ) : null}
  </Box>
);
