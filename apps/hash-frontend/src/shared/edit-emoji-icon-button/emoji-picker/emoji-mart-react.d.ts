declare module "@emoji-mart/react" {
  import type { PickerProps } from "emoji-mart";
  import type { FunctionComponent } from "react";

  const ReactComponent: FunctionComponent<PickerProps>;

  // eslint-disable-next-line import/no-default-export -- third-party requirement
  export default ReactComponent;
}
