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
import { PullRequestSelector } from "./pull-request-selector";

type AppProps = {
  selectedPullRequest?: PullRequestIdentifier;
};

export const App: BlockComponent<AppProps> = ({
  accountId,
  entityId,
  aggregateEntities,
  selectedPullRequest,
  updateEntities,
}) => {
  // selectedPullRequest is just an Identifier, but isn't the associated GithubPullRequestEntity
  const [selectedPullRequestId, setSelectedPullRequestId] =
    React.useState(selectedPullRequest);

  const setSelectedPullRequestIdAndPersist = (
    pullRequestId?: PullRequestIdentifier,
  ) => {
    if (updateEntities) {
      updateEntities([
        {
          entityId,
          accountId,
          data: {
            selectedPullRequest: pullRequestId,
          },
        },
      ]).catch((err) => {
        throw err;
      });
    }
    setSelectedPullRequestId(pullRequestId);
  };

  const [allPrs, setAllPrs] = React.useState<Map<string, GithubPullRequest>>(
    new Map(),
  );
  const [pullRequest, setPullRequest] = React.useState<GithubPullRequest>();
  const [reviews, setReviews] = React.useState<GithubReview[]>();
  const [events, setEvents] = React.useState<GithubIssueEvent[]>();

  /** @todo - Figure out when to query for more than one page, probably querying until no more results */

  // Block hasn't been initialized with a selected Pull Request, get all PRs to allow user to pick
  React.useEffect(() => {
    if (selectedPullRequestId === undefined) {
      collectPrsAndSetState(aggregateEntities, accountId, 5, setAllPrs);
    }
  }, [accountId, aggregateEntities, selectedPullRequestId, setAllPrs]);

  // Block has been initialized with a selected Pull Request, get associated info
  React.useEffect(() => {
    if (selectedPullRequestId) {
      void getPrs(aggregateEntities, accountId, 1, selectedPullRequestId).then(
        (pullRequests) => {
          if (pullRequests) {
            const pr = pullRequests.results[0];
            setPullRequest(pr);
          }
        },
      );
    }
  }, [accountId, aggregateEntities, selectedPullRequestId, setPullRequest]);
  React.useEffect(() => {
    if (selectedPullRequestId) {
      collectReviewsAndSetState(
        aggregateEntities,
        accountId,
        1,
        setReviews,
        selectedPullRequestId,
      );
    }
  }, [accountId, aggregateEntities, selectedPullRequestId, setReviews]);
  React.useEffect(() => {
    if (selectedPullRequestId) {
      collectPrEventsAndSetState(
        aggregateEntities,
        accountId,
        1,
        setEvents,
        selectedPullRequestId,
      );
    }
  }, [accountId, aggregateEntities, selectedPullRequestId, setEvents]);

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
      setSelectedPullRequestId: setSelectedPullRequestIdAndPersist,
    };
  }

  /** @todo - Filterable list to select a pull-request */
  return (
    <div>
      {selectedPullRequestId && isDefined(props) ? (
        <GithubPrOverview
          pullRequest={props.pullRequest}
          reviews={props.reviews}
          events={props.events}
          setSelectedPullRequestId={props.setSelectedPullRequestId}
        />
      ) : selectedPullRequestId === undefined && allPrs.size > 0 ? (
        <PullRequestSelector
          setSelectedPullRequestId={setSelectedPullRequestIdAndPersist}
          allPrs={allPrs}
        />
      ) : (
        <LinearProgress />
      )}
    </div>
  );
};
