import { Button } from "@mui/material";
import { ComponentProps } from "react";

export default {
  title: "Components/Button",
  component: Button,
  argTypes: {
    variant: {
      options: ["primary", "secondary", "tertiary"],
      control: { type: "radio" },
    },
  },
};

export { Button };
