/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React, { useCallback, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { tw } from "twind";

import {
  BlockProtocolUpdateEntitiesFunction,
  BlockProtocolUpdateEntitiesAction,
  BlockProtocolLinkedDataDefinition,
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolAggregateEntitiesResult,
} from "@hashintel/block-protocol";
import { cloneDeep } from "lodash";
import Component from "./index";
import { schemas } from "./schemas";
import {
  entities as initialEntities,
  Location,
  Company,
  initialTableData,
  Person,
} from "./mockData/mockData";
import { sortEntities } from "./lib/sortEntities";
import { filterEntities } from "./lib/filterEntities";

const DEFAULT_PAGE_SIZE = 3;

const useMockData = () => {
  const [entities, setEntities] = useState(initialEntities);
  const [tableData, setTableData] = useState(initialTableData);

  const getResolvedData = useCallback(
    (linkedInfo?: typeof tableData["data"]["__linkedData"]) => {
      let resolvedData: Person[] = [];

      const linkedData = linkedInfo ?? tableData.data.__linkedData;
      if (!linkedData) {
        return {
          data: [] as Person[],
        };
      }

      // attach linked field info to each entity
      for (const entity of entities) {
        switch (entity.type) {
          case "Company":
            entity.location = entities.find(
              (subEnt) => subEnt.entityId === entity.locationId,
            ) as Location;
            break;
          case "Person":
            entity.employer = entities.find(
              (subEnt) => subEnt.entityId === entity.employerId,
            ) as Company;
        }
      }

      resolvedData = entities.filter(
        ({ type }) => type === linkedData.entityTypeId,
      ) as Person[];

      if (!linkedData.aggregate) {
        return {
          __linkedData: tableData.data.__linkedData,
          data: resolvedData.slice(0, DEFAULT_PAGE_SIZE),
        };
      }

      // FILTERING
      if (linkedData.aggregate?.multiFilter) {
        resolvedData = filterEntities(
          resolvedData,
          linkedData.aggregate.multiFilter,
        );
      }

      // SORTING
      if (linkedData.aggregate?.multiSort) {
        const sortFields = linkedData.aggregate.multiSort;
        resolvedData = sortEntities(resolvedData, sortFields);
      }

      // PAGINATION
      const { pageNumber = 1, itemsPerPage = DEFAULT_PAGE_SIZE } =
        linkedData.aggregate;

      const startIndex = pageNumber === 1 ? 0 : (pageNumber - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, resolvedData.length);
      const pageCount = Math.ceil(resolvedData.length / itemsPerPage);
      resolvedData = resolvedData.slice(startIndex, endIndex);

      linkedData.aggregate.pageCount = pageCount;

      return {
        __linkedData: linkedData,
        data: resolvedData,
      };
    },
    [tableData, entities],
  );

  const aggregateEntities: BlockProtocolAggregateEntitiesFunction = useCallback(
    async (action) => {
      const results = getResolvedData({
        aggregate: action.operation,
        entityTypeId: action.entityTypeId,
      }).data;

      return Promise.resolve({
        results,
        operation: action.operation,
      } as BlockProtocolAggregateEntitiesResult);
    },
    [getResolvedData],
  );

  const updateEntities: BlockProtocolUpdateEntitiesFunction = useCallback(
    async (
      actions: BlockProtocolUpdateEntitiesAction<{
        data?: { __linkedData: BlockProtocolLinkedDataDefinition };
        initialState?: Record<string, any>;
      }>[],
    ) => {
      const newTableData = cloneDeep(tableData);

      actions.forEach((action) => {
        if (action.data.data?.__linkedData) {
          newTableData.data.__linkedData = action.data.data?.__linkedData;
        }
        if (action.data.initialState) {
          newTableData.initialState = action.data.initialState;
        }
        setTableData(newTableData);
      });

      setEntities((prevData) => {
        const newData = prevData.map((entity) => {
          const affectingAction = actions.find(
            (action) => action.entityId === entity.entityId,
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

      return [];
    },
    [tableData],
  );

  return useMemo(
    () => ({
      initialState: tableData.initialState,
      data: getResolvedData(),
      entityId: tableData.entityId,
      updateEntities,
      aggregateEntities,
    }),
    [tableData, getResolvedData, updateEntities, aggregateEntities],
  );
};

const node = document.getElementById("app");

const App = () => {
  const { data, initialState, updateEntities, aggregateEntities } =
    useMockData();

  return (
    <div className={tw`flex justify-center py-8`}>
      <Component
        data={data}
        initialState={initialState}
        schemas={schemas}
        updateEntities={updateEntities}
        aggregateEntities={aggregateEntities}
        entityId="table-1"
      />
    </div>
  );
};

ReactDOM.render(<App />, node);
