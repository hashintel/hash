import { Select, SelectProps } from "@mui/material";
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
  selectProps?: SelectProps;
}

export const RHFSelect = <
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  children,
  selectProps,
  ...controllerProps
}: RHFSelectProps<TFieldValues, TName>) => (
  <Controller
    {...controllerProps}
    render={({ field }) => (
      <Select {...field} {...selectProps}>
        {children}
      </Select>
    )}
  />
);
