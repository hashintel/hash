/* Star Wars artwork and trademarks remain with their respective owners. Bounds, theme colors, and app tiles are adaptations. */
export const markLight = ({ id }: { id: string }) => (
  <g fill="#111111">
    <circle
      fill="none"
      stroke="#000000"
      strokeWidth="31.8518"
      cx="300"
      cy="300"
      r="284.0741"
    />
    <circle cx="300" cy="300" r="93.2122" />
    <g id={`${id}-Half`}>
      <g id={`${id}-Elmt`}>
        <path d="M164.331,122.014A223.797,223.797 0 0,1 270.077,78.2125 V48.1605A253.611,253.611 0 0,0 143.081,100.764Z" />
        <path
          fill="none"
          stroke="#000000"
          strokeWidth="38.881"
          d="M300,300v187.968"
        />
      </g>
      <use xlinkHref={`#${id}-Elmt`} transform="rotate(45,300,300)" />
      <use xlinkHref={`#${id}-Elmt`} transform="rotate(90,300,300)" />
      <use xlinkHref={`#${id}-Elmt`} transform="rotate(135,300,300)" />
    </g>
    <use xlinkHref={`#${id}-Half`} transform="rotate(180,300,300)" />
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="#F5F7FA">
    <circle
      fill="none"
      stroke="#F5F7FA"
      strokeWidth="31.8518"
      cx="300"
      cy="300"
      r="284.0741"
    />
    <circle cx="300" cy="300" r="93.2122" />
    <g id={`${id}-Half`}>
      <g id={`${id}-Elmt`}>
        <path d="M164.331,122.014A223.797,223.797 0 0,1 270.077,78.2125 V48.1605A253.611,253.611 0 0,0 143.081,100.764Z" />
        <path
          fill="none"
          stroke="#F5F7FA"
          strokeWidth="38.881"
          d="M300,300v187.968"
        />
      </g>
      <use xlinkHref={`#${id}-Elmt`} transform="rotate(45,300,300)" />
      <use xlinkHref={`#${id}-Elmt`} transform="rotate(90,300,300)" />
      <use xlinkHref={`#${id}-Elmt`} transform="rotate(135,300,300)" />
    </g>
    <use xlinkHref={`#${id}-Half`} transform="rotate(180,300,300)" />
  </g>
);
