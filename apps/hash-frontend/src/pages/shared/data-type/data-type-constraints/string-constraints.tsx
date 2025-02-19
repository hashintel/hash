import type { StringFormat } from "@blockprotocol/type-system";
import { Box, Stack, Typography } from "@mui/material";
import { useEffect } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import type { DataTypeFormData } from "../data-type-form";
import { ConstraintText } from "./shared/constraint-text";
import { EnumEditor } from "./shared/enum-editor";
import { ItemLabel } from "./shared/item-label";
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
  ownMinLength?: number;
  ownMaxLength?: number;
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
  ownMinLength?: number;
  ownMaxLength?: number;
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
  if (typeof minLength === "number" && typeof maxLength === "number") {
    return (
      <>
        {", of between "}
        <ConstraintText
          text={minLength.toString()}
          from={inheritedConstraints.minLength?.from}
        />
        {" and "}
        <ConstraintText
          text={maxLength.toString()}
          from={inheritedConstraints.maxLength?.from}
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
          from={inheritedConstraints.minLength?.from}
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
          from={inheritedConstraints.maxLength?.from}
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

  const patterns: string[] = [];
  if (ownPattern) {
    patterns.push(ownPattern);
  }

  useEffect(() => {
    if (["date", "date-time"].includes(format ?? "")) {
      setValue("constraints.minLength", undefined, { shouldDirty: true });
      setValue("constraints.maxLength", undefined, { shouldDirty: true });
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
          ownMinLength={ownMinLength}
          ownMaxLength={ownMaxLength}
          inheritedConstraints={inheritedConstraints}
        />
      )}
    </Stack>
  );
};
