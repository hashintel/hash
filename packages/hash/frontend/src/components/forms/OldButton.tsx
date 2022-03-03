import { forwardRef, ComponentProps } from "react";
import { tw } from "twind";

export const OldButton = forwardRef<
  HTMLButtonElement,
  { big?: boolean; danger?: boolean } & ComponentProps<"button">
>(({ big, children, className, disabled, danger, ...props }, ref) => {
  let bgStyles = "bg(blue-500 hover:blue-700) ";

  if (disabled) {
    bgStyles = "bg(gray-400) ";
  }

  if (danger) {
    bgStyles = "bg(red-500 hover:red-700) ";
  }

  return (
    <button
      type="button"
      className={tw`${bgStyles} text(white visited:white) font-bold border(none hover:none) rounded no-underline ${
        big ? "text-md py-3 px-8" : "text-sm py-2 px-5"
      } ${className ?? ""}`}
      {...props}
      ref={ref}
    >
      {children}
    </button>
  );
});
