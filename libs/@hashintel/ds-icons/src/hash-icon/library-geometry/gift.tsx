import { FilledShape } from "../filled-shape";

export const giftGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M12 7v14" />
        </>
      }
    >
      <rect x="4" y="10" width="16" height="11" rx="0.5" />
      <rect x="3" y="7" width="18" height="3" rx="0.5" />
    </FilledShape>
    <path d="M12 7C3 7 5-1 9 3Zm0 0c9 0 7-8 3-4Z" />
  </g>
);
