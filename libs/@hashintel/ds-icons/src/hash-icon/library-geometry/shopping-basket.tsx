import { FilledShape } from "../filled-shape";

export const shoppingBasketGeometry = (
  <g transform="translate(1.2 1.2) scale(.9)">
    <g fill="none">
      <FilledShape
        cutout={
          <>
            <path d="M9 13v4m6-4v4" />
          </>
        }
      >
        <path d="M3 9h18l-3 12H6Z" />
      </FilledShape>
      <path d="M7 9l5-7 5 7" />
    </g>
  </g>
);
