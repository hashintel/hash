import { FunctionComponent, ReactNode } from "react";

export const InputLabelWrapper: FunctionComponent<{
  children: ReactNode;
  label: string;
  className?: string;
}> = ({ label, children, className = "" }) => (
  <label>
    className={className}
    <div
      style={{
        fontSize: "0.875rem",
        fontWeight: "600",
        lineHeight: "1.25rem",
        marginBottom: "0.25rem",
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
    {children}
  </label>
);
