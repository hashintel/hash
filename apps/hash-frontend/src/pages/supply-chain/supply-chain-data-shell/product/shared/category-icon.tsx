import type { CategoryIcon as CategoryIconType } from "../../../shared/categories";

interface CategoryIconProps {
  icon: CategoryIconType;
  size?: number;
  color?: string;
  className?: string;
}

export const CategoryIcon = ({
  icon,
  size = 12,
  color = "currentColor",
  className,
}: CategoryIconProps) => {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 14 14",
    fill: "none",
    className,
    "aria-hidden": true as const,
  };

  switch (icon) {
    case "puzzle":
      // The glyph only occupies the centre ~half of the 0 0 14 14 box, so it
      // renders visibly smaller than the other category icons. Crop the
      // viewBox tight around it so it fills the frame at the same weight.
      return (
        <svg {...props} viewBox="3.8 3.2 8.8 8.8">
          <title>Puzzle</title>
          <path
            d="M9.33 6.42h1.09c.64 0 1.16.52 1.16 1.17 0 .64-.52 1.16-1.16 1.16H9.33v1.09c0 .64-.52 1.16-1.16 1.16-.65 0-1.17-.52-1.17-1.16V8.75H5.92c-.65 0-1.17-.52-1.17-1.16 0-.65.52-1.17 1.17-1.17H7V5.33c0-.64.52-1.16 1.17-1.16.64 0 1.16.52 1.16 1.16v1.09Z"
            fill={color}
          />
        </svg>
      );

    case "clock":
      return (
        <svg {...props}>
          <title>Clock</title>
          <circle
            cx="7"
            cy="7"
            r="5.25"
            stroke={color}
            strokeWidth="1.2"
            fill="none"
          />
          <path
            d="M7 4.5V7L8.75 8.75"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );

    case "blocks":
      return (
        <svg {...props}>
          <title>Blocks</title>
          <rect x="2" y="7.5" width="4.5" height="4.5" rx="1" fill={color} />
          <rect
            x="7.5"
            y="7.5"
            width="4.5"
            height="4.5"
            rx="1"
            fill={color}
            opacity="0.6"
          />
          <rect
            x="4.75"
            y="2"
            width="4.5"
            height="4.5"
            rx="1"
            fill={color}
            opacity="0.8"
          />
        </svg>
      );

    case "search-check":
      return (
        <svg {...props}>
          <title>Search check</title>
          <circle
            cx="6.25"
            cy="6.25"
            r="4"
            stroke={color}
            strokeWidth="1.2"
            fill="none"
          />
          <path
            d="M4.75 6.25L5.75 7.25L7.75 5.25"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M9.5 9.5L12 12"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );

    case "truck":
      return (
        <svg {...props}>
          <title>Truck</title>
          <path
            d="M1.75 3.5h6.5v5.25H1.75V3.5Z"
            stroke={color}
            strokeWidth="1.1"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M8.25 5.5h2l1.75 2v1.25h-3.75V5.5Z"
            stroke={color}
            strokeWidth="1.1"
            strokeLinejoin="round"
            fill="none"
          />
          <circle
            cx="4"
            cy="9.5"
            r="1.25"
            stroke={color}
            strokeWidth="1.1"
            fill="none"
          />
          <circle
            cx="10.25"
            cy="9.5"
            r="1.25"
            stroke={color}
            strokeWidth="1.1"
            fill="none"
          />
        </svg>
      );
  }
};
