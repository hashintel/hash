import { svgIconBaseCss, svgIconClassName } from "./define-icon";
import { svgIcons } from "./icons";

import type { SvgIconNode } from "./define-icon";
import type { SvgIconName } from "./icons";
import type { CSSProperties, SVGProps } from "react";

const toReactProps = (attributes: SvgIconNode[1]) =>
  Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key.startsWith("data-") || key.startsWith("aria-")
        ? key
        : key.replace(/-([a-z])/g, (_match, letter: string) =>
            letter.toUpperCase(),
          ),
      value,
    ]),
  );

const renderNode = (node: SvgIconNode, key: number) => {
  const [Tag, attributes, children] = node;
  return (
    <Tag key={key} {...toReactProps(attributes)}>
      {children?.map(renderNode)}
    </Tag>
  );
};

export type SvgIconProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> & {
  name: SvgIconName;
  variant?: "outline" | "filled";
  /** Overrides the `--ds-icon-size` from the context. Defaults to `1em`. */
  size?: number | string;
  /** Overrides the `--ds-icon-weight` from the context. 100 to 700. */
  weight?: number;
  /** Progress value from 0 to 1. Each icon defines what it shows. */
  progress?: number;
  /** Plays the one-shot animation each time this number changes. */
  trigger?: number;
  /** Loops the icon's animation while true. */
  active?: boolean;
  /** Motion duration in milliseconds. */
  duration?: number;
};

/**
 * Renders an icon from the same source as its SVG file. React only sets the
 * inputs; the icon's CSS runs all motion.
 */
export const SvgIcon = ({
  name,
  variant = "outline",
  size,
  weight,
  progress,
  trigger,
  active = false,
  duration,
  className,
  style,
  ...props
}: SvgIconProps) => {
  const { nodes, css } = svgIcons[name];
  const labelled = Boolean(props["aria-label"] || props["aria-labelledby"]);
  const inputs: Record<string, string | number> = {};
  if (size !== undefined)
    inputs["--ds-icon-size"] = typeof size === "number" ? `${size}px` : size;
  if (weight !== undefined)
    inputs["--ds-icon-weight"] = Math.min(700, Math.max(100, weight));
  if (progress !== undefined)
    inputs["--ds-icon-progress"] = Math.min(1, Math.max(0, progress));
  if (duration !== undefined) inputs["--ds-icon-duration"] = `${duration}ms`;

  return (
    <>
      <style href="ds-icon-base" precedence="ds-icons">
        {svgIconBaseCss}
      </style>
      <style href={`ds-icon-${name}`} precedence="ds-icons">
        {css}
      </style>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        role={labelled ? "img" : undefined}
        aria-hidden={labelled ? undefined : true}
        focusable="false"
        {...props}
        className={[svgIconClassName(name), className]
          .filter(Boolean)
          .join(" ")}
        style={{ ...inputs, ...style } as CSSProperties}
        data-variant={variant === "filled" ? "filled" : undefined}
        data-run={trigger ? (trigger % 2 ? "odd" : "even") : undefined}
        data-active={active ? "" : undefined}
      >
        {nodes.map(renderNode)}
      </svg>
    </>
  );
};
