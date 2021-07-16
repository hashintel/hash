/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom";

import Component from "./index";
import { schemas } from "./schemas";
import {
  entities as initialData,
  Location,
  Company,
  initialState,
} from "./mockData/mockData";
import { BlockProtocolUpdateFn } from "./types/blockProtocol";

const useMockData = (): [any, BlockProtocolUpdateFn] => {
  const [data, setData] = useState(initialData);

  const updateData: BlockProtocolUpdateFn = (actions) => {
    setData((data) => {
      const newData = data.map((entity) => {
        const affectingAction = actions.find(
          (action) => action.entityId === entity.id
        );
        if (affectingAction) {
          return {
            ...entity,
            ...affectingAction.data,
          };
        }
        return entity;
      });
      return newData;
    });
  };

  const personData = useMemo(() => {
    for (const entity of data) {
      switch (entity.type) {
        case "Company":
          entity.location = data.find(
            (subEnt) => subEnt.id === entity.locationId
          ) as Location;
          break;
        case "Person":
          entity.employer = data.find(
            (subEnt) => subEnt.id === entity.employerId
          ) as Company;
      }
    }
    return data.filter((ent) => ent.type === "Person");
  }, [data]);

  return [personData, updateData];
};

const node = document.getElementById("app");

const App = () => {
  const [data, updateData] = useMockData();

  return (
    <Component
      data={data}
      initialState={initialState}
      schemas={schemas}
      update={updateData}
    />
  );
};

ReactDOM.render(<App />, node);
