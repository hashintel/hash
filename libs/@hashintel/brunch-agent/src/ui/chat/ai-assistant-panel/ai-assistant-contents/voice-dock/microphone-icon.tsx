import { useHashIconPackEnabled } from "@hashintel/ds-icons";
import { StaticHashIcon } from "@hashintel/ds-icons/static";
import { MicrophoneIcon as ExperimentalMicrophoneIcon } from "@hashintel/petrinaut/ui";

export const MicrophoneIcon = ({ muted = false }: { muted?: boolean }) => {
  const experimentalIcons = useHashIconPackEnabled();
  if (experimentalIcons) {
    return (
      <ExperimentalMicrophoneIcon size={16} muted={muted} duration={200} />
    );
  }
  return (
    <StaticHashIcon
      aria-hidden="true"
      fill="none"
      height="16"
      width="16"
      name="microphone"
    />
  );
};
