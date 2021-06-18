import React, { VoidFunctionComponent } from "react";

type AppProps = {
  color?: string;
  level?: number;
  text: string;
};

export const App: VoidFunctionComponent<AppProps> = ({
  color,
  level = 1,
  text,
}) => {
  const Header = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <Header style={{ fontFamily: "Arial", color: color ?? "black" }}>
      {text}
    </Header>
  );
};
