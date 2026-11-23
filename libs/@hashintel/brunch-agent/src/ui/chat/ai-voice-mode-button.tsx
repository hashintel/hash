import { Button } from "@hashintel/ds-components";
import { useHashIconPackEnabled } from "@hashintel/ds-icons";
import { StaticHashIcon } from "@hashintel/ds-icons/static";
import { VoiceIcon } from "@hashintel/petrinaut/ui";

type AiVoiceModeButtonProps = {
  className?: string;
  onClick: () => void;
  size: "sm" | "lg";
};

/** Brunch's Voice mode mark, from the icon pack while the editor uses it. */
export const AiVoiceModeIcon = ({ size = 16 }: { size?: number }) => {
  const experimentalIcons = useHashIconPackEnabled();
  if (experimentalIcons) {
    return <VoiceIcon size={size} />;
  }
  return (
    <StaticHashIcon
      aria-hidden="true"
      fill="none"
      height={size}
      width={size}
      name="signal"
    />
  );
};

/** Starts Brunch's Voice mode. */
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
