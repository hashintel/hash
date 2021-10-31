import { forwardRef, ComponentProps } from "react";
import { tw } from "twind";

export const Button = forwardRef<
  HTMLButtonElement,
  { big?: boolean } & ComponentProps<"button">
>(({ big, children, className, disabled, ...props }, ref) => (
  <button
    type="button"
    className={tw`${
      disabled ? "bg(gray-400) " : "bg(blue-500 hover:blue-700) "
    } text(white visited:white) font-bold border(none hover:none) rounded no-underline ${
      big ? "text-md py-3 px-8" : "text-sm py-2 px-5"
    } ${className ?? ""}`}
    {...props}
    ref={ref}
  >
    {children}
  </button>
));
