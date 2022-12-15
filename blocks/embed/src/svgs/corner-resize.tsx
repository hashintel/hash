import { FunctionComponent } from "react";

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
      style={{
        color: "#000000",
        opacity: "0.7",
        width: "1.25rem",
        height: "1.25rem",
        fill: "currentColor",
        ...(position === "bottom-left" ? { transform: "rotate(90deg)" } : {}),
      }}
    >
      <path
        fillRule="evenodd"
        d="M14 0a2 2 0 00-2 2v10H2a2 2 0 000 4h12a2 2 0 002-2V2a2 2 0 00-2-2z"
      />
    </svg>
  );
};
