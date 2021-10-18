/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React, { useCallback, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { tw } from "twind";

import {
  BlockProtocolUpdateFn,
  BlockProtocolUpdatePayload,
  BlockProtocolLinkedDataDefinition,
} from "@hashintel/block-protocol";
import Component from "./index";
import { schemas } from "./schemas";
import {
  entities as initialEntities,
  Location,
  Company,
  initialTableData,
  Person,
} from "./mockData/mockData";
import { resolvePath } from "./lib/compareEntitiesByField";
import { sortEntities } from "./lib/sortEntities";

const DEFAULT_PAGE_SIZE = 3;

const useMockData = () => {
  const [entities, setEntities] = useState(initialEntities);
  const [tableData, setTableData] = useState(initialTableData);

  const getResolvedData = useCallback(() => {
    let resolvedData: Person[] = [];

    const linkedData = tableData.data.__linkedData;
    if (!linkedData) {
      return {
        data: [],
      };
    }

    // attach linked field info to each entity
    for (const entity of entities) {
      switch (entity.type) {
        case "Company":
          entity.location = entities.find(
            (subEnt) => subEnt.entityId === entity.locationId
          ) as Location;
          break;
        case "Person":
          entity.employer = entities.find(
            (subEnt) => subEnt.entityId === entity.employerId
          ) as Company;
      }
    }

    resolvedData = entities.filter(
      ({ type }) => type === linkedData.entityTypeId
    ) as Person[];

    if (!linkedData.aggregate) {
      return {
        __linkedData: tableData.data.__linkedData,
        data: resolvedData.slice(0, DEFAULT_PAGE_SIZE),
      };
    }

    // FILTERING
    if (linkedData.aggregate?.multiFilter) {
      const combinatorFilter = linkedData.aggregate.multiFilter;
      // This assumes the operator for each field is Contains and
      // the combinator operator is AND
      // @todo update to handle all filter scenarios
      combinatorFilter.filters.forEach(({ field, value }) => {
        resolvedData = resolvedData.filter((entity) => {
          const property = resolvePath(entity, field);
          if (typeof property !== "string" || !property) return;
          return property.toLowerCase().includes(value.toLowerCase());
        });
      });
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
  }, [tableData, entities]);

  const updateData: BlockProtocolUpdateFn = useCallback(
    async (
      actions: BlockProtocolUpdatePayload<{
        data?: { __linkedData: BlockProtocolLinkedDataDefinition };
        initialState?: Record<string, any>;
      }>[]
    ) => {
      const newTableData = { ...tableData };

      actions.forEach((action) => {
        if (action.data.data?.__linkedData) {
          newTableData.data.__linkedData = action.data.data?.__linkedData;
        }
        newTableData.initialState = action.data.initialState;
        setTableData(newTableData);
      });

      setEntities((prevData) => {
        const newData = prevData.map((entity) => {
          const affectingAction = actions.find(
            (action) => action.entityId === entity.entityId
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
    },
    [tableData]
  );

  return useMemo(
    () => ({
      initialState: tableData.initialState,
      data: getResolvedData(),
      entityId: tableData.entityId,
      updateData,
    }),
    [tableData, getResolvedData, updateData]
  );
};

const node = document.getElementById("app");

const App = () => {
  const { data, initialState, updateData } = useMockData();

  return (
    <div className={tw`flex justify-center py-8`}>
      <Component
        data={data}
        initialState={initialState}
        schemas={schemas}
        update={updateData}
        entityId="table-1"
      />
    </div>
  );
};

ReactDOM.render(<App />, node);
