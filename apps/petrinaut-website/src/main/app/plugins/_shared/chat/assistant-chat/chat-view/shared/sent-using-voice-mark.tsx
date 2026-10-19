import { css } from "@hashintel/ds-helpers/css";

import { AiVoiceModeIcon } from "../../../ai-voice-mode-icon";

export const SentUsingVoiceMark = () => (
  <span
    role="img"
    aria-label="Sent using voice"
    title="Sent using voice"
    className={css({
      display: "inline-flex",
      flexShrink: 0,
      marginTop: "[4px]",
      color: "neutral.s80",
    })}
  >
    <AiVoiceModeIcon size={12} />
  </span>
);
