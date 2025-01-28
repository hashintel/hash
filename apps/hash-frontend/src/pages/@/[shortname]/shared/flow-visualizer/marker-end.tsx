type MarkerEndProps = {
  id: string;
  color: string;
};

export const MarkerEnd = ({ id, color }: MarkerEndProps) => {
  return (
    <svg>
      <marker
        id={id}
        markerWidth="15"
        markerHeight="15"
        viewBox="-10 -10 20 20"
        orient="auto"
        markerUnits="userSpaceOnUse"
        refX="0"
        refY="0"
      >
        <polyline
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          fill="none"
          points="-6,-6 0,0 -6,6"
        />
      </marker>
    </svg>
  );
};
