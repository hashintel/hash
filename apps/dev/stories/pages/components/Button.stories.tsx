import { Button as MuiButton } from "@mui/material";
import clsx from "clsx";
import { Button as HashButton } from "../../../src/components/Button";

export default {
  title: "Components/Button",
  component: MuiButton,
  argTypes: {
    variant: {
      defaultValue: "primary",
      options: ["primary", "primarySquare", "secondary", "tertiary"],
      control: { type: "radio" },
    },
    size: {
      defaultValue: "medium",
      options: ["large", "medium"],
      control: { type: "radio" },
    },
    disabled: {
      defaultValue: false,
      control: { type: "boolean" },
    },
    hover: {
      defaultValue: false,
      control: { type: "boolean" },
    },
    focus: {
      defaultValue: false,
      control: { type: "boolean" },
    },
    children: {
      defaultValue: "Click me",
      control: { type: "text" },
    },
    icon: {
      defaultValue: null,
      options: [null, "fa"],
      control: { type: "radio" },
    },
    iconName: {
      defaultValue: "arrow-up-right-from-square",
      control: { type: "string" },
    },
  },
};

// @todo replace with actual component
const FaIcon = (_: { icon: string }) => null;

export const Button = ({
  hover = false,
  focus = false,
  icon = false,
  iconName = "",
  ...props
}: any) => (
  <HashButton
    className={clsx({
      "Button--hover": hover,
      "Button--focus": focus,
    })}
    {...(icon === "fa"
      ? {
          [icon === "start" ? "startIcon" : "endIcon"]: (
            <FaIcon icon={iconName} />
          ),
        }
      : {})}
    {...props}
  />
);
