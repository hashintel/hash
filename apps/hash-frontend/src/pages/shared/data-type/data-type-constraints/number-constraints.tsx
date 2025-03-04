import { Box, Checkbox, Stack, Tooltip, Typography } from "@mui/material";
import { useEffect } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import type { DataTypeFormData } from "../data-type-form";
import { ItemLabel } from "../shared/item-label";
import { ConstraintText } from "./shared/constraint-text";
import { EnumEditor } from "./shared/enum-editor";
import { NumberInput } from "./shared/number-input";
import type { InheritedConstraints } from "./types";

const NumberRangeEditor = ({
  hasEnum,
  ownMinimum,
  ownMaximum,
  ownExclusiveMinimum,
  ownExclusiveMaximum,
  inheritedConstraints,
}: {
  hasEnum: boolean;
  ownMinimum: number | null;
  ownMaximum: number | null;
  ownExclusiveMinimum: boolean | null;
  ownExclusiveMaximum: boolean | null;
  inheritedConstraints: InheritedConstraints;
}) => {
  const { control, setValue } = useFormContext<DataTypeFormData>();

  const inheritedMinimum = inheritedConstraints.minimum;
  const inheritedMaximum = inheritedConstraints.maximum;

  const minimumController = useController({
    control,
    name: "constraints.minimum",
    rules: {
      min: inheritedMinimum?.value.value,
      max: ownMaximum ?? inheritedMaximum?.value.value,
    },
    defaultValue: ownMinimum ?? inheritedMinimum?.value.value,
  });

  const maximumController = useController({
    control,
    name: "constraints.maximum",
    rules: {
      min: ownMinimum ?? inheritedMinimum?.value.value,
      max: inheritedMaximum?.value.value,
    },
    defaultValue: ownMaximum ?? inheritedMaximum?.value.value,
  });

  const exclusiveMinimumDisabled =
    hasEnum ||
    (ownMinimum === inheritedMinimum?.value.value &&
      inheritedConstraints.minimum?.value.exclusive === true);

  const exclusiveMaximumDisabled =
    hasEnum ||
    (ownMaximum === inheritedMaximum?.value.value &&
      inheritedConstraints.maximum?.value.exclusive === true);

  return (
    <Stack direction="row" gap={3}>
      <Box>
        <ItemLabel
          tooltip={`The minimum value of the number.${inheritedMinimum ? ` Must be at least ${inheritedMinimum.value.value} (inherited from ${inheritedMinimum.from.title}).` : ""}`}
        >
          Minimum
        </ItemLabel>
        <NumberInput
          {...minimumController.field}
          disabled={hasEnum}
          min={inheritedMinimum?.value.value}
          max={ownMaximum ?? inheritedMaximum?.value.value}
        />
        <Box
          component="label"
          sx={{
            display: "flex",
            cursor: "pointer",
            alignItems: "center",
            mt: 0.8,
          }}
        >
          <Checkbox
            checked={
              ownExclusiveMinimum ??
              inheritedConstraints.minimum?.value.exclusive
            }
            disabled={exclusiveMinimumDisabled}
            onChange={(event) =>
              setValue("constraints.exclusiveMinimum", event.target.checked)
            }
            sx={{
              svg: {
                width: 14,
                height: 14,
                rect: {
                  fill: exclusiveMinimumDisabled
                    ? ({ palette }) =>
                        (ownExclusiveMinimum ??
                        inheritedConstraints.minimum?.value.exclusive)
                          ? palette.gray[40]
                          : palette.gray[20]
                    : undefined,
                },
              },
            }}
          />
          <Tooltip
            title={`If checked, the value must be greater than the minimum value.${typeof inheritedConstraints.minimum?.value.exclusive === "boolean" ? ` (inherited from ${inheritedConstraints.minimum.from.title}).` : ""}`}
          >
            <Typography
              variant="smallTextParagraphs"
              sx={{
                fontSize: 12,
                ml: 0.8,
                color: ({ palette }) => palette.gray[80],
              }}
            >
              Exclusive
            </Typography>
          </Tooltip>
        </Box>
      </Box>
      <Box>
        <ItemLabel
          tooltip={`The maximum value of the number.${inheritedMaximum ? ` Must be at most ${inheritedMaximum.value.value} (inherited from ${inheritedMaximum.from.title}).` : ""}`}
        >
          Maximum
        </ItemLabel>
        <NumberInput
          {...maximumController.field}
          disabled={hasEnum}
          min={ownMinimum ?? inheritedMinimum?.value.value}
          max={inheritedMaximum?.value.value}
        />

        <Box
          component="label"
          sx={{
            display: "flex",
            cursor: "pointer",
            alignItems: "center",
            mt: 0.8,
          }}
        >
          <Checkbox
            checked={
              ownExclusiveMaximum ??
              inheritedConstraints.maximum?.value.exclusive
            }
            disabled={exclusiveMaximumDisabled}
            onChange={(event) =>
              setValue("constraints.exclusiveMaximum", event.target.checked)
            }
            sx={{
              svg: {
                rect: {
                  fill: exclusiveMaximumDisabled
                    ? ({ palette }) =>
                        (ownExclusiveMaximum ??
                        inheritedConstraints.maximum?.value.exclusive)
                          ? palette.gray[40]
                          : palette.gray[20]
                    : undefined,
                },
                width: 14,
                height: 14,
              },
            }}
          />
          <Tooltip
            title={`If checked, the value must be less than the maximum value.${typeof inheritedConstraints.maximum?.value.exclusive === "boolean" ? ` (inherited from ${inheritedConstraints.maximum.from.title}).` : ""}`}
          >
            <Typography
              variant="smallTextParagraphs"
              sx={{
                fontSize: 12,
                ml: 0.8,
                color: ({ palette }) => palette.gray[80],
              }}
            >
              Exclusive
            </Typography>
          </Tooltip>
        </Box>
      </Box>
    </Stack>
  );
};

export const NumberConstraintEditor = ({
  ownEnum,
  ownMinimum,
  ownMaximum,
  ownExclusiveMinimum,
  ownExclusiveMaximum,
  ownMultipleOf,
  inheritedConstraints,
}: {
  ownEnum?: [number, ...number[]];
  ownMinimum: number | null;
  ownMaximum: number | null;
  ownExclusiveMinimum: boolean | null;
  ownExclusiveMaximum: boolean | null;
  ownMultipleOf: number | null;
  inheritedConstraints: InheritedConstraints;
}) => {
  return (
    <Stack gap={3} mt={2}>
      {!inheritedConstraints.enum && (
        <NumberRangeEditor
          hasEnum={"enum" in inheritedConstraints || !!ownEnum}
          ownMinimum={ownMinimum}
          ownMaximum={ownMaximum}
          ownExclusiveMinimum={ownExclusiveMinimum}
          ownExclusiveMaximum={ownExclusiveMaximum}
          inheritedConstraints={inheritedConstraints}
        />
      )}
      <EnumEditor
        ownEnum={ownEnum}
        ownMinimum={ownMinimum}
        ownMaximum={ownMaximum}
        ownExclusiveMinimum={ownExclusiveMinimum}
        ownExclusiveMaximum={ownExclusiveMaximum}
        ownMinLength={null}
        ownMaxLength={null}
        ownMultipleOf={ownMultipleOf}
        inheritedConstraints={inheritedConstraints}
        type="number"
      />
    </Stack>
  );
};

const NumberRangeText = ({
  minimum,
  maximum,
  exclusiveMinimum,
  exclusiveMaximum,
  inheritedConstraints,
}: {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  inheritedConstraints: InheritedConstraints;
}) => {
  const minimumInheritedFrom =
    inheritedConstraints.minimum &&
    inheritedConstraints.minimum.value.value === minimum
      ? inheritedConstraints.minimum.from
      : undefined;

  const maximumInheritedFrom =
    inheritedConstraints.maximum &&
    inheritedConstraints.maximum.value.value === maximum
      ? inheritedConstraints.maximum.from
      : undefined;

  if (typeof minimum === "number" && typeof maximum === "number") {
    return (
      <>
        {" between "}
        <ConstraintText text={minimum.toString()} from={minimumInheritedFrom} />{" "}
        (
        <ConstraintText
          text={exclusiveMinimum ? "exclusive" : "inclusive"}
          from={inheritedConstraints.minimum?.from}
        />
        ){" and "}
        <ConstraintText text={maximum.toString()} from={maximumInheritedFrom} />{" "}
        (
        <ConstraintText
          text={exclusiveMaximum ? "exclusive" : "inclusive"}
          from={inheritedConstraints.maximum?.from}
        />
        )
      </>
    );
  }

  if (typeof minimum === "number") {
    return (
      <>
        {" greater than "}
        <ConstraintText text={minimum.toString()} from={minimumInheritedFrom} />{" "}
        (
        <ConstraintText
          text={exclusiveMinimum ? "exclusive" : "inclusive"}
          from={inheritedConstraints.minimum?.from}
        />
        )
      </>
    );
  }

  if (typeof maximum === "number") {
    return (
      <>
        {" less than "}
        <ConstraintText text={maximum.toString()} from={maximumInheritedFrom} />{" "}
        (
        <ConstraintText
          text={exclusiveMaximum ? "exclusive" : "inclusive"}
          from={inheritedConstraints.maximum?.from}
        />
        )
      </>
    );
  }

  return null;
};

export const NumberConstraints = ({
  inheritedConstraints,
  isReadOnly,
}: {
  inheritedConstraints: InheritedConstraints;
  isReadOnly: boolean;
}) => {
  const { control, setValue } = useFormContext<DataTypeFormData>();

  const constraints = useWatch({ control, name: "constraints" });

  const type = inheritedConstraints.type?.value ?? constraints.type;

  if (type !== "number") {
    throw new Error("Number constraint expected");
  }

  const ownMinimum = "minimum" in constraints ? constraints.minimum : undefined;
  const ownMaximum = "maximum" in constraints ? constraints.maximum : undefined;
  const ownExclusiveMinimum =
    "exclusiveMinimum" in constraints
      ? constraints.exclusiveMinimum
      : undefined;
  const ownExclusiveMaximum =
    "exclusiveMaximum" in constraints
      ? constraints.exclusiveMaximum
      : undefined;
  const ownMultipleOf =
    "multipleOf" in constraints ? constraints.multipleOf : undefined;

  const ownEnum = "enum" in constraints ? constraints.enum : undefined;

  const minimum = ownMinimum ?? inheritedConstraints.minimum?.value.value;
  const maximum = ownMaximum ?? inheritedConstraints.maximum?.value.value;
  const exclusiveMinimum =
    ownExclusiveMinimum ?? inheritedConstraints.minimum?.value.exclusive;
  const exclusiveMaximum =
    ownExclusiveMaximum ?? inheritedConstraints.maximum?.value.exclusive;
  const multipleOf =
    ownMultipleOf ?? inheritedConstraints.multipleOf?.[0]?.value;

  /**
   * Reset the min/max and enum if the inherited constraints are narrower
   * – handle the case of a parent change which makes the type's own constraints invalid.
   */
  useEffect(() => {
    if (
      inheritedConstraints.minimum?.value.value !== undefined &&
      ownMinimum != null
    ) {
      if (inheritedConstraints.minimum.value.value > ownMinimum) {
        setValue("constraints.minimum", null, { shouldDirty: true });
      }
    }
    if (
      inheritedConstraints.maximum?.value.value !== undefined &&
      ownMaximum != null
    ) {
      if (inheritedConstraints.maximum.value.value < ownMaximum) {
        setValue("constraints.maximum", null, { shouldDirty: true });
      }
    }

    if (inheritedConstraints.enum?.value.length && ownEnum) {
      const validEnumValues = ownEnum.filter((value) =>
        /**
         * @todo what is going on with the type inference here
         */
        inheritedConstraints.enum!.value.includes(value as never),
      ) as unknown as typeof inheritedConstraints.enum.value;

      if (validEnumValues.length !== ownEnum.length) {
        setValue("constraints.enum", validEnumValues, { shouldDirty: true });
      }
    }
  }, [inheritedConstraints, ownEnum, ownMinimum, ownMaximum, setValue]);

  return (
    <Stack>
      <Box>
        <Typography variant="smallTextParagraphs" sx={{ fontWeight: 300 }}>
          {"It must be a "}
          <ConstraintText
            text="number"
            from={inheritedConstraints.type?.from}
          />
          {typeof minimum === "number" || typeof maximum === "number" ? (
            <NumberRangeText
              minimum={minimum}
              maximum={maximum}
              exclusiveMinimum={exclusiveMinimum}
              exclusiveMaximum={exclusiveMaximum}
              inheritedConstraints={inheritedConstraints}
            />
          ) : null}
          {typeof multipleOf === "number" && (
            <>
              {". It must be a multiple of "}
              <ConstraintText
                text={multipleOf.toString()}
                from={inheritedConstraints.multipleOf?.[0]?.from}
              />
            </>
          )}
          .
        </Typography>
      </Box>
      {!isReadOnly && (
        <NumberConstraintEditor
          ownEnum={ownEnum as [number, ...number[]]}
          ownMinimum={ownMinimum ?? null}
          ownMaximum={ownMaximum ?? null}
          ownExclusiveMinimum={ownExclusiveMinimum ?? null}
          ownExclusiveMaximum={ownExclusiveMaximum ?? null}
          ownMultipleOf={ownMultipleOf ?? null}
          inheritedConstraints={inheritedConstraints}
        />
      )}
    </Stack>
  );
};
