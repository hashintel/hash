/** @todo - remove */
/* eslint-disable no-console */
import * as React from "react";

import { BlockComponent } from "blockprotocol/react";
import {
  GithubIssueEvent,
  GithubPullRequest,
  GithubPullRequestIdentifier,
  GithubReview,
  isDefined,
} from "./types";
import { GithubPrOverview, GithubPrOverviewProps } from "./overview";
import {
  collectPrEventsAndSetState,
  collectPrsAndSetState,
  collectReviewsAndSetState,
} from "./entity-aggregations";

type AppProps = {
  name: string;
};

export const App: BlockComponent<AppProps> = ({
  accountId,
  aggregateEntities,
}) => {
  const [mappedPrs, setMappedPrs] = React.useState<
    Map<GithubPullRequestIdentifier, GithubPullRequest>
  >(new Map());
  const [mappedReviews, setMappedReviews] = React.useState<
    Map<GithubPullRequestIdentifier, GithubReview[]>
  >(new Map());
  const [mappedEvents, setMappedEvents] = React.useState<
    Map<GithubPullRequestIdentifier, GithubIssueEvent[]>
  >(new Map());

  React.useEffect(() => {
    collectPrsAndSetState(aggregateEntities, accountId, 1, setMappedPrs);
  }, [accountId, aggregateEntities, setMappedPrs]);
  React.useEffect(() => {
    collectReviewsAndSetState(
      aggregateEntities,
      accountId,
      1,
      setMappedReviews,
    );
  }, [accountId, aggregateEntities, setMappedReviews]);
  React.useEffect(() => {
    collectPrEventsAndSetState(
      aggregateEntities,
      accountId,
      1,
      setMappedEvents,
    );
  }, [accountId, aggregateEntities, setMappedEvents]);

  let props: GithubPrOverviewProps | undefined;

  /** @todo - handle missing data */
  if (mappedPrs.size > 0 && mappedReviews.size > 0 && mappedEvents.size > 0) {
    const [_, pullRequest]: [GithubPullRequestIdentifier, GithubPullRequest] =
      mappedPrs.entries().next().value;
    const [__, reviews]: [GithubPullRequestIdentifier, GithubReview[]] =
      mappedReviews.entries().next().value;
    const [___, events]: [GithubPullRequestIdentifier, GithubIssueEvent[]] =
      mappedEvents.entries().next().value;

    props = {
      pullRequest,
      reviews,
      events,
    };
  }

  /** @todo - Filterable list to select a pull-request */
  return (
    <div>
      {isDefined(props) ? (
        <GithubPrOverview
          pullRequest={props.pullRequest}
          reviews={props.reviews}
          events={props.events}
        />
      ) : (
        "Loading..."
      )}
    </div>
  );
};
