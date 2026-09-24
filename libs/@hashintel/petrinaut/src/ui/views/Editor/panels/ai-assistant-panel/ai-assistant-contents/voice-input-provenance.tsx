import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { VoiceBrief } from "./get-message-render-items";

/** The prepared brief is optional; ordinary spoken messages carry no marker. */
export const VoiceInputProvenance = ({ brief }: { brief: VoiceBrief }) => (
  <details
    className={css({
      alignSelf: "flex-end",
      maxWidth: "full",
      fontSize: "xs",
      color: "neutral.s90",
      "&[open] > summary [data-chevron]": { transform: "[rotate(180deg)]" },
    })}
    aria-busy={brief.state === "streaming"}
  >
    <summary
      className={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "1",
        cursor: "pointer",
        textAlign: "right",
        listStyleType: "none",
        "&::-webkit-details-marker": { display: "none" },
        "& [data-chevron]": { transform: "[rotate(90deg)]" },
      })}
    >
      <Icon name="sparkles" size="xs" className={css({ color: "blue.s100" })} />
      Sent to Brunch
      <Icon name="chevronUp" size="xs" data-chevron />
    </summary>
    <div
      className={css({
        textAlign: "right",
        marginTop: "1",
      })}
    >
      <p>Prepared from what you said</p>
      <dl
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "1.5",
          marginTop: "2",
          paddingRight: "3",
          borderRight: "[2px solid {colors.neutral.a30}]",
          "& dt": {
            color: "neutral.s80",
            fontSize: "[11px]",
            textTransform: "uppercase",
          },
          "& dd": { margin: "0", overflowWrap: "anywhere" },
        })}
      >
        {Object.entries(brief.fields).map(([field, value]) => (
          <div key={field}>
            <dt>{field.replace(/([A-Z])/gu, " $1")}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  </details>
);
