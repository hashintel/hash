import { css } from "@hashintel/ds-helpers/css";

/**
 * The lever glyph, on a 24 grid with round caps. Local to the controller
 * prototype: it is not part of Petricon or the design system.
 *
 * Small sizes (13 px and under) use a bolder stroke so the glyph still reads.
 */
export const LeverGlyph: React.FC<{
  size?: number;
  title?: string;
}> = ({ size = 16, title }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={size <= 13 ? 3 : 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
  >
    <path d="M4 20h16" />
    <path d="M8 20a4 4 0 0 1 8 0" />
    <path d="M12 16 16.5 7.5" />
    <circle cx="17.5" cy="5.5" r="2.5" />
  </svg>
);

/** The glyph at the sidebar's icon size, for entity rows. */
export const LeverRowIcon: React.FC<{ size: number }> = ({ size }) => (
  <LeverGlyph size={size + 1} />
);

const leverIconBoxStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[28px]",
  height: "[28px]",
  backgroundColor: "neutral.s10",
  border: "[1px solid rgba(0,0,0,0.06)]",
  color: "neutral.s110",
});

/** The classic transition's icon slot when the transition is a lever. */
export const LeverIconBox: React.FC<{ title: string }> = ({ title }) => (
  <span className={leverIconBoxStyle}>
    <LeverGlyph size={18} title={title} />
  </span>
);
