import { useId } from "react";

import { integrationGeometry } from "./integration-icon/geometry";

import type {
  IntegrationIconName,
  IntegrationIconVariant,
} from "./integration-icon-catalog";
import type { ComponentType, SVGProps } from "react";

export type IntegrationIconProps = Omit<
  SVGProps<SVGSVGElement>,
  "name" | "children"
> & {
  name: IntegrationIconName;
  variant?: IntegrationIconVariant;
  size?: number;
  title?: string;
};

type Artwork = {
  markLight: ComponentType<{ id: string }>;
  markDark: ComponentType<{ id: string }>;
  logoLight?: ComponentType<{ id: string }>;
  logoDark?: ComponentType<{ id: string }>;
  markViewBox: string;
  logoViewBox: string | null;
  ratio: number;
  alignment: string;
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
  const artwork: Artwork = integrationGeometry[name];
  const logo = variant.startsWith("logo");
  const dark = variant.endsWith("dark");
  const mono = variant === "mark-mono";
  const app = variant.startsWith("app");
  const Geometry = logo
    ? dark
      ? artwork.logoDark
      : artwork.logoLight
    : dark
      ? artwork.markDark
      : artwork.markLight;

  if (!Geometry) {
    throw new Error(
      `The ${name} integration has no verified full-logo artwork.`,
    );
  }

  const sourceViewBox = logo
    ? (artwork.logoViewBox ?? "0 0 64 64")
    : "0 0 64 64";
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
      width={logo ? (size * width) / height : size}
      height={size}
      viewBox={viewBox}
      fill="none"
      color={
        color ?? fill ?? (app ? (dark ? "#CBD5E1" : "#374151") : undefined)
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
              values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -.13819 -.46488 -.04693 1 0"
              result="tones"
            />
            <feFlood floodColor="currentColor" />
            <feComposite in2="tones" operator="in" />
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
      {app ? (
        <rect
          x={0.5}
          y={0.5}
          width={63}
          height={63}
          rx={10}
          fill={dark ? "#1B242D" : "#FFFFFF"}
          fillOpacity={dark ? 0.72 : 0.64}
          stroke={dark ? "#FFFFFF" : "#62758A"}
          strokeOpacity={0.16}
        />
      ) : null}
      <g
        filter={mono ? `url(#${id}-mono)` : undefined}
        clipPath={app ? `url(#${id}-tile)` : undefined}
      >
        {logo ? (
          <Geometry id={`${id}-logo`} />
        ) : (
          <svg
            x={app && artwork.alignment === "start" ? 0 : (64 - markSize) / 2}
            y={(64 - markSize) / 2}
            width={markSize}
            height={markSize}
            viewBox={artwork.markViewBox}
          >
            <Geometry id={`${id}-mark`} />
          </svg>
        )}
      </g>
    </svg>
  );
};
