import React, { VoidFunctionComponent } from "react";

type AppProps = {
  color?: string;
  level: number;
  text: string;
};

export const App: VoidFunctionComponent<AppProps> = ({
  color,
  level,
  text,
}) => {
  if (!level || level < 1 || level > 6) {
    throw new Error("you must supply a level between 1 and 6, inclusive");
  }

  const Header = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <Header style={{ fontFamily: "Arial", color: color ?? "black" }}>
      {text}
    </Header>
  );
};
