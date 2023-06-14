import { forwardRef } from "react";

export const IconHelpCircle = forwardRef<HTMLElement, { size?: number }>(
  (props, ref) => (
    <span style={{ padding: "2px" }} {...props} ref={ref}>
      <svg
        width={props.size ?? 12}
        height={props.size ?? 12}
        viewBox="0 0 20 20"
        className="Icon IconHelpCircle"
      >
        <path
          fill="#fff"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M4.5 12a7.5 7.5 0 1115 0c0 4.143-3.357 7.5-7.5 7.5A7.5 7.5 0 014.5 12zm9.8-.56l-.671.689c-.543.543-.879.996-.879 2.121h-1.5v-.375c0-.828.336-1.578.879-2.121l.932-.944A1.5 1.5 0 1010.5 9.75H9a3 3 0 016 0c0 .66-.267 1.258-.7 1.69zm-3.05 5.81v-1.5h1.5v1.5h-1.5z"
        />
      </svg>
    </span>
  ),
);
