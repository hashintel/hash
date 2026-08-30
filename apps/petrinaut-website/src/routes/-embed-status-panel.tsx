import { css } from "@hashintel/ds-helpers/css";

// This panel replaces the embed when there is no Petrinaut to render, so it
// sits outside `.petrinaut-root`, where the design-system tokens are declared
// (`cssVarRoot` in `scopedThemeConfig`). Token values would not resolve, so
// these are literals, matching the site's own not-found page.
const panelStyle = css({
  display: "flex",
  width: "[100%]",
  height: "[100%]",
  alignItems: "center",
  justifyContent: "center",
  padding: "[24px]",
  backgroundColor: "[#f6f7f8]",
  fontFamily: "[Inter, system-ui, sans-serif]",
  textAlign: "center",
});

const titleStyle = css({
  color: "[#1f2933]",
  fontSize: "[14px]",
  fontWeight: "[600]",
});

const bodyStyle = css({
  marginTop: "[4px]",
  color: "[#4b5563]",
  fontSize: "[12px]",
});

/**
 * Fallback for the embed route, sized for a frame rather than a page. The
 * embed renders inside someone else's layout, so a failure stays small and
 * carries no link: a link here would navigate the frame to this site.
 */
export const EmbedStatusPanel = ({
  body,
  title,
}: {
  body: string;
  title: string;
}) => (
  <div className={panelStyle}>
    <div>
      <p className={titleStyle}>{title}</p>
      <p className={bodyStyle}>{body}</p>
    </div>
  </div>
);
