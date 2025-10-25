import figma from "@figma/code-connect";

import { Avatar } from "./avatar";

/**
 * Avatar - Image with Circle Shape
 */
figma.connect(
  Avatar,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=1546-81262",
  {
    props: {
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
    },
    example: (props) => (
      <Avatar
        src="https://i.pravatar.cc/300"
        alt="User avatar"
        size={props.size}
        shape={props.shape}
      />
    ),
  }
);

/**
 * Avatar - Initials with Circle Shape
 */
figma.connect(
  Avatar,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=18024-20544",
  {
    props: {
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
    },
    example: (props) => (
      <Avatar fallback={props.initials} size={props.size} shape={props.shape} />
    ),
  }
);

/**
 * Avatar - Icon with Circle Shape
 */
figma.connect(
  Avatar,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=1546-81266",
  {
    props: {
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
    },
    example: (props) => (
      <Avatar
        fallback={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="8" r="4" strokeWidth="2" />
            <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" strokeWidth="2" />
          </svg>
        }
        size={props.size}
        shape={props.shape}
      />
    ),
  }
);

/**
 * Avatar - Image with Square Shape
 */
figma.connect(
  Avatar,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=20346-30448",
  {
    props: {
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
    },
    example: (props) => (
      <Avatar
        src="https://i.pravatar.cc/300"
        alt="User avatar"
        size={props.size}
        shape="square"
      />
    ),
  }
);
