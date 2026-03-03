import figma from "@figma/code-connect";

import { Button } from "../button";

/**
 * Code Connect mapping for Button component
 * Maps Figma properties to React component props
 */

figma.connect(
  Button,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=198%3A41491",
  {
    props: {
      variant: figma.enum("variant", {
        primary: "primary",
        secondary: "secondary",
        ghost: "ghost",
      }),
      size: figma.enum("size", {
        "xs (24px)": "xs",
        "sm (28px)": "sm",
        "md (32px)": "md",
        "lg (40px)": "lg",
      }),
      colorScheme: figma.enum("colorScheme", {
        neutral: "neutral",
        brand: "brand",
        critical: "critical",
      }),
      disabled: figma.enum("_state", {
        disabled: true,
      }),
      isLoading: figma.enum("_state", {
        loading: true,
      }),
      children: figma.string("children"),
      iconLeft: figma.boolean("_showIconLeft", {
        true: figma.instance("iconLeft"),
        false: undefined,
      }),
      iconRight: figma.boolean("_showIconRight", {
        true: figma.instance("iconRight"),
        false: undefined,
      }),
    },
    example: ({
      variant,
      size,
      colorScheme,
      disabled,
      isLoading,
      children,
      iconLeft,
      iconRight,
    }) => (
      <Button
        variant={variant}
        size={size}
        colorScheme={colorScheme}
        disabled={disabled}
        isLoading={isLoading}
        iconLeft={iconLeft}
        iconRight={iconRight}
      >
        {children}
      </Button>
    ),
  },
);
