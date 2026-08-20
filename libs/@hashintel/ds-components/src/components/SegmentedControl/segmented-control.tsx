import { type IconName } from "../Icon/icon";

import type { FormInputSize, SharedInputProps } from "../../util/form-shared";
import type { Tooltip } from "../Tooltip/tooltip";

export const SegmentedControl = (
  _props: {
    layout?: "horizontal" | "vertical";
    size?: FormInputSize;
    items?: Array<
      ({ label: React.ReactNode } | { iconName: IconName }) & {
        value: string;
        tooltip?: string;
        tooltipOptions?: Omit<
          React.ComponentProps<typeof Tooltip>,
          "children" | "content"
        >;
      }
    >;
  } & Omit<SharedInputProps<HTMLInputElement, string>, "required"> &
    React.AriaAttributes,
) => {
  return <div />;
};
