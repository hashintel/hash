/** @todo - remove */
/* eslint-disable no-console */
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

function isDefined<T>(val: T | undefined | null): val is T {
  return val !== undefined && val !== null;
}

const getPrEvents = (
  aggregateEntities?: BlockProtocolAggregateEntitiesFunction,
  accountId?: string | null,
  pageNumber?: number,
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
      multiSort: [
        {
          field: "issue.html_url",
          desc: true,
        },
      ],
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
}) => {
  const [prToEvents, setPrToEvents] = React.useState<
    Map<string, GitHubIssueEvent[]>
  >(new Map());
  const [_PrEvents, setPrEvents] = React.useState<GitHubIssueEvent[]>([]);

  React.useEffect(() => {
    const results = Array(10)
      .fill(undefined)
      .map((_, page) => getPrEvents(aggregateEntities, accountId, page));

    Promise.all(results)
      .then((entitiesResults) => {
        const entities: GitHubIssueEvent[] = entitiesResults
          .flatMap((entityResult) => entityResult?.results)
          .filter(isDefined);

        const pullRequestsToEntities = new Map();

        for (const entity of entities) {
          if (entity.issue?.pull_request === undefined) {
            // only want issues that are pull_requests
            continue;
          }

          if (pullRequestsToEntities.has(entity.issue.html_url)) {
            pullRequestsToEntities.get(entity.issue.html_url).push(entity);
          } else {
            pullRequestsToEntities.set(entity.issue.html_url, [entity]);
          }
        }

        setPrToEvents(pullRequestsToEntities);
        setPrEvents(entities);
      })
      .catch((err) => console.error(err));
  }, [accountId, aggregateEntities, setPrEvents, setPrToEvents]);

  return (
    <>
      <h1>Pull Request Events:</h1>
      <ol>
        {prToEvents.size === 0
          ? "Loading..."
          : Array.from(prToEvents.entries()).map(([prUrl, events]) => (
              <li key={prUrl}>
                <pre>
                  PR URL: {prUrl}
                  {"\n"}
                  Events: {events.map((event) => event.event).join(", ")}
                </pre>
              </li>
            ))}
        {/* {prEvents.map((prEvent) => <li>
            <pre>
              PR Number: {prEvent.payload.number}
              {"\n"}
              Action: {prEvent.payload.action}
            </pre>
          </li>)} */}
      </ol>
    </>
  );
};
