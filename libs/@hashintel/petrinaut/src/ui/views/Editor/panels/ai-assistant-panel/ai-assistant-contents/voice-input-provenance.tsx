import { css } from "@hashintel/ds-helpers/css";

import type { VoiceBrief } from "./get-message-render-items";

/** The prepared brief is optional; ordinary spoken messages carry no marker. */
export const VoiceInputProvenance = ({ brief }: { brief: VoiceBrief }) => (
  <details
    className={css({
      alignSelf: "flex-end",
      maxWidth: "[92%]",
      fontSize: "xs",
      color: "neutral.s90",
    })}
    aria-busy={brief.state === "streaming"}
  >
    <summary className={css({ cursor: "pointer", textAlign: "right" })}>
      Sent to Brunch
    </summary>
    <div
      className={css({
        backgroundColor: "neutral.a10",
        borderRadius: "lg",
        padding: "3",
        marginTop: "2",
      })}
    >
      <p>Prepared from what you said</p>
      <dl
        className={css({
          display: "grid",
          gridTemplateColumns: "[auto 1fr]",
          gap: "2",
          marginTop: "2",
          "& dd": { margin: "0", overflowWrap: "anywhere" },
        })}
      >
        {Object.entries(brief.fields).map(([field, value]) => (
          <div key={field} className={css({ display: "contents" })}>
            <dt>{field.replace(/([A-Z])/gu, " $1")}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  </details>
);
