export const InputConnector = ({
  className,
  "data-part": dataPart,
}: {
  className?: string;
  "data-part"?: string;
}) => {
  return (
    <svg
      viewBox="0 0 20 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      data-part={dataPart}
    >
      <path
        d="M 0 9 A 10 9 0 0 0 20 9 L 20 53 A 10 9 0 0 0 0 53 Z"
        fill="inherit"
      />
      <path
        d="M 0 9 A 10 9 0 0 0 20 9"
        stroke="currentColor"
        strokeWidth="inherit"
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
      <path
        d="M 0 53 A 10 9 0 0 1 20 53"
        stroke="currentColor"
        strokeWidth="inherit"
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
    </svg>
  );
};
