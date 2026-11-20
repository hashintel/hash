import { Box, Typography } from "@mui/material";
import { useState } from "react";

import {
  Button,
  NumberInput,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { ArrowTurnDownRightIcon } from "@hashintel/type-editor/src/entity-type-editor/shared/arrow-turn-down-right-icon";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import {
  constraintKindLabels,
  countBoundsConflict,
  formatConstraintValue,
  isApproxMultiple,
  numericBoundsConflict,
  satisfiesInherited,
  stringFormatLabels,
} from "../../constraint-util";
import { listItemTypeLabels } from "../../list-util";
import { ValuePillsInput } from "./value-pills-input";

import type {
  ConstraintKind,
  ConstraintPrimitive,
  ConstraintValues,
  NumericBound,
} from "../../constraint-util";
import type { ListItemType } from "../../list-util";
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

type BoundComparator = "inclusive" | "exclusive";

const boundComparatorSymbols: Record<
  "minimum" | "maximum",
  Record<BoundComparator, string>
> = {
  minimum: { inclusive: "≥", exclusive: ">" },
  maximum: { inclusive: "≤", exclusive: "<" },
};

/** The row reads "value ≥ 5": a comparator select between word and number */
const BoundControl = ({
  kind,
  bound,
  min,
  max,
  invalid,
  onBoundChange,
}: {
  kind: "minimum" | "maximum";
  bound: NumericBound | undefined;
  /** The inherited range: values outside it snap back in on blur */
  min?: number;
  max?: number;
  /** The pair disagrees — stays typable, submission rejects it with a card error */
  invalid?: boolean;
  onBoundChange: (bound: NumericBound | undefined) => void;
}) => {
  const symbols = boundComparatorSymbols[kind];

  // The choice made before a number exists, applied once one is typed
  const [draftExclusive, setDraftExclusive] = useState(false);
  const exclusive = bound?.exclusive ?? draftExclusive;

  return (
    <>
      <Typography
        component="span"
        sx={{ fontSize: 14, color: ({ palette }) => palette.gray[60] }}
      >
        value
      </Typography>
      <Select<BoundComparator>
        items={[
          { value: "inclusive", text: symbols.inclusive },
          { value: "exclusive", text: symbols.exclusive },
        ]}
        value={exclusive ? "exclusive" : "inclusive"}
        onChange={(comparator) => {
          setDraftExclusive(comparator === "exclusive");
          if (bound) {
            onBoundChange({ ...bound, exclusive: comparator === "exclusive" });
          }
        }}
        required
        renderItem={(comparator) => (
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 1,
              whiteSpace: "nowrap",
            }}
          >
            <Box component="span" sx={{ minWidth: 14, fontWeight: 500 }}>
              {symbols[comparator]}
            </Box>
            <Box
              component="span"
              sx={{ fontSize: 13, color: ({ palette }) => palette.gray[60] }}
            >
              {comparator === "inclusive"
                ? `inclusive — the ${kind} itself is allowed`
                : `exclusive — values must be ${kind === "minimum" ? "above" : "below"} it`}
            </Box>
          </Box>
        )}
        renderSelectedItem={(comparator) => symbols[comparator]}
        hideArrow
        size="sm"
        width="fitContent"
      />
      <NumberInput
        value={bound?.value ?? null}
        invalid={invalid}
        onChange={(value) => {
          if (value === null) {
            // Clearing keeps the comparator choice for the next number
            if (bound) {
              setDraftExclusive(bound.exclusive);
            }
            onBoundChange(undefined);
            return;
          }
          onBoundChange({ value, exclusive });
        }}
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
        size="sm"
        width="xs"
        placeholder="None"
      />
    </>
  );
};

const IntegerInput = ({
  value,
  min,
  max,
  invalid,
  placeholder,
  onValueChange,
}: {
  value: number | undefined;
  /** The inherited range: values outside it snap back in on blur */
  min?: number;
  max?: number;
  /** The pair disagrees — stays typable, submission rejects it with a card error */
  invalid?: boolean;
  placeholder: string;
  onValueChange: (value: number | undefined) => void;
}) => (
  <NumberInput
    value={value ?? null}
    invalid={invalid}
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
  onValuesChange: (partial: ConstraintValues) => void;
}) => {
  // Each pair is judged as the user sees it: an own bound against the other
  // side's own value, or the inherited one standing in for it
  const boundsConflict =
    numericBoundsConflict(
      values.minimum ?? inherited.minimum,
      values.maximum ?? inherited.maximum,
    ) !== null;
  const lengthsConflict = countBoundsConflict(
    values.minLength ?? inherited.minLength,
    values.maxLength ?? inherited.maxLength,
  );
  const itemCountsConflict = countBoundsConflict(
    values.minItems ?? inherited.minItems,
    values.maxItems ?? inherited.maxItems,
  );

  switch (kind) {
    case "minimum":
      return (
        <BoundControl
          kind="minimum"
          bound={values.minimum}
          min={inherited.minimum?.value}
          max={inherited.maximum?.value}
          invalid={boundsConflict}
          onBoundChange={(minimum) => onValuesChange({ minimum })}
        />
      );
    case "maximum":
      return (
        <BoundControl
          kind="maximum"
          bound={values.maximum}
          min={inherited.minimum?.value}
          max={inherited.maximum?.value}
          invalid={boundsConflict}
          onBoundChange={(maximum) => onValuesChange({ maximum })}
        />
      );
    case "multipleOf": {
      const inheritedMultiple = inherited.multipleOf;
      return (
        <NumberInput
          value={values.multipleOf ?? null}
          // Zero is not a divisor, but it stays typable (it's on the way to
          // "0.x" and "-0.x") — submission rejects it with a card error
          invalid={values.multipleOf === 0}
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
          min={Number.MIN_SAFE_INTEGER}
          step="any"
          hideStepper
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
          invalid={lengthsConflict}
          placeholder="None"
          onValueChange={(minLength) => onValuesChange({ minLength })}
        />
      );
    case "maxLength":
      return (
        <IntegerInput
          value={values.maxLength}
          min={inherited.minLength}
          max={inherited.maxLength}
          invalid={lengthsConflict}
          placeholder="None"
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
                // Shown per the user's locale; the id stays the raw value
                text: typeof value === "number" ? formatNumber(value) : value,
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
          invalid={itemCountsConflict}
          placeholder="No minimum"
          onValueChange={(minItems) => onValuesChange({ minItems })}
        />
      );
    case "maxItems":
      return (
        <IntegerInput
          value={values.maxItems}
          min={inherited.minItems}
          max={inherited.maxItems}
          invalid={itemCountsConflict}
          placeholder="No maximum"
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
}) => {
  // An inherited format or item type can never be overridden — a differing
  // value never intersects, so the graph rejects it — making the whole row
  // read-only rather than an editable control
  const lockedByInheritance =
    (kind === "format" && inheritedValues.format !== undefined) ||
    (kind === "items" && inheritedValues.items !== undefined);

  const showAsText = readonly === true || lockedByInheritance;

  // Two cells of the parent ConstraintsCard grid, so the labels and values
  // line up across rows without a fixed label width
  return (
    <>
      <Box
        component="span"
        sx={{
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
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        {showAsText ? (
          // Plain text rather than disabled inputs: nothing here is editable
          <Typography
            component="span"
            sx={{ fontSize: 14, color: ({ palette }) => palette.gray[80] }}
          >
            {formatConstraintValue(kind, values) || "—"}
          </Typography>
        ) : (
          <ConstraintControl
            kind={kind}
            primitive={primitive}
            values={values}
            inherited={inheritedValues}
            onValuesChange={onValuesChange}
          />
        )}
        {onRemove ? (
          <Box sx={{ marginLeft: "auto" }}>
            <Button
              variant="ghost"
              size="xs"
              iconName="close"
              tooltip={overridden ? "Remove override" : "Remove constraint"}
              onClick={onRemove}
            />
          </Box>
        ) : null}
      </Box>
    </>
  );
};
