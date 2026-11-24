import { FilledShape } from "../filled-shape";

export const inboxGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 15h5l2 3h4l2-3h5" />
        </>
      }
    >
      <path d="M6 4h12l3 11v6H3v-6Z" />
    </FilledShape>
  </g>
);
