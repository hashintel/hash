import { FunctionComponent, ReactNode } from "react";
import { tw } from "twind";

export const InputLabelWrapper: FunctionComponent<{
  children: ReactNode;
  label: string;
}> = ({ label, children }) => (
  <label>
    <div className={tw`mb-1 uppercase text-sm font-semibold`}>{label}</div>
    {children}
  </label>
);
