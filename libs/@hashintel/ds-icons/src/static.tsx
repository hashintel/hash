import { useId } from "react";

import artwork from "./static/artwork.json";

import type { HashIconName, HashIconVariant } from "./hash-icon";
import type { CSSProperties, SVGProps } from "react";

export type { HashIconName, HashIconVariant } from "./hash-icon";

export type StaticHashIconProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> & {
  name: HashIconName;
  variant?: HashIconVariant;
  weight?: number;
  size?: number | string;
};

const drawings = artwork as Record<
  HashIconName,
  Record<HashIconVariant, string>
>;

export const getHashIconArtwork = (
  name: HashIconName,
  variant: HashIconVariant = "outline",
  idPrefix = "hash-icon",
): string =>
  drawings[name][variant].replaceAll(
    /__HASH_ICON_ID_(\d+)__/g,
    `${idPrefix.replace(/[^a-zA-Z0-9_-]/g, "_")}-$1`,
  );

export const getHashIconStrokeWidth = (weight = 400): number =>
  0.75 +
  (Number.isFinite(weight) ? Math.min(700, Math.max(100, weight)) : 400) / 400;

export const HashIconArtwork = ({
  name,
  variant = "outline",
  weight = 400,
  strokeWidth: explicitStrokeWidth,
}: Pick<
  StaticHashIconProps,
  "name" | "variant" | "weight" | "strokeWidth"
>) => {
  const id = useId();
  const strokeWidth = explicitStrokeWidth ?? getHashIconStrokeWidth(weight);
  return (
    <g
      fill={variant === "filled" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeMiterlimit={2}
      style={
        {
          "--hash-icon-stroke-width": strokeWidth,
          "--hash-icon-dot-size": "calc(var(--hash-icon-stroke-width) * 1.25)",
          "--hash-icon-detail-stroke":
            "calc(var(--hash-icon-stroke-width) * 1.4)",
        } as CSSProperties
      }
      // Generated package artwork; only the sanitized instance ID is substituted.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: getHashIconArtwork(name, variant, id),
      }}
    />
  );
};

/** Static artwork for hosts that do not use Panda CSS or icon motion. */
export const StaticHashIcon = ({
  name,
  variant,
  weight,
  size = "1em",
  strokeWidth,
  ...props
}: StaticHashIconProps) => {
  const labelled = Boolean(props["aria-label"] || props["aria-labelledby"]);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...props}
    >
      <HashIconArtwork
        name={name}
        variant={variant}
        weight={weight}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
};
