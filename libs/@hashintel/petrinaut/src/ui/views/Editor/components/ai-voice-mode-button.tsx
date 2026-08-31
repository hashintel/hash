import { Button } from "@hashintel/ds-components";

type AiVoiceModeButtonProps = {
  className?: string;
  onClick: () => void;
  size: "sm" | "lg";
};

export const AiVoiceModeIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    aria-hidden="true"
    fill="none"
    height={size}
    viewBox="0 0 20 20"
    width={size}
  >
    <path
      d="M3 8.5v3M6.5 5.5v9M10 3v14M13.5 6v8M17 8.5v3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
    />
  </svg>
);

export const AiVoiceModeButton = ({
  className,
  onClick,
  size,
}: AiVoiceModeButtonProps) => (
  <Button
    aria-label="Start voice mode"
    className={className}
    onClick={onClick}
    prefix={<AiVoiceModeIcon size={size === "lg" ? 20 : 16} />}
    size={size}
    tone="brand"
    tooltip="Start voice mode"
    type="button"
    variant="solid"
  />
);
