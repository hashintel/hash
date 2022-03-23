/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import { tw } from "twind";
import { MockBlockDock } from "mock-block-dock";

// eslint-disable-next-line import/extensions
import Component from "./index";
import { LanguageType } from "./utils";

const node = document.getElementById("app");

const initialData: {
  content: string;
  language: LanguageType;
} = {
  content: 'var foo = "bar";',
  language: "javascript",
};

const App = () => {
  return (
    <div className={tw`mx-auto mt-14 max-w-3xl`}>
      <MockBlockDock>
        <Component
          entityTypeId="code"
          entityId="entity-code"
          accountId="account-code"
          {...initialData}
        />
      </MockBlockDock>
    </div>
  );
};

ReactDOM.render(<App />, node);
