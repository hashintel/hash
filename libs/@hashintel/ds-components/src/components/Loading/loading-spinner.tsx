import { cx } from "@hashintel/ds-helpers/css";
import { useId } from "react";

import type { FormInputSize } from "../../util/form-shared";
import { styles } from "./loading-spinner.recipe";

export type LoadingSpinnerVariant = "default" | "bars";

const spokes = [
  { rotation: 0, opacity: 1 },
  { rotation: 30, opacity: 0.93 },
  { rotation: 60, opacity: 0.83 },
  { rotation: 90, opacity: 0.73 },
  { rotation: 120, opacity: 0.63 },
  { rotation: 150, opacity: 0.53 },
  { rotation: 180, opacity: 0.43 },
  { rotation: 210, opacity: 0.33 },
  { rotation: 240, opacity: 0.25 },
  { rotation: 270, opacity: 0.2 },
  { rotation: 300, opacity: 0.15 },
  { rotation: 330, opacity: 0.1 },
] as const;

export const LoadingSpinner = ({
  size = "md",
  variant = "default",
  className,
}: {
  size?: FormInputSize;
  variant?: LoadingSpinnerVariant;
  className?: string;
}) => {
  const gradientId = useId();

  if (variant === "bars") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={cx(styles({ size, variant: "bars" }), className)}
      >
        {spokes.map((spoke) => (
          <rect
            key={spoke.rotation}
            x={11}
            y={2}
            width={2}
            height={6}
            rx={1}
            fill="currentColor"
            opacity={spoke.opacity}
            transform={`rotate(${spoke.rotation} 12 12)`}
          />
        ))}
      </svg>
    );
  }

  const bg = "color-mix(in oklab, currentColor, transparent 85%)";

  return (
    <svg
      viewBox="0 0 56 56"
      className={cx(styles({ size, variant: "default" }), className)}
    >
      <path
        d="M56 28C56 43.464 43.464 56 28 56C12.536 56 0 43.464 0 28C0 12.536 12.536 0 28 0C43.464 0 56 12.536 56 28ZM11.2 28C11.2 37.2784 18.7216 44.8 28 44.8C37.2784 44.8 44.8 37.2784 44.8 28C44.8 18.7216 37.2784 11.2 28 11.2C18.7216 11.2 11.2 18.7216 11.2 28Z"
        fill={bg}
      />
      <path
        d="M50.4 28C53.4928 28 56.0563 30.5317 55.4419 33.5629C54.6488 37.4748 53.0239 41.1939 50.6525 44.458C47.1769 49.2417 42.2761 52.8024 36.6525 54.6296C31.0289 56.4568 24.9711 56.4568 19.3475 54.6296C15.5104 53.3828 12.0098 51.329 9.06882 48.6304C6.79004 46.5393 7.37589 42.9843 9.87802 41.1664C12.3801 39.3485 15.8512 40.0088 18.3877 41.7784C19.7367 42.7195 21.2248 43.4632 22.8085 43.9777C26.1827 45.0741 29.8173 45.0741 33.1915 43.9777C36.5657 42.8814 39.5061 40.745 41.5915 37.8748C42.5703 36.5276 43.3371 35.0513 43.8752 33.497C44.8872 30.5744 47.3072 28 50.4 28Z"
        fill={`url(#${gradientId})`}
      />

      <defs>
        <linearGradient
          id={gradientId}
          x1="33.069"
          y1="51.1724"
          x2="52.1379"
          y2="28.9655"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="currentColor" stopOpacity={0} />
          <stop offset="1" stopColor="currentColor" />
        </linearGradient>
      </defs>
    </svg>
  );
};
