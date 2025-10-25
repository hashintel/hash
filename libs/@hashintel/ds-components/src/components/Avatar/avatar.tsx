/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import { Avatar as BaseAvatar } from "@ark-ui/react/avatar";
import { css } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

export interface AvatarProps {
  /** Image source URL */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Fallback content - typically initials or icon */
  fallback?: ReactNode;
  /** Size of the avatar */
  size?: "16" | "20" | "24" | "32" | "40" | "48" | "64";
  /** Shape of the avatar */
  shape?: "circle" | "square";
  /** Callback when image loading status changes */
  onStatusChange?: (details: {
    status: "error" | "loaded" | "loading";
  }) => void;
  /** ID for the avatar */
  id?: string;
}

// Size to font size mapping for initials
const INITIALS_FONT_SIZE: Record<string, string> = {
  "16": "[7px]",
  "20": "[8px]",
  "24": "[10px]",
  "32": "[14px]",
  "40": "[18px]",
  "48": "[20px]",
  "64": "[24px]",
};

// Size to icon size mapping
const ICON_SIZE: Record<string, string> = {
  "16": "[10px]",
  "20": "[10px]",
  "24": "[12px]",
  "32": "[18px]",
  "40": "[24px]",
  "48": "[28px]",
  "64": "[32px]",
};

// Size to border radius mapping for square shape
const SQUARE_RADIUS: Record<string, string> = {
  "16": "radius.2", // 4px
  "20": "radius.2", // 4px
  "24": "radius.3", // 6px
  "32": "radius.4", // 8px
  "40": "[10px]",
  "48": "[12px]",
  "64": "[16px]",
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = "avatar",
  fallback = "?",
  size = "32",
  shape = "circle",
  onStatusChange,
  id,
}) => {
  const isCircle = shape === "circle";

  // Get border radius
  const borderRadius = isCircle
    ? ("radius.full" as const)
    : (SQUARE_RADIUS[size] as any);

  // Get font size for initials
  const fontSize = INITIALS_FONT_SIZE[size] as any;

  // Get icon size
  const iconSize = ICON_SIZE[size] as any;

  return (
    <BaseAvatar.Root
      onStatusChange={onStatusChange}
      id={id}
      className={css({
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: "0",
        width: `[${size}px]` as any,
        height: `[${size}px]` as any,
        backgroundColor: "border.neutral.muted",
        border: "1px solid",
        borderColor: "border.neutral.subtle",
        borderRadius,
        overflow: "hidden",
      })}
    >
      <BaseAvatar.Image
        src={src}
        alt={alt}
        className={css({
          position: "absolute",
          inset: "[0]",
          width: "[100%]",
          height: "[100%]",
          objectFit: "cover",
          objectPosition: "center",
        })}
      />
      <BaseAvatar.Fallback
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "[100%]",
          height: "[100%]",
          fontSize,
          fontWeight: "medium",
          color: "text.secondary",
          textAlign: "center",

          // Handle icon fallback sizing
          "& svg": {
            width: iconSize,
            height: iconSize,
          },
        })}
      >
        {fallback}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
};
