/* eslint-disable @typescript-eslint/no-empty-object-type */

import { forwardRef } from "react";

import { Button, type ButtonProps } from "../button/button";

export interface IconButtonProps extends ButtonProps {}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (props, ref) => {
    return <Button px="0" py="0" ref={ref} {...props} />;
  },
);
