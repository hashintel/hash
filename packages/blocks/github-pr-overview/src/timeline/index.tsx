import * as React from "react";
import Box from "@mui/material/Box";
import Timeline, { timelineClasses } from "@mui/lab/Timeline";

import { uniq, intersection, sortBy } from "lodash";
import { Collapse, Stack, StackProps, styled } from "@mui/material";
import { TransitionGroup } from "react-transition-group";
import { TimelineItem } from "./timeline-item";
import {
  GithubIssueEventEntityType,
  GithubPullRequestEntityType,
  GithubReviewEntityType,
} from "../types";
import { ConfigPanel } from "./config-panel";

const Container = styled(({ children, ...props }: StackProps) => (
  <Stack
    direction="row"
    position="relative"
    spacing="auto"
    justifyContent="space-between"
    px={4}
    {...props}
  >
    {children}
  </Stack>
))(({ theme }) => ({
  backgroundColor: theme.palette.gray[10],
  borderRadius: "0 0 6px 6px",
  position: "relative",
  "&:after": {
    content: "''",
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 84,
    background: `linear-gradient(181.33deg, #F7FAFC 1.14%, rgba(251, 253, 254, 0) 94.8%)`,
    transform: "rotate(-180deg)",
  },

  ".timeline-wrapper": {
    height: 580, // this should be max height
    position: "relative",
    overflowY: "scroll",
    flex: 0.7,
  },

  [`.${timelineClasses.root}`]: {
    maxWidth: 480,
    paddingTop: 30,
    paddingBottom: 100,
  },

  ".config-panel-wrapper": {
    paddingTop: 32,
  },
}));

const addDefaultFromPossible = (availableEventTypes: string[]) => {
  return intersection(
    ["opened", "reviewed", "review_requested", "closed", "merged"],
    availableEventTypes,
  );
};

const areDatesWithoutTimeEqual = (
  date1?: string | null,
  date2?: string | null,
) => {
  if (!date1 || !date2) {
    return false;
  }

  const date1WithoutTime = new Date(date1);
  const date2WithoutTime = new Date(date2);

  date1WithoutTime.setHours(0, 0, 0);
  date2WithoutTime.setHours(0, 0, 0);

  return date1WithoutTime.getTime() === date2WithoutTime.getTime();
};

export type GithubPrTimelineProps = {
  pullRequest: GithubPullRequestEntityType["properties"];
  reviews: GithubReviewEntityType["properties"][];
  events: GithubIssueEventEntityType["properties"][];
};

export const GithubPrTimeline: React.FunctionComponent<
  GithubPrTimelineProps
> = ({ pullRequest, events, reviews }) => {
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

  // @todo remove the need for this
  React.useEffect(() => {
    setSelectedEventTypes(addDefaultFromPossible(possibleEventTypes));
  }, [possibleEventTypes]);

  const filteredNodes = React.useMemo(
    () =>
      nodes.filter(
        (event) =>
          event.event != null && selectedEventTypes.includes(event.event),
      ),
    [nodes, selectedEventTypes],
  );

  return (
    <Container>
      <Box className="timeline-wrapper">
        <Timeline
          position="right"
          sx={{
            opacity: timelineOpacity ? 0.5 : 1,
          }}
        >
          <TransitionGroup>
            {filteredNodes.map((event, idx) => {
              let hideDate = false;

              if (idx > 0 && idx < filteredNodes.length - 1) {
                hideDate = areDatesWithoutTimeEqual(
                  event.created_at,
                  filteredNodes[idx + 1]?.created_at,
                );
              }

              return (
                <Collapse in key={event.id?.toString()}>
                  <TimelineItem
                    key={event.id?.toString()}
                    // @ts-ignore
                    event={event}
                    hideConnector={idx >= filteredNodes.length - 1}
                    setTimelineOpacity={setTimelineOpacity}
                    hideDate={hideDate}
                  />
                </Collapse>
              );
            })}
          </TransitionGroup>
        </Timeline>
      </Box>

      <Box className="config-panel-wrapper">
        <ConfigPanel
          possibleEventTypes={possibleEventTypes}
          selectedEventTypes={selectedEventTypes}
          setSelectedEventTypes={setSelectedEventTypes}
        />
      </Box>
    </Container>
  );
};
