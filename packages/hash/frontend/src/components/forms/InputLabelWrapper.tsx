import { FunctionComponent, ReactNode } from "react";
import { tw } from "twind";

export const InputLabelWrapper: FunctionComponent<{
  children: ReactNode;
  label: string;
  className?: string;
}> = ({ label, children, className = "" }) => (
  // eslint-disable-next-line jsx-a11y/label-has-associated-control
  <label>
    <div
      className={tw`mb-1 uppercase text-sm font-semibold ${className || ""}`}
    >
      {label}
    </div>
    {children}
  </label>
);
