import { Button as MuiButton } from "@mui/material";
import clsx from "clsx";

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
  },
};

export const Button = ({ hover = false, focus = false, ...props }: any) => (
  <MuiButton
    className={clsx({
      "Button--hover": hover,
      "Button--focus": focus,
    })}
    {...props}
  />
);
