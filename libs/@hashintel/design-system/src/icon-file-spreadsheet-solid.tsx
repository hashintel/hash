import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const SpreadsheetFileIconSolid: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon
      width="384"
      height="512"
      viewBox="0 0 384 512"
      fill="none"
      {...props}
    >
      <path d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM88 224H296c17.7 0 32 14.3 32 32v16 80 64c0 17.7-14.3 32-32 32H232 152 88c-17.7 0-32-14.3-32-32V352 272 256c0-17.7 14.3-32 32-32zm0 112h48V288H88v48zm80 0h48V288H168v48zm80 0h48V288H248v48zm0 32v48h48V368H248zm-32 0H168v48h48V368zm-80 0H88v48h48V368z" />
    </SvgIcon>
  );
};
