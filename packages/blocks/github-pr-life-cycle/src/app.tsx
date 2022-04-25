/* eslint-disable no-console */
/** @todo - remove */
import * as React from "react";

import { BlockComponent } from "blockprotocol/react";
import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolAggregateEntitiesResult,
  BlockProtocolEntity,
} from "blockprotocol";
import { GitHubIssueEvent } from "./types";

type AppProps = {
  name: string;
};

// TODO - Don't hardcode
const GitHubEventTypeId = "871efcfa-eee7-47f3-afeb-3a094ed035f2";

const getPrEventsFunction =
  (
    aggregateEntities?: BlockProtocolAggregateEntitiesFunction,
    accountId?: string | null,
  ) =>
  (
    pageNumber: number,
  ): Promise<BlockProtocolAggregateEntitiesResult<BlockProtocolEntity> | void> => {
    if (!aggregateEntities) {
      return new Promise<void>(() => {});
    }

    console.log("Calling aggregateEntities");

    const res = aggregateEntities({
      accountId,
      operation: {
        entityTypeId: GitHubEventTypeId,
        pageNumber,
        itemsPerPage: 100,
        multiFilter: {
          operator: "AND",
          filters: [
            {
              field: "issue.pull_request",
              operator: "IS_NOT_EMPTY",
              value: "",
            },
          ],
        },
      },
    });

    void res.then(() => {
      console.log(`Got result from aggregateEntities`);
    });

    return res;
  };

export const App: BlockComponent<AppProps> = ({
  accountId,
  aggregateEntities,
  name,
}) => {
  const getPrEvents = getPrEventsFunction(aggregateEntities, accountId);
  const [prEvents, setPrEvents] = React.useState<GitHubIssueEvent[]>([]);
  const [events, setEvents] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    getPrEvents(0)
      .then((entitiesResult) => {
        if (entitiesResult) {
          const entities: GitHubIssueEvent[] = entitiesResult.results;
          const entityEvents = new Set(
            entities
              .filter((entity) => entity.event == null)
              .map((entity) => entity.event!),
          );

          console.log(entityEvents);
          setPrEvents(entities);
          setEvents(entityEvents);
        }
      })
      .catch((err) => console.error(err));
  }, [setEvents, setPrEvents, getPrEvents]);

  return (
    <>
      <h1>Hello, {name}!</h1>
      <ol>
        {Array.from(events).join(", ")}
        {/* {prEvents.map((prEvent) => (
          <li>
            <pre>
              PR Number: {prEvent.payload.number}
              {"\n"}
              Action: {prEvent.payload.action}
            </pre>
          </li>
        ))} */}
      </ol>
    </>
  );
};
