import { Box, Typography } from "@mui/material";

import {
  Button,
  Checkbox,
  NumberInput,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { ArrowTurnDownRightIcon } from "@hashintel/type-editor/src/entity-type-editor/shared/arrow-turn-down-right-icon";

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

const clampToRange = (value: number, min?: number, max?: number): number =>
  Math.min(Math.max(value, min ?? -Infinity), max ?? Infinity);

/** Whether `value` is a whole multiple of `factor`, within float tolerance */
const isApproxMultiple = (value: number, factor: number): boolean => {
  if (factor === 0) {
    return false;
  }
  const ratio = value / factor;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
};

/**
 * Whether a permitted value survives the inherited constraints: the graph
 * drops enum values failing any of them when it closes the type, and rejects
 * the save when none survive.
 */
const satisfiesInherited = (
  value: string | number,
  inherited: ConstraintValues,
): boolean => {
  if (inherited.enum && !inherited.enum.some((allowed) => allowed === value)) {
    return false;
  }

  if (typeof value === "number") {
    const { minimum, maximum, multipleOf } = inherited;
    if (
      minimum &&
      (minimum.exclusive ? value <= minimum.value : value < minimum.value)
    ) {
      return false;
    }
    if (
      maximum &&
      (maximum.exclusive ? value >= maximum.value : value > maximum.value)
    ) {
      return false;
    }
    if (multipleOf !== undefined && !isApproxMultiple(value, multipleOf)) {
      return false;
    }
    return true;
  }

  if (inherited.minLength !== undefined && value.length < inherited.minLength) {
    return false;
  }
  if (inherited.maxLength !== undefined && value.length > inherited.maxLength) {
    return false;
  }
  if (inherited.pattern !== undefined) {
    try {
      if (!new RegExp(inherited.pattern).test(value)) {
        return false;
      }
    } catch {
      // An unparsable pattern can't be checked client-side — let it through
    }
  }
  return true;
};

const BoundControl = ({
  bound,
  min,
  max,
  disabled,
  onBoundChange,
}: {
  bound: NumericBound | undefined;
  /** The inherited range: values outside it snap back in on blur */
  min?: number;
  max?: number;
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
      onBlur={() => {
        if (bound && bound.value !== clampToRange(bound.value, min, max)) {
          onBoundChange({
            ...bound,
            value: clampToRange(bound.value, min, max),
          });
        }
      }}
      min={min ?? Number.MIN_SAFE_INTEGER}
      max={max}
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
  min,
  max,
  placeholder,
  disabled,
  onValueChange,
}: {
  value: number | undefined;
  /** The inherited range: values outside it snap back in on blur */
  min?: number;
  max?: number;
  placeholder: string;
  disabled?: boolean;
  onValueChange: (value: number | undefined) => void;
}) => (
  <NumberInput
    value={value ?? null}
    onChange={(next) => onValueChange(next ?? undefined)}
    onBlur={() => {
      if (value !== undefined && value !== clampToRange(value, min ?? 0, max)) {
        onValueChange(clampToRange(value, min ?? 0, max));
      }
    }}
    min={min ?? 0}
    max={max}
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
  inherited,
  disabled,
  onValuesChange,
}: {
  kind: ConstraintKind;
  primitive: ConstraintPrimitive;
  values: ConstraintValues;
  /**
   * The inherited constraint values the override must stay within: the graph
   * intersects all of them with the override, so a looser value is a silent
   * no-op and a value outside the inherited range fails to save. The inputs
   * are bounded accordingly.
   */
  inherited: ConstraintValues;
  disabled?: boolean;
  onValuesChange: (partial: ConstraintValues) => void;
}) => {
  switch (kind) {
    case "minimum":
      return (
        <BoundControl
          bound={values.minimum}
          min={inherited.minimum?.value}
          max={inherited.maximum?.value}
          disabled={disabled}
          onBoundChange={(minimum) => onValuesChange({ minimum })}
        />
      );
    case "maximum":
      return (
        <BoundControl
          bound={values.maximum}
          min={inherited.minimum?.value}
          max={inherited.maximum?.value}
          disabled={disabled}
          onBoundChange={(maximum) => onValuesChange({ maximum })}
        />
      );
    case "multipleOf": {
      const inheritedMultiple = inherited.multipleOf;
      return (
        <NumberInput
          value={values.multipleOf ?? null}
          onChange={(multipleOf) =>
            onValuesChange({ multipleOf: multipleOf ?? undefined })
          }
          onBlur={() => {
            // A divisor of the inherited factor is a silent no-op (the
            // inherited constraint stays stricter) — snap back to it, which
            // the field then drops as an override equal to the inherited
            const current = values.multipleOf;
            if (
              current !== undefined &&
              inheritedMultiple !== undefined &&
              current !== inheritedMultiple &&
              isApproxMultiple(inheritedMultiple, current)
            ) {
              onValuesChange({ multipleOf: inheritedMultiple });
            }
          }}
          min={0}
          step="any"
          hideStepper
          disabled={disabled}
          size="sm"
          width="xs"
          placeholder="e.g. 0.01"
        />
      );
    }
    case "minLength":
      return (
        <IntegerInput
          value={values.minLength}
          min={inherited.minLength}
          max={inherited.maxLength}
          placeholder="None"
          disabled={disabled}
          onValueChange={(minLength) => onValuesChange({ minLength })}
        />
      );
    case "maxLength":
      return (
        <IntegerInput
          value={values.maxLength}
          min={inherited.minLength}
          max={inherited.maxLength}
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
          // Two different formats never intersect — the graph rejects any
          // override of an inherited format outright
          disabled={disabled === true || inherited.format !== undefined}
          size="sm"
          width="fitContent"
        />
      );
    case "enum": {
      const inheritedEnum = inherited.enum;

      // An inherited permitted-values set can only narrow — the graph
      // intersects the override with it, dropping anything new. A multi
      // select over the inherited values makes widening unenterable: the
      // user can only deselect.
      if (inheritedEnum && inheritedEnum.length > 0) {
        const selected = new Set((values.enum ?? []).map(String));

        return (
          <Box sx={{ flex: 1, maxWidth: 420 }}>
            <Select
              items={inheritedEnum.map((value) => ({
                value: String(value),
                text: String(value),
              }))}
              multiple
              value={inheritedEnum
                .filter((value) => selected.has(String(value)))
                .map(String)}
              onChange={(next) => {
                const nextSet = new Set(next);
                const subset = inheritedEnum.filter((value) =>
                  nextSet.has(String(value)),
                );
                onValuesChange({
                  enum: subset.length > 0 ? subset : undefined,
                });
              }}
              disabled={disabled}
              size="sm"
              width="fullWidth"
            />
          </Box>
        );
      }

      return (
        <ValuePillsInput
          values={values.enum ?? []}
          numeric={primitive === "number"}
          readonly={disabled}
          isValueAllowed={(value) => satisfiesInherited(value, inherited)}
          onChange={(enumValues) =>
            onValuesChange({
              enum: enumValues.length > 0 ? enumValues : undefined,
            })
          }
        />
      );
    }
    case "items":
      return (
        <Select<ListItemType>
          items={itemTypeItems}
          value={values.items ?? null}
          onChange={(items) => onValuesChange({ items: items ?? undefined })}
          // A different item type never intersects with the inherited one
          disabled={disabled === true || inherited.items !== undefined}
          size="sm"
          width="fitContent"
        />
      );
    case "minItems":
      return (
        <IntegerInput
          value={values.minItems}
          min={inherited.minItems}
          max={inherited.maxItems}
          placeholder="No minimum"
          disabled={disabled}
          onValueChange={(minItems) => onValuesChange({ minItems })}
        />
      );
    case "maxItems":
      return (
        <IntegerInput
          value={values.maxItems}
          min={inherited.minItems}
          max={inherited.maxItems}
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
  inheritedValues,
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
  /** The inherited constraint values the row's override must stay within */
  inheritedValues: ConstraintValues;
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
    <Box
      component="span"
      sx={{
        width: 140,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
      }}
    >
      {inheritedFromTitle ? (
        <Tooltip
          content={
            overridden
              ? `${
                  childTypesSummary
                    ? `Replaces the constraint in ${childTypesSummary}`
                    : `Overwrites constraint from ${inheritedFromTitle}`
                } — inherited value: ${inheritedValueLabel ?? ""}`
              : `Inherited from ${inheritedFromTitle}`
          }
        >
          <ArrowTurnDownRightIcon
            titleAccess={
              overridden
                ? "Overrides an inherited constraint"
                : `Inherited from ${inheritedFromTitle}`
            }
            sx={{
              flexShrink: 0,
              fill: ({ palette }) =>
                overridden ? palette.orange[60] : palette.gray[60],
            }}
          />
        </Tooltip>
      ) : null}
      <Typography
        component="span"
        sx={{
          fontSize: 14,
          fontWeight: 500,
          color: ({ palette }) => palette.gray[80],
        }}
      >
        {constraintKindLabels[kind]}
      </Typography>
    </Box>
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
        inherited={inheritedValues}
        disabled={readonly}
        onValuesChange={onValuesChange}
      />
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
