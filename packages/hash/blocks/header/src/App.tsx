import React, { RefCallback, VoidFunctionComponent } from "react";

type AppProps = {
  color?: string;
  level?: number;
  editableRef?: RefCallback<HTMLElement>;
};

export const App: VoidFunctionComponent<AppProps> = ({
  color,
  level = 1,
  editableRef,
}) => {
  const Header = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <Header
      style={{ fontFamily: "Arial", color: color ?? "black" }}
      ref={editableRef}
    />
  );
};
