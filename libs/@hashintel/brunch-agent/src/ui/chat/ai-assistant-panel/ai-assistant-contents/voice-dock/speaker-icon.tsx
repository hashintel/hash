import { HashIconArtwork } from "@hashintel/ds-icons/static";
/**
 * A stable speaker glyph whose slash is the only visual difference between
 * audible and muted output.
 */
export const SpeakerIcon = ({ muted = false }: { muted?: boolean }) => (
  <svg
    aria-hidden="true"
    fill="none"
    height="16"
    viewBox="0 0 24 24"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <HashIconArtwork name="speaker" />
    {muted && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.75" />}
  </svg>
);
