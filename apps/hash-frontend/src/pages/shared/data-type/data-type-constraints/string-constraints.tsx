import type { StringFormat } from "@blockprotocol/type-system";
import { Box, Stack, Typography } from "@mui/material";
import { useEffect } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import type { DataTypeFormData } from "../data-type-form";
import { ItemLabel } from "../shared/item-label";
import { ConstraintText } from "./shared/constraint-text";
import { EnumEditor } from "./shared/enum-editor";
import { NumberInput } from "./shared/number-input";
import type { InheritedConstraints } from "./types";

const isStringLengthIrrelevant = (format?: StringFormat) => {
  return ["date", "time", "date-time"].includes(format ?? "");
};

const StringLengthEditor = ({
  hasEnum,
  ownMinLength,
  ownMaxLength,
  inheritedConstraints,
}: {
  hasEnum: boolean;
  ownMinLength: number | null;
  ownMaxLength: number | null;
  inheritedConstraints: InheritedConstraints;
}) => {
  const { control } = useFormContext<DataTypeFormData>();

  const inheritedMinLength = inheritedConstraints.minLength;
  const inheritedMaxLength = inheritedConstraints.maxLength;

  const minLengthController = useController({
    control,
    name: "constraints.minLength",
    rules: {
      min: inheritedMinLength?.value,
      max: ownMaxLength ?? inheritedMaxLength?.value,
    },
    defaultValue: ownMinLength ?? inheritedMinLength?.value,
  });

  const maxLengthController = useController({
    control,
    name: "constraints.maxLength",
    rules: {
      min: ownMinLength ?? inheritedMinLength?.value,
      max: inheritedMaxLength?.value,
    },
    defaultValue: ownMaxLength ?? inheritedMaxLength?.value,
  });

  return (
    <Stack direction="row" gap={3}>
      <Box>
        <ItemLabel
          tooltip={`The minimum length of the string.${inheritedMinLength ? ` Must be at least ${inheritedMinLength.value} (inherited from ${inheritedMinLength.from.title}).` : ""}`}
        >
          Minimum length
        </ItemLabel>
        <NumberInput
          {...minLengthController.field}
          disabled={hasEnum}
          min={inheritedMinLength?.value}
          max={ownMaxLength ?? inheritedMaxLength?.value}
        />
      </Box>
      <Box>
        <ItemLabel
          tooltip={`The maximum length of the string.${inheritedMaxLength ? ` Must be at most ${inheritedMaxLength.value} (inherited from ${inheritedMaxLength.from.title}).` : ""}`}
        >
          Maximum length
        </ItemLabel>
        <NumberInput
          {...maxLengthController.field}
          disabled={hasEnum}
          min={ownMinLength ?? inheritedMinLength?.value}
          max={inheritedMaxLength?.value}
        />
      </Box>
    </Stack>
  );
};

export const StringConstraintEditor = ({
  ownFormat,
  ownEnum,
  ownMinLength,
  ownMaxLength,
  inheritedConstraints,
}: {
  ownEnum?: [string, ...string[]];
  ownFormat?: StringFormat;
  ownMinLength: number | null;
  ownMaxLength: number | null;
  inheritedConstraints: InheritedConstraints;
}) => {
  const format = ownFormat ?? inheritedConstraints.format?.value;

  const hasEnum = "enum" in inheritedConstraints || !!ownEnum;

  return (
    <Stack gap={4} mt={2}>
      {!inheritedConstraints.enum && !isStringLengthIrrelevant(format) && (
        <StringLengthEditor
          hasEnum={hasEnum}
          ownMinLength={ownMinLength}
          ownMaxLength={ownMaxLength}
          inheritedConstraints={inheritedConstraints}
        />
      )}
      <EnumEditor
        ownEnum={ownEnum}
        ownFormat={ownFormat}
        ownMinLength={ownMinLength}
        ownMaxLength={ownMaxLength}
        ownMinimum={null}
        ownMaximum={null}
        ownExclusiveMinimum={null}
        ownExclusiveMaximum={null}
        ownMultipleOf={null}
        inheritedConstraints={inheritedConstraints}
        type="string"
      />
    </Stack>
  );
};

const StringLengthText = ({
  minLength,
  maxLength,
  inheritedConstraints,
}: {
  minLength?: number;
  maxLength?: number;
  inheritedConstraints: InheritedConstraints;
}) => {
  const minLengthInheritedFrom =
    inheritedConstraints.minLength &&
    inheritedConstraints.minLength.value === minLength
      ? inheritedConstraints.minLength.from
      : undefined;

  const maxLengthInheritedFrom =
    inheritedConstraints.maxLength &&
    inheritedConstraints.maxLength.value === maxLength
      ? inheritedConstraints.maxLength.from
      : undefined;

  if (typeof minLength === "number" && typeof maxLength === "number") {
    return (
      <>
        {", of between "}
        <ConstraintText
          text={minLength.toString()}
          from={minLengthInheritedFrom}
        />
        {" and "}
        <ConstraintText
          text={maxLength.toString()}
          from={maxLengthInheritedFrom}
        />
        {" characters long"}
      </>
    );
  }

  if (typeof minLength === "number") {
    return (
      <>
        {", of at least "}
        <ConstraintText
          text={minLength.toString()}
          from={minLengthInheritedFrom}
        />
        {" characters long"}
      </>
    );
  }

  if (typeof maxLength === "number") {
    return (
      <>
        {", of at most "}
        <ConstraintText
          text={maxLength.toString()}
          from={maxLengthInheritedFrom}
        />
        {" characters long"}
      </>
    );
  }

  return null;
};

export const StringConstraints = ({
  inheritedConstraints,
  isReadOnly,
}: {
  inheritedConstraints: InheritedConstraints;
  isReadOnly: boolean;
}) => {
  const { control, setValue } = useFormContext<DataTypeFormData>();

  const constraints = useWatch({ control, name: "constraints" });

  const type = inheritedConstraints.type?.value ?? constraints.type;

  const ownFormat = "format" in constraints ? constraints.format : undefined;
  const ownMinLength =
    "minLength" in constraints ? constraints.minLength : undefined;
  const ownMaxLength =
    "maxLength" in constraints ? constraints.maxLength : undefined;

  const ownPattern = "pattern" in constraints ? constraints.pattern : undefined;
  const ownEnum = "enum" in constraints ? constraints.enum : undefined;

  const format = ownFormat ?? inheritedConstraints.format?.value;

  const minLength = ownMinLength ?? inheritedConstraints.minLength?.value;

  const maxLength = ownMaxLength ?? inheritedConstraints.maxLength?.value;

  /**
   * Reset the min/max length if the inherited constraints are narrower
   * – handle the case of a parent change which makes the type's own constraints invalid.
   */
  useEffect(() => {
    if (
      inheritedConstraints.minLength?.value !== undefined &&
      ownMinLength != null
    ) {
      if (inheritedConstraints.minLength.value > ownMinLength) {
        setValue("constraints.minLength", null, { shouldDirty: true });
      }
    }
    if (
      inheritedConstraints.maxLength?.value !== undefined &&
      ownMaxLength != null
    ) {
      if (inheritedConstraints.maxLength.value < ownMaxLength) {
        setValue("constraints.maxLength", null, { shouldDirty: true });
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
  }, [inheritedConstraints, ownEnum, ownMinLength, ownMaxLength, setValue]);

  const patterns: string[] = [];
  if (ownPattern) {
    patterns.push(ownPattern);
  }

  useEffect(() => {
    if (["date", "date-time"].includes(format ?? "")) {
      setValue("constraints.minLength", null, { shouldDirty: true });
      setValue("constraints.maxLength", null, { shouldDirty: true });
    }
  }, [format, setValue]);

  if (type !== "string") {
    throw new Error("String constraint expected");
  }

  if (
    "pattern" in inheritedConstraints &&
    inheritedConstraints.pattern?.length
  ) {
    patterns.push(
      ...inheritedConstraints.pattern.map((regexp) => regexp.value),
    );
  }

  return (
    <Stack>
      <Box>
        <Typography variant="smallTextParagraphs" sx={{ fontWeight: 300 }}>
          {"It must be a "}
          <ConstraintText
            text="string"
            from={inheritedConstraints.type?.from}
          />
          {format && (
            <>
              {`, formatted as ${["email"].includes(format) ? "an" : "a"} `}
              <ConstraintText
                text={format === "uri" ? "URI" : format}
                from={inheritedConstraints.format?.from}
              />
            </>
          )}
          {typeof minLength === "number" ||
          typeof maxLength === "number" ||
          !isStringLengthIrrelevant(format) ? (
            <StringLengthText
              minLength={minLength}
              maxLength={maxLength}
              inheritedConstraints={inheritedConstraints}
            />
          ) : null}
          .
        </Typography>
      </Box>
      {!isReadOnly && (
        <StringConstraintEditor
          ownEnum={ownEnum as [string, ...string[]]}
          ownMinLength={ownMinLength ?? null}
          ownMaxLength={ownMaxLength ?? null}
          inheritedConstraints={inheritedConstraints}
        />
      )}
    </Stack>
  );
};
