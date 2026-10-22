import {
  VoiceIcon,
  useExperimentalIconPackEnabled,
} from "../../../experimental-icons";

/**
 * @deprecated Part of the built-in AI chat. Provide the assistant with a
 * plugin that declares `assistant`, which renders its own chat.
 */
export const AiVoiceModeIcon = ({ size = 16 }: { size?: number }) => {
  const experimentalIcons = useExperimentalIconPackEnabled();
  if (experimentalIcons) {
    return <VoiceIcon size={size} />;
  }
  return (
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
};
