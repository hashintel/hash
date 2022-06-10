/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import { tw } from "twind";
import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

/**
 * @type {{content: string; language: import("./utils").LanguageType;}}
 */
const initialData = {
  content: 'var foo = "bar";',
  language: "javascript",
};

const App = () => {
  return (
    <div className={tw`mx-auto mt-14 max-w-3xl`}>
      <MockBlockDock>
        <Component
          graph={{
            blockEntity: { entityId: "entity-code", properties: initialData },
          }}
        />
      </MockBlockDock>
    </div>
  );
};

ReactDOM.render(<App />, node);
