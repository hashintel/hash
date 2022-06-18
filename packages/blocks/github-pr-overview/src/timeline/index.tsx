import * as React from "react";
import Box from "@mui/material/Box";
import Timeline from "@mui/lab/Timeline";

import { uniq, intersection, sortBy } from "lodash";
import { Collapse, Stack } from "@mui/material";
import { TransitionGroup } from "react-transition-group";
import { TimelineItem } from "./timeline-item";
import { GithubIssueEvent, GithubPullRequest, GithubReview } from "../types";
import { ConfigPanel } from "./config-panel";

const addDefaultFromPossible = (availableEventTypes: string[]) => {
  return intersection(
    ["opened", "reviewed", "review_requested", "closed", "merged"],
    availableEventTypes,
  );
};

export type GithubPrTimelineProps = {
  pullRequest: GithubPullRequest["properties"];
  reviews: GithubReview["properties"][];
  events: GithubIssueEvent["properties"][];
};

export const GithubPrTimeline: React.FunctionComponent<
  GithubPrTimelineProps
> = ({ pullRequest, events, reviews }) => {
  // @todo think of a better name
  const [timelineOpacity, setTimelineOpacity] = React.useState(false);

  const nodes = React.useMemo(() => {
    // there isn't an issue event for opening so we manually make an object to append to the timeline
    const openedEvent = {
      id: pullRequest.node_id,
      event: "opened",
      created_at: pullRequest.created_at,
      html_url: pullRequest.html_url,
      actor: pullRequest.user,
    };
    const reviewEvents = reviews.map((review) => {
      return {
        id: review.id,
        event: "reviewed",
        created_at: review.submitted_at,
        html_url: review.html_url,
        actor: review.user,
      };
    });
    return sortBy([openedEvent, ...reviewEvents, ...events], "created_at");
  }, [pullRequest, events, reviews]);

  const possibleEventTypes = React.useMemo(
    () => uniq(nodes.map((event) => event.event!)),
    [nodes],
  );

  const [selectedEventTypes, setSelectedEventTypes] = React.useState(
    addDefaultFromPossible(possibleEventTypes),
  );

  const filteredNodes = React.useMemo(
    () =>
      nodes.filter(
        (event) =>
          event.event != null && selectedEventTypes.includes(event.event),
      ),
    [nodes, selectedEventTypes],
  );

  console.log({ nodes });

  return (
    <Stack
      direction="row"
      position="relative"
      spacing="auto"
      justifyContent="space-between"
      px={2}
      pt={2}
    >
      {/* @todo revisit maxWidth */}
      <Box
        maxWidth={480}
        className="timeline"
        sx={{
          height: 580, // this should be max height
          position: "relative",
          overflowY: "scroll",

          // @todo fade not showing
          "&:before": {
            content: "''",
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            backgroundColor:
              "linear-gradient(181.33deg, #F7FAFC 1.14%, rgba(251, 253, 254, 0) 94.8%",
          },
        }}
      >
        <Timeline
          position="right"
          style={{
            opacity: timelineOpacity ? 0.5 : 1,
          }}
        >
          <TransitionGroup>
            {filteredNodes.map((event, idx) => {
              return (
                <Collapse in key={event.id?.toString()}>
                  <TimelineItem
                    key={event.id?.toString()}
                    // @ts-ignore
                    event={event}
                    hideConnector={idx >= filteredNodes.length - 1}
                    setTimelineOpacity={setTimelineOpacity}
                  />
                </Collapse>
              );
            })}
          </TransitionGroup>
        </Timeline>
      </Box>
      <ConfigPanel
        possibleEventTypes={possibleEventTypes}
        selectedEventTypes={selectedEventTypes}
        setSelectedEventTypes={setSelectedEventTypes}
      />
    </Stack>
  );
};
