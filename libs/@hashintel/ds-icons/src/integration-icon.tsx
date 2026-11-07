import { useId } from "react";

import { AppTileDark, AppTileLight } from "./integration-icon/app-tile";
import { integrationGeometry } from "./integration-icon/geometry";

import type {
  IntegrationIconName,
  IntegrationIconVariant,
} from "./integration-icon-catalog";
import type { SVGProps } from "react";

export type IntegrationIconProps = Omit<
  SVGProps<SVGSVGElement>,
  "name" | "children"
> & {
  name: IntegrationIconName;
  variant?: IntegrationIconVariant;
  size?: number;
  title?: string;
};

export const IntegrationIcon = ({
  name,
  variant = "mark-mono",
  size = 24,
  title,
  color,
  fill,
  ...props
}: IntegrationIconProps) => {
  const id = useId();
  const artwork = integrationGeometry[name];
  const logo = variant.startsWith("logo");
  const wordmark = variant.startsWith("wordmark");
  const wide = logo || wordmark;
  const dark = variant.endsWith("dark");
  const mono = variant.includes("mono");
  const app = variant.startsWith("app");
  const Tile = dark ? AppTileDark : AppTileLight;
  const Geometry = wordmark
    ? dark
      ? artwork.wordmarkDark
      : artwork.wordmarkLight
    : logo
      ? dark
        ? artwork.logoDark
        : artwork.logoLight
      : mono
        ? (artwork.markMono ?? artwork.markLight)
        : dark
          ? artwork.markDark
          : artwork.markLight;

  if (!Geometry) {
    throw new Error(
      `The ${name} integration has no verified ${wordmark ? "wordmark" : "full-logo"} artwork.`,
    );
  }

  const sourceViewBox =
    (wordmark
      ? dark
        ? artwork.wordmarkDarkViewBox
        : artwork.wordmarkViewBox
      : logo
        ? artwork.logoViewBox
        : null) ?? "0 0 64 64";
  const [, , width = 64, height = 64] = sourceViewBox
    .split(/[, ]+/)
    .map(Number);
  const viewBox = `0 0 ${width} ${height}`;
  const markSize = app ? 64 / artwork.ratio : 64;
  const labelled = Boolean(
    title ?? props["aria-label"] ?? props["aria-labelledby"],
  );

  return (
    <svg
      width={wide ? (size * width) / height : size}
      height={size}
      viewBox={viewBox}
      fill="none"
      color={
        color ??
        fill ??
        (app
          ? mono
            ? dark
              ? "#FFFFFF"
              : "#000000"
            : dark
              ? "#CBD5E1"
              : "#374151"
          : undefined)
      }
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
      aria-labelledby={title ? `${id}-title` : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title id={`${id}-title`}>{title}</title> : null}
      {mono ? (
        <defs>
          <filter
            id={`${id}-mono`}
            x="-5%"
            y="-5%"
            width="110%"
            height="110%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values={artwork.monoAlphaMatrix}
              result="tones"
            />
            <feComposite in="tones" in2="SourceAlpha" operator="in" />
            <feComponentTransfer result="coverage">
              <feFuncA type="linear" slope={artwork.monoInkScale} />
            </feComponentTransfer>
            <feFlood floodColor="currentColor" />
            <feComposite in2="coverage" operator="in" />
          </filter>
        </defs>
      ) : null}
      {app ? (
        <defs>
          <clipPath id={`${id}-tile`}>
            <rect x={0.5} y={0.5} width={63} height={63} rx={10} />
          </clipPath>
        </defs>
      ) : null}
      {app ? <Tile id={`${id}-tile-background`} /> : null}
      <g
        filter={mono ? `url(#${id}-mono)` : undefined}
        clipPath={app ? `url(#${id}-tile)` : undefined}
      >
        {wide ? (
          <Geometry id={`${id}-${wordmark ? "wordmark" : "logo"}`} />
        ) : (
          <svg
            color={mono ? "black" : undefined}
            x={app && artwork.alignment === "start" ? 0 : (64 - markSize) / 2}
            y={(64 - markSize) / 2}
            width={markSize}
            height={markSize}
            viewBox={
              app
                ? (artwork.appViewBox ?? artwork.markViewBox)
                : artwork.markViewBox
            }
          >
            <Geometry id={`${id}-mark`} />
          </svg>
        )}
      </g>
    </svg>
  );
};
