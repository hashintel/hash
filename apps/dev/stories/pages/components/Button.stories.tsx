import { Button } from "@mui/material";
import { ComponentProps } from "react";

export default {
  title: "Components/Button",
  component: Button,
};

const Template = (props: ComponentProps<typeof Button>) => (
  <Button {...props}>Join</Button>
);

export const Primary = Template.bind({});
// @ts-expect-error @todo teach TS to know about this
Primary.args = {
  variant: "primary",
  label: "Button",
};
