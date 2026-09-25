import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { VoiceBrief } from "./get-message-render-items";

/** A quiet, right-aligned disclosure beneath the original spoken words. */
export const VoiceInputProvenance = ({ brief }: { brief: VoiceBrief }) => (
  <details
    className={css({
      alignSelf: "stretch",
      maxWidth: "full",
      fontSize: "xs",
      color: "neutral.s80",
      "&[open] > summary [data-chevron]": { transform: "[rotate(90deg)]" },
    })}
    aria-busy={brief.state === "streaming"}
  >
    <summary
      className={css({
        display: "flex",
        width: "[fit-content]",
        alignItems: "center",
        marginLeft: "auto",
        marginRight: "[-2px]",
        padding: "[2px 6px 2px 2px]",
        borderRadius: "md",
        gap: "0.5",
        cursor: "pointer",
        textAlign: "right",
        listStyleType: "none",
        _hover: { backgroundColor: "neutral.a20", color: "neutral.s100" },
        _focusVisible: { outline: "[2px solid {colors.blue.s90}]" },
        "&::-webkit-details-marker": { display: "none" },
        "& [data-chevron]": { transition: "[transform 150ms ease]" },
      })}
    >
      <span
        className={css({
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "[16px]",
          height: "[16px]",
          marginRight: "1",
        })}
      >
        <Icon name="sparkles" size="xs" />
      </span>
      {brief.state === "streaming"
        ? Object.keys(brief.fields).length === 0
          ? "Preparing for Brunch"
          : "Sending to Brunch"
        : "Sent to Brunch"}
      <Icon name="chevronRight" size="xs" data-chevron />
    </summary>
    <div
      className={css({
        textAlign: "right",
      })}
    >
      <p className={css({ margin: "[4px 0 6px]", fontSize: "[11px]" })}>
        {brief.state === "streaming" && Object.keys(brief.fields).length === 0
          ? "Preparing from what you said"
          : "Prepared from what you said"}
      </p>
      <dl
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "1.5",
          margin: "[0 5px 4px 0]",
          paddingRight: "3",
          fontSize: "[13px]",
          lineHeight: "[1.45]",
          borderRight: "[2px solid {colors.neutral.a30}]",
          "& > div": { display: "flex", flexDirection: "column", gap: "[1px]" },
          "& dt": {
            color: "neutral.s80",
            fontSize: "[11px]",
            fontWeight: "semibold",
            letterSpacing: "[0.02em]",
            textTransform: "uppercase",
          },
          "& dd": {
            margin: "0",
            color: "neutral.s90",
            overflowWrap: "anywhere",
          },
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
