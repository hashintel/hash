import figma from "@figma/code-connect";

import { Badge } from "../badge";

/**
 * Code Connect mapping for the Badge component.
 * Maps Figma properties to React component props.
 */

figma.connect(
  Badge,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=12301:43194",
  {
    props: {
      colorScheme: figma.enum("colorScheme", {
        gray: "gray",
        brand: "brand",
        green: "green",
        orange: "orange",
        red: "red",
        purple: "purple",
        pink: "pink",
        yellow: "yellow",
      }),
      size: figma.enum("size", {
        xs: "xs",
        sm: "sm",
        md: "md",
        lg: "lg",
      }),
      isSquare: figma.enum("isSquare", {
        true: true,
        false: false,
      }),
      children: figma.string("children"),
      iconLeft: figma.instance("iconLeft"),
      iconRight: figma.instance("iconRight"),
    },
    example: (props) => (
      <Badge
        colorScheme={props.colorScheme}
        size={props.size}
        isSquare={props.isSquare}
        iconLeft={props.iconLeft}
        iconRight={props.iconRight}
      >
        {props.children}
      </Badge>
    ),
  },
);
