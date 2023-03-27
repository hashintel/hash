import clsx from "clsx";
import { ButtonHTMLAttributes, forwardRef } from "react";

import styles from "./styles.module.scss";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, ...rest }, ref) => {
    return (
      <button
        className={clsx(styles.wrapper, className)}
        type="button"
        ref={ref}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
