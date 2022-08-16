declare module "@emoji-mart/react" {
  import { PickerProps } from "emoji-mart";
  import { FunctionComponent } from "react";

  const ReactComponent: FunctionComponent<PickerProps>;

  // eslint-disable-next-line import/no-default-export -- third-party requirement
  export default ReactComponent;
}
