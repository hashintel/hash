import { BlockProtocolProps } from "blockprotocol";
import { BlockComponent } from "blockprotocol/react";
import { ComponentType, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

export const LocalReactBlockContainer: BlockComponent<{
  Component: ComponentType<BlockProtocolProps>;
}> = ({ Component, ...rest }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ReactDOM.render(<Component {...rest} />, ref.current);
  }, [Component, rest]);

  return <div ref={ref} />;
};
