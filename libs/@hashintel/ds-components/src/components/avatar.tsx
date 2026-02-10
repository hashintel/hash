import { Avatar as BaseAvatar } from "@ark-ui/react/avatar";
import { css, cva } from "@hashintel/ds-helpers/css";
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
  /** Indicator configuration */
  indicator?: {
    /** Color scheme of the indicator */
    colorScheme?:
      | "red"
      | "orange"
      | "yellow"
      | "green"
      | "blue"
      | "purple"
      | "pink"
      | "gray"
      | "white";
    /** Whether the indicator is squared (with border and rounded corners) */
    squared?: boolean;
    /** Optional image to display in the indicator */
    image?: string;
  };
  /** Callback when image loading status changes */
  onStatusChange?: (details: {
    status: "error" | "loaded" | "loading";
  }) => void;
  /** ID for the avatar */
  id?: string;
}

const avatarRootRecipe = cva({
  base: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    backgroundColor: "bd.muted",
    border: "1px solid",
    borderColor: "bd.subtle",
    overflow: "hidden",
  },
  variants: {
    size: {
      "16": {
        width: "[16px]",
        height: "[16px]",
      },
      "20": {
        width: "[20px]",
        height: "[20px]",
      },
      "24": {
        width: "[24px]",
        height: "[24px]",
      },
      "32": {
        width: "[32px]",
        height: "[32px]",
      },
      "40": {
        width: "[40px]",
        height: "[40px]",
      },
      "48": {
        width: "[48px]",
        height: "[48px]",
      },
      "64": {
        width: "[64px]",
        height: "[64px]",
      },
    },
    shape: {
      circle: {
        borderRadius: "full",
      },
      square: {},
    },
  },
  compoundVariants: [
    // Square border radius by size
    { shape: "square", size: "16", css: { borderRadius: "sm" } },
    { shape: "square", size: "20", css: { borderRadius: "sm" } },
    { shape: "square", size: "24", css: { borderRadius: "md" } },
    { shape: "square", size: "32", css: { borderRadius: "md" } },
    { shape: "square", size: "40", css: { borderRadius: "lg" } },
    { shape: "square", size: "48", css: { borderRadius: "xl" } },
    { shape: "square", size: "64", css: { borderRadius: "2xl" } },
  ],
  defaultVariants: {
    size: "32",
    shape: "circle",
  },
});

const avatarImageRecipe = cva({
  base: {
    position: "absolute",
    inset: "[0]",
    width: "[100%]",
    height: "[100%]",
    objectFit: "cover",
    objectPosition: "center",
  },
});

const avatarFallbackRecipe = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "[100%]",
    height: "[100%]",
    fontWeight: "medium",
    color: "fg",
    textAlign: "center",
  },
  variants: {
    size: {
      "16": {
        fontSize: "[7px]",
        "& svg": {
          width: "[10px]",
          height: "[10px]",
        },
      },
      "20": {
        fontSize: "[8px]",
        "& svg": {
          width: "[10px]",
          height: "[10px]",
        },
      },
      "24": {
        fontSize: "[10px]",
        "& svg": {
          width: "[12px]",
          height: "[12px]",
        },
      },
      "32": {
        fontSize: "[14px]",
        "& svg": {
          width: "[18px]",
          height: "[18px]",
        },
      },
      "40": {
        fontSize: "[18px]",
        "& svg": {
          width: "[24px]",
          height: "[24px]",
        },
      },
      "48": {
        fontSize: "[20px]",
        "& svg": {
          width: "[28px]",
          height: "[28px]",
        },
      },
      "64": {
        fontSize: "[24px]",
        "& svg": {
          width: "[32px]",
          height: "[32px]",
        },
      },
    },
  },
  defaultVariants: {
    size: "32",
  },
});

const avatarIndicatorRootRecipe = cva({
  base: {
    position: "absolute",
    bottom: "[-2px]",
    right: "[-2px]",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    overflow: "hidden",
  },
  variants: {
    size: {
      "16": {
        width: "[8px]",
        height: "[8px]",
      },
      "20": {
        width: "[8px]",
        height: "[8px]",
      },
      "24": {
        width: "[12px]",
        height: "[12px]",
      },
      "32": {
        width: "[12px]",
        height: "[12px]",
      },
      "40": {
        width: "[16px]",
        height: "[16px]",
      },
      "48": {
        width: "[16px]",
        height: "[16px]",
      },
      "64": {
        width: "[20px]",
        height: "[20px]",
      },
    },
    colorScheme: {
      red: {
        backgroundColor: "red.s50",
      },
      orange: {
        backgroundColor: "orange.s50",
      },
      yellow: {
        backgroundColor: "yellow.s50",
      },
      green: {
        backgroundColor: "green.s50",
      },
      blue: {
        backgroundColor: "blue.s50",
      },
      purple: {
        backgroundColor: "purple.s50",
      },
      pink: {
        backgroundColor: "pink.s50",
      },
      gray: {
        backgroundColor: "neutral.s50",
      },
      white: {
        backgroundColor: "bg.surface",
      },
    },
    squared: {
      true: {},
      false: {
        borderRadius: "full",
      },
    },
  },
  compoundVariants: [
    // Squared indicators with border and radius by size
    {
      squared: true,
      size: "16",
      css: {
        border: "1px solid",
        borderColor: "bd.solid",
        borderRadius: "xs",
      },
    },
    {
      squared: true,
      size: "20",
      css: {
        border: "1px solid",
        borderColor: "bd.solid",
        borderRadius: "xs",
      },
    },
    {
      squared: true,
      size: "24",
      css: {
        border: "1px solid",
        borderColor: "bd.solid",
        borderRadius: "xs",
      },
    },
    {
      squared: true,
      size: "32",
      css: {
        border: "1px solid",
        borderColor: "bd.solid",
        borderRadius: "xs",
      },
    },
    {
      squared: true,
      size: "40",
      css: {
        border: "1px solid",
        borderColor: "bd.solid",
        borderRadius: "sm",
      },
    },
    {
      squared: true,
      size: "48",
      css: {
        border: "1px solid",
        borderColor: "bd.solid",
        borderRadius: "sm",
      },
    },
    {
      squared: true,
      size: "64",
      css: {
        border: "1px solid",
        borderColor: "bd.solid",
        borderRadius: "md",
      },
    },
  ],
  defaultVariants: {
    size: "32",
    colorScheme: "green",
    squared: false,
  },
});

const avatarIndicatorImageRecipe = cva({
  base: {
    position: "absolute",
    inset: "[0]",
    width: "[100%]",
    height: "[100%]",
    objectFit: "cover",
    objectPosition: "center",
  },
});

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = "avatar",
  fallback = "?",
  size = "32",
  shape = "circle",
  indicator,
  onStatusChange,
  id,
}) => {
  return (
    <div className={css({ position: "relative", display: "inline-flex" })}>
      <BaseAvatar.Root
        onStatusChange={onStatusChange}
        id={id}
        className={avatarRootRecipe({ size, shape })}
      >
        <BaseAvatar.Image src={src} alt={alt} className={avatarImageRecipe()} />
        <BaseAvatar.Fallback className={avatarFallbackRecipe({ size })}>
          {fallback}
        </BaseAvatar.Fallback>
      </BaseAvatar.Root>
      {indicator && (
        <BaseAvatar.Root
          className={avatarIndicatorRootRecipe({
            size,
            colorScheme: indicator.colorScheme ?? "green",
            squared: indicator.squared ?? false,
          })}
        >
          {indicator.image && (
            <BaseAvatar.Image
              src={indicator.image}
              className={avatarIndicatorImageRecipe()}
            />
          )}
        </BaseAvatar.Root>
      )}
    </div>
  );
};
