/** @todo - remove */
/* eslint-disable no-console */
import * as React from "react";

import { uniqBy } from "lodash";
import { BlockComponent } from "blockprotocol/react";
import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolAggregateEntitiesResult,
  BlockProtocolEntity,
} from "blockprotocol";
import { GithubIssueEvent } from "./types";
import { GithubPrLifeCycle, GithubPrLifeCycleProps } from "./lifecycle";

type AppProps = {
  name: string;
};

// TODO - Don't hardcode
const GithubEventTypeId = "871efcfa-eee7-47f3-afeb-3a094ed035f2";

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
      entityTypeId: GithubEventTypeId,
      pageNumber,
      itemsPerPage: 50,
      multiFilter: {
        operator: "AND",
        filters: [
          {
            field: "issue.pull_request",
            operator: "IS_NOT_EMPTY",
            value: "",
          },
          {
            field: "issue.html_url",
            operator: "IS",
            value: "https://github.com/hashintel/hash/pull/490",
          },
        ],
      },
      multiSort: [
        {
          field: "issue.html_url",
          desc: true,
        },
        {
          field: "created_at",
          desc: false,
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
    Map<string, GithubIssueEvent[]>
  >(new Map());

  React.useEffect(() => {
    const results = Array(1)
      .fill(undefined)
      .map((_, page) => getPrEvents(aggregateEntities, accountId, page));

    Promise.all(results)
      .then((entitiesResults) => {
        const entities: GithubIssueEvent[] = entitiesResults
          .flatMap((entityResult) => entityResult?.results)
          .filter(isDefined)
          .filter((entity: GithubIssueEvent) =>
            isDefined(entity.issue?.pull_request),
          );

        const events = uniqBy(entities, "id");

        /** @todo - These should be links to a PR entity really */
        const pullRequestsToEvents = new Map();

        for (const event of events) {
          if (pullRequestsToEvents.has(event.issue!.html_url)) {
            pullRequestsToEvents.get(event.issue!.html_url).push(event);
          } else {
            pullRequestsToEvents.set(event.issue!.html_url, [event]);
          }
        }

        setPrToEvents(pullRequestsToEvents);
      })
      .catch((err) => console.error(err));
  }, [accountId, aggregateEntities, setPrToEvents]);

  let props: GithubPrLifeCycleProps | undefined;

  const entry = prToEvents.entries().next();
  if (entry.value) {
    const [_, events]: [string, GithubIssueEvent[]] = entry.value;

    props = {
      repo: events[0]!.repository!,
      prNumber: events[0]!.issue!.number!,
      events,
    };
  }

  /** @todo - Filterable list to select a pull-request */
  return (
    <div>
      {prToEvents.size === 0 ? (
        "Loading..."
      ) : isDefined(props) ? (
        <GithubPrLifeCycle
          repo={props.repo}
          prNumber={props.prNumber}
          events={props.events}
        />
      ) : (
        ""
      )}
    </div>
  );
};
