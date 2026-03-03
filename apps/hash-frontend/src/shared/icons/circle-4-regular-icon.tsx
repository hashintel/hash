import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const Circle4RegularIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 512 512">
      <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512z" />
      <g transform="translate(64 0)">
        <path d="M189 77.6c7.5-16 .7-35.1-15.3-42.6s-35.1-.7-42.6 15.3L3 322.4c-4.7 9.9-3.9 21.5 1.9 30.8S21 368 32 368H256v80c0 17.7 14.3 32 32 32s32-14.3 32-32V368h32c17.7 0 32-14.3 32-32s-14.3-32-32-32h-32V160c0-17.7-14.3-32-32-32s-32 14.3-32 32V304H82.4L189 77.6z" />
      </g>
    </SvgIcon>
  );
};
