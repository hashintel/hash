"use client";

/* eslint-disable @typescript-eslint/no-use-before-define, @typescript-eslint/prefer-nullish-coalescing */

import { ark } from "@ark-ui/react/factory";
import { createContext, mergeProps } from "@ark-ui/react/utils";
import { forwardRef, useMemo } from "react";

import { type HTMLStyledProps, styled } from "@hashintel/ds-helpers/jsx";

import { buttonRecipe, type ButtonRecipeProps } from "./button.recipe";
import { Group, type GroupProps } from "./group";
import { Loader } from "./loader";

interface ButtonLoadingProps {
  /**
   * If `true`, the button will show a loading spinner.
   * @default false
   */
  loading?: boolean | undefined;
  /**
   * The text to show while loading.
   */
  loadingText?: React.ReactNode | undefined;
  /**
   * The spinner to show while loading.
   */
  spinner?: React.ReactNode | undefined;
  /**
   * The placement of the spinner
   * @default "start"
   */
  spinnerPlacement?: "start" | "end" | undefined;
}

interface ButtonCompositionProps {
  asChild?: boolean | undefined;
}

const BaseButton = styled(ark.button, buttonRecipe);
type BaseButtonProps = HTMLStyledProps<"button"> & NonNullable<ButtonRecipeProps>;

export interface ButtonProps extends BaseButtonProps, ButtonCompositionProps, ButtonLoadingProps {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const propsContext = useButtonPropsContext();
  const buttonProps = useMemo(
    () => mergeProps<ButtonProps>(propsContext, props),
    [propsContext, props],
  );

  const { loading, loadingText, children, spinner, spinnerPlacement, ...rest } = buttonProps;
  return (
    <BaseButton
      type="button"
      ref={ref}
      {...rest}
      data-loading={loading ? "" : undefined}
      disabled={loading || rest.disabled}
    >
      {!props.asChild && loading ? (
        <Loader spinner={spinner} text={loadingText} spinnerPlacement={spinnerPlacement}>
          {children}
        </Loader>
      ) : (
        children
      )}
    </BaseButton>
  );
});

export type ButtonGroupProps = GroupProps & NonNullable<ButtonRecipeProps>;

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>((props, ref) => {
  const [variantProps, otherProps] = useMemo(() => buttonRecipe.splitVariantProps(props), [props]);
  return (
    <ButtonPropsProvider value={variantProps}>
      <Group ref={ref} {...otherProps} />
    </ButtonPropsProvider>
  );
});

const [ButtonPropsProvider, useButtonPropsContext] = createContext<NonNullable<ButtonRecipeProps>>({
  name: "ButtonPropsContext",
  hookName: "useButtonPropsContext",
  providerName: "<PropsProvider />",
  strict: false,
});
