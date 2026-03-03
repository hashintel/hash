import figma from "@figma/code-connect";

import { RadioGroup } from "../radio-group";

/**
 * RadioGroup - Default variant
 * Simple radio buttons with labels
 */
figma.connect(
  RadioGroup,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=18731-77299",
  {
    props: {
      variant: figma.enum("type", {
        default: "default",
        card: "card",
      }),
      disabled: figma.enum("_state", {
        disabled: true,
      }),
      // Map the number of items to options array
      options: figma.children("*"),
    },
    example: (props) => (
      <RadioGroup
        variant={props.variant}
        disabled={props.disabled}
        options={[
          { value: "option1", label: "Option 1" },
          { value: "option2", label: "Option 2" },
          { value: "option3", label: "Option 3" },
        ]}
        defaultValue="option1"
      />
    ),
  },
);

/**
 * RadioGroup - Card variant
 * Full card layout with optional icons and descriptions
 */
figma.connect(
  RadioGroup,
  "https://www.figma.com/design/WmnosvOvi4Blw0HK0jh1mG/Design-System?node-id=18731-77413",
  {
    props: {
      variant: figma.enum("type", {
        default: "default",
        card: "card",
      }),
      disabled: figma.enum("_state", {
        disabled: true,
      }),
    },
    example: (props) => (
      <RadioGroup
        variant="card"
        disabled={props.disabled}
        options={[
          {
            value: "basic",
            label: "Basic",
            description: "For simple applications",
          },
          {
            value: "pro",
            label: "Pro",
            description: "For professional use",
          },
        ]}
        defaultValue="basic"
      />
    ),
  },
);
