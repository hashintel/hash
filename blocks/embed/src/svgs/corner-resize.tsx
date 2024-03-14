import type { FunctionComponent } from "react";
import { tw } from "twind";

type CornerResizeProps = {
  position: string;
};

export const CornerResize: FunctionComponent<CornerResizeProps> = ({
  position,
}) => {
  return (
    <svg
      viewBox="0 0 16 16"
      stroke="rgba(255,255,255,0.6)"
      strokeLinecap="round"
      className={tw`h-5 w-5 fill-current text-black text-opacity-70 ${
        position === "bottom-left" ? "rotate-90" : ""
      }`}
    >
      <path
        fillRule="evenodd"
        d="M14 0a2 2 0 00-2 2v10H2a2 2 0 000 4h12a2 2 0 002-2V2a2 2 0 00-2-2z"
      />
    </svg>
  );
};
