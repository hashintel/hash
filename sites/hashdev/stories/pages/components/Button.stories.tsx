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
      options: [null, "start", "end"],
      control: { type: "radio" },
    },
  },
};

export const Button = ({
  hover = false,
  focus = false,
  icon = false,
  ...props
}: any) => (
  <HashButton
    className={clsx({
      "Button--hover": hover,
      "Button--focus": focus,
    })}
    {...(icon
      ? {
          [icon === "start" ? "startIcon" : "endIcon"]: (
            <span className="fa-solid fa-arrow-up-right-from-square" />
          ),
        }
      : {})}
    {...props}
  />
);
