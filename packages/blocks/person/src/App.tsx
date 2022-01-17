import React from "react";

import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  name?: string;
  email?: string;
};

export const App: BlockComponent<AppProps> = ({ name, email }) => {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: "19px",
        fontWeight: 300,
        lineHeight: "180%",
      }}
    >
      <div
        style={{
          textAlign: "right",
          marginRight: "15px",
          fontWeight: 500,
        }}
      >
        <div>Name: </div>
        <div>Email: </div>
      </div>
      <div>
        <div>{name}</div>
        <div>
          <a href={`mailto:${email}`}>{email}</a>
        </div>
      </div>
    </div>
  );
};
