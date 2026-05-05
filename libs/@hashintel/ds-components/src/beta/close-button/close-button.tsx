/* eslint-disable import/no-extraneous-dependencies, @typescript-eslint/no-explicit-any */

import { XIcon } from "lucide-react";
import { forwardRef } from "react";

import { IconButton, type IconButtonProps } from "../icon-button/icon-button";

export type CloseButtonProps = IconButtonProps;

// IconButton produces a union type too complex for TS in this context
// biome-ignore lint/suspicious/noExplicitAny: union type too complex for TS
const TypedIconButton = IconButton as React.ComponentType<any>;

export const CloseButton = forwardRef<HTMLButtonElement, CloseButtonProps>(
  (props, ref) => {
    return (
      <TypedIconButton
        variant="plain"
        colorPalette="gray"
        aria-label="Close"
        ref={ref}
        {...props}
      >
        {props.children ?? <XIcon />}
      </TypedIconButton>
    );
  },
);
