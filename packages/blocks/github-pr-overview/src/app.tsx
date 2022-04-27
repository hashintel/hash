import * as React from "react";

import { BlockComponent } from "blockprotocol/react";
import LinearProgress from "@mui/material/LinearProgress";
import {
  GithubIssueEvent,
  GithubPullRequest,
  PullRequestIdentifier,
  GithubReview,
  isDefined,
} from "./types";
import { GithubPrOverview, GithubPrOverviewProps } from "./overview";
import {
  collectPrEventsAndSetState,
  collectPrsAndSetState,
  collectReviewsAndSetState,
  getPrs,
} from "./entity-aggregations";

type AppProps = {
  selectedPullRequest?: PullRequestIdentifier;
};

export const App: BlockComponent<AppProps> = ({
  accountId,
  aggregateEntities,
  // selectedPullRequest,
}) => {
  const selectedPullRequest = React.useMemo(() => {
    return {
      repository: "hashintel/hash",
      number: 490,
    };
  }, []);

  const [allPrs, setAllPrs] = React.useState<
    Map<PullRequestIdentifier, GithubPullRequest>
  >(new Map());
  const [pullRequest, setPullRequest] = React.useState<GithubPullRequest>();
  const [reviews, setReviews] = React.useState<GithubReview[]>();
  const [events, setEvents] = React.useState<GithubIssueEvent[]>();

  // Block hasn't been initialized with a selected Pull Request, get all PRs to allow user to pick
  React.useEffect(() => {
    if (selectedPullRequest === undefined) {
      collectPrsAndSetState(aggregateEntities, accountId, 1, setAllPrs);
    }
  }, [accountId, aggregateEntities, selectedPullRequest, setAllPrs]);

  // Block has been initialized with a selected Pull Request, get associated info
  React.useEffect(() => {
    if (selectedPullRequest) {
      void getPrs(aggregateEntities, accountId, 1, selectedPullRequest).then(
        (pullRequests) => {
          if (pullRequests) {
            const pr = pullRequests.results[0];
            setPullRequest(pr);
          }
        },
      );
    }
  }, [accountId, aggregateEntities, selectedPullRequest, setPullRequest]);
  /** @todo - Figure out when to query for more than one page */
  React.useEffect(() => {
    if (selectedPullRequest) {
      collectReviewsAndSetState(
        aggregateEntities,
        accountId,
        1,
        setReviews,
        selectedPullRequest,
      );
    }
  }, [accountId, aggregateEntities, selectedPullRequest, setReviews]);
  React.useEffect(() => {
    if (selectedPullRequest) {
      collectPrEventsAndSetState(
        aggregateEntities,
        accountId,
        1,
        setEvents,
        selectedPullRequest,
      );
    }
  }, [accountId, aggregateEntities, selectedPullRequest, setEvents]);

  let props: GithubPrOverviewProps | undefined;

  /** @todo - handle missing data */
  if (
    pullRequest !== undefined &&
    reviews !== undefined &&
    events !== undefined
  ) {
    props = {
      pullRequest,
      reviews,
      events,
    };
  }

  /** @todo - Filterable list to select a pull-request */
  return (
    <div>
      {selectedPullRequest ? (
        isDefined(props) ? (
          <GithubPrOverview
            pullRequest={props.pullRequest}
            reviews={props.reviews}
            events={props.events}
          />
        ) : (
          <LinearProgress />
        )
      ) : (
        "Select a Pull Request"
      )}
    </div>
  );
};
