import { FilledShape } from "../filled-shape";

export const flameGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M12 13c-1 2-3 3-3 5a3 3 0 0 0 6 0c0-2-2-3-3-5Z" />
        </>
      }
    >
      <path d="M12 2c1 4-4 5-4 9-2-1-2-3-2-3-3 4-3 9 1 12 3 2 7 2 10 0 5-4 3-11-1-14 0 3-2 4-2 4 1-3 0-6-2-8Z" />
    </FilledShape>
  </g>
);
