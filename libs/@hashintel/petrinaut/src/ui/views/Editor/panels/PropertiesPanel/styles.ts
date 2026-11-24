import { css } from "@hashintel/ds-helpers/css";

/** The fields a properties panel opens with: name, description and the like. */
export const fieldsSectionStyle = css({
  paddingY: "3",
});

/** A section whose code editor takes the height the section has. */
export const codeSectionStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

/** A panel's title where it is the selected item's own name. */
export const itemTitleStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  lineHeight: "[1.2]",
});
