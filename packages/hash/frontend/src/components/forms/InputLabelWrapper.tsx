import { FunctionComponent, ReactNode } from "react";

export const InputLabelWrapper: FunctionComponent<{
  children: ReactNode;
  label: string;
  className?: string;
}> = ({ label, children, className = "" }) => (
  <label>
    <div style={tw`mb-1 uppercase text-sm font-semibold ${className || ""}`}>
      {label}
    </div>
    {children}
  </label>
);
