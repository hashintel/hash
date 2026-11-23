/**
 * Loading state (DES-252): faint grey bars where text will be, drawn in Figma J0.1a, J0.3a and J6.11b. It shows only
 * with `?loading=1`; nothing in the prototype is actually slow.
 */
import { css } from "@hashintel/ds-helpers/css";

export const loadingOn =
  new URLSearchParams(globalThis.location.search).get("loading") === "1";

const barStyle = css({
  display: "block",
  flexShrink: 0,
  borderRadius: "full",
  backgroundColor: "neutral.bgSolid.surface.active",
});

/** One grey bar standing in for a line of text. */
export const GreyBar = ({
  width,
  height = 8,
}: {
  width: number | string;
  height?: number;
}) => (
  <span
    aria-hidden
    data-loading-bar
    className={barStyle}
    style={{ width, height }}
  />
);

/** A grey rounded square standing in for a step tile. */
export const GreyTile = ({ size = 20 }: { size?: number }) => (
  <span
    aria-hidden
    data-loading-bar
    className={css({
      display: "block",
      flexShrink: 0,
      backgroundColor: "neutral.bgSolid.surface.active",
    })}
    style={{ width: size, height: size, borderRadius: size > 24 ? 8 : 6 }}
  />
);

/** A step row: a tile and one bar, as the Steps list draws it while it loads. */
export const LoadingStepRows = ({ widths }: { widths: number[] }) => (
  <div
    data-loading-steps
    className={css({
      display: "flex",
      flexDirection: "column",
      gap: "3",
      paddingX: "4",
      paddingTop: "5",
    })}
  >
    {widths.map((width) => (
      <div
        key={width}
        className={css({ display: "flex", alignItems: "center", gap: "2" })}
      >
        <GreyTile />
        <GreyBar width={width} />
      </div>
    ))}
  </div>
);

/** A canvas card as grey blocks: a 32 px tile and two bars. */
export const LoadingCard = ({ dashed }: { dashed?: boolean }) => (
  <div
    data-loading-card
    className={css({
      display: "flex",
      alignItems: "center",
      gap: "2",
      width: "[200px]",
      height: "[62px]",
      paddingX: "3",
      backgroundColor: "neutral.bgSolid.min",
      borderWidth: "thin",
      borderStyle: dashed ? "dashed" : "solid",
      borderColor: "neutral.bd.subtle",
      borderRadius: "lg",
    })}
  >
    <GreyTile size={32} />
    <div className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
      <GreyBar width={72} />
      <GreyBar width={48} height={6} />
    </div>
  </div>
);

/** Hides what a list or canvas would show once loaded; its children stay mounted behind. */
const hideLoadedStyle = `[data-canvas-area] .react-flow__node,[data-canvas-area] .react-flow__edge,[data-canvas-area] .react-flow__minimap{visibility:hidden !important}`;

/** A left panel that loads: its header stays, the list under it becomes grey step rows. */
export const LoadingMask = ({
  children,
}: {
  children: React.ReactNode;
  list?: boolean;
}) =>
  loadingOn ? (
    <div className={css({ position: "relative", display: "flex" })}>
      {children}
      <div
        data-loading-mask
        className={css({
          position: "absolute",
          top: "[41px]",
          left: "0",
          right: "0",
          bottom: "0",
          backgroundColor: "neutral.bgSolid.min",
        })}
      >
        <LoadingStepRows widths={[110, 80, 125]} />
      </div>
    </div>
  ) : (
    <>{children}</>
  );

/** The canvas while it loads: three dashed trigger cards wired into one card, all grey (Figma J0.3a). */
export const LoadingCanvas = () => (
  <div
    data-loading-canvas
    className={css({
      position: "absolute",
      inset: "0",
      zIndex: "[1]",
      pointerEvents: "none",
    })}
  >
    <style>{hideLoadedStyle}</style>
    <svg
      aria-hidden
      className={css({ position: "absolute", inset: "0", width: "[100%]", height: "[100%]" })}
    >
      {[190, 264, 338].map((y) => (
        <path
          key={y}
          d={`M 300 ${y + 31} C 350 ${y + 31}, 350 295, 400 295`}
          fill="none"
          stroke="var(--colors-neutral-bd-subtle)"
          strokeWidth={1.25}
        />
      ))}
    </svg>
    <div className={css({ position: "absolute" })} style={{ left: 100, top: 190 }}>
      <LoadingCard dashed />
    </div>
    <div className={css({ position: "absolute" })} style={{ left: 100, top: 264 }}>
      <LoadingCard dashed />
    </div>
    <div className={css({ position: "absolute" })} style={{ left: 100, top: 338 }}>
      <LoadingCard dashed />
    </div>
    <div className={css({ position: "absolute" })} style={{ left: 400, top: 264 }}>
      <LoadingCard />
    </div>
  </div>
);
