import { StaticHashIcon } from "@hashintel/ds-icons/static";
/**
 * A stable speaker glyph whose slash is the only visual difference between
 * audible and muted output.
 */
export const SpeakerIcon = ({ muted = false }: { muted?: boolean }) => (
  <StaticHashIcon
    aria-hidden="true"
    fill="none"
    height="16"
    width="16"
    name="speaker"
  />
);
