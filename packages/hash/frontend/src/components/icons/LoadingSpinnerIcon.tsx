import { FC } from "react";
import { SvgIcon, SvgIconProps } from "@mui/material";

export const LoadingSpinnerIcon: FC<SvgIconProps> = (props) => {
  return (
    <SvgIcon width="16" height="16" viewBox="0 0 32 32" fill="none" {...props}>
      <circle
        opacity="0.2"
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M30.1165 8.4684C31.3531 10.7862 32 13.3729 32 16H26C26 10.4772 21.5228 6 16 6C14.6549 6 13.3718 6.26558 12.2003 6.74716L9.92213 1.19934C11.831 0.41546 13.8684 0.0102622 15.9215 0.00018858C15.9476 6.29408e-05 15.9738 0 16 0C16.0257 0 16.0513 6.03094e-05 16.0769 0.000180934C16.586 0.00262852 17.0958 0.0293747 17.6047 0.0806699C20.2185 0.344144 22.7273 1.24718 24.9094 2.71004C27.0915 4.1729 28.8798 6.15057 30.1165 8.4684Z"
        fill="currentColor"
      />
    </SvgIcon>
  );
};
