import { Select, SelectProps } from "@hashintel/design-system";
import { ReactNode } from "react";
import {
  Controller,
  FieldPath,
  FieldValues,
  UseControllerProps,
} from "react-hook-form";

interface RHFSelectProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> extends UseControllerProps<TFieldValues, TName> {
  children: ReactNode;
  selectProps?: Omit<
    SelectProps,
    | "name"
    | "onBlur"
    | "onChange"
    | "ref"
    | "value"
    | "defaultValue"
    | "children"
  >;
}

export const RHFSelect = <
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  children,
  selectProps,
  ...controllerProps
}: RHFSelectProps<TFieldValues, TName>) => {
  return (
    <Controller
      {...controllerProps}
      render={({ field }) => (
        <Select {...field} {...selectProps}>
          {children}
        </Select>
      )}
    />
  );
};
