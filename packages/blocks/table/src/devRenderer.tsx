/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import { tw } from "twind";

import Component from "./index";

import { initialTableData } from "./mockData/mockData";

const node = document.getElementById("app");

const App = () => {
  // @todo recreate useMockData hook when needed

  return (
    <div className={tw`flex justify-center py-8 mx-2`}>
      <Component
        data={initialTableData.data}
        initialState={initialTableData.initialState}
        entityId="table-1"
      />
    </div>
  );
};

ReactDOM.render(<App />, node);
