import figma from "@figma/code-connect";

import { Avatar } from "../avatar";

/**
 * Avatar Component
 * Supports all combinations of type (image/initials/icon), size, and shape
 */
figma.connect(
  Avatar,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=1546-81262",
  {
    props: {
      type: figma.enum("_type", {
        image: "image",
        initals: "initials",
        icon: "icon",
      }),
      size: figma.enum("size", {
        "16": "16",
        "20": "20",
        "24": "24",
        "32": "32",
        "40": "40",
        "48": "48",
        "64": "64",
      }),
      shape: figma.enum("shape", {
        circle: "circle",
        square: "square",
      }),
      initials: figma.string("initials"),
      indicatorColorScheme: figma.enum("indicator/colorScheme", {
        red: "red",
        orange: "orange",
        yellow: "yellow",
        green: "green",
        blue: "blue",
        purple: "purple",
        pink: "pink",
        gray: "gray",
        white: "white",
      }),
      indicatorSquared: figma.boolean("indicator/_isCompany"),
      showIndicator: figma.boolean("showIndicator"),
    },
    example: (props) => {
      const getFallback = () => {
        if (props.type === "initials") {
          return props.initials;
        }
        if (props.type === "icon") {
          return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="8" r="4" strokeWidth="2" />
              <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" strokeWidth="2" />
            </svg>
          );
        }
        return undefined;
      };

      return (
        <Avatar
          src={props.type === "image" ? "https://i.pravatar.cc/300" : undefined}
          alt="User avatar"
          fallback={getFallback()}
          size={props.size}
          shape={props.shape}
          indicator={
            props.showIndicator
              ? {
                  colorScheme: props.indicatorColorScheme,
                  squared: props.indicatorSquared,
                }
              : undefined
          }
        />
      );
    },
  },
);
