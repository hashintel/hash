/* eslint-disable canonical/filename-no-index -- @todo rename file */

import Timeline, { timelineClasses } from "@mui/lab/Timeline";
import { BoxProps, Collapse, styled } from "@mui/material";
import Box from "@mui/material/Box";
import { intersection, sortBy, uniq } from "lodash";
import { FunctionComponent, useMemo, useState } from "react";
import { TransitionGroup } from "react-transition-group";

import {
  GithubIssueEventEntityType,
  GithubPullRequestEntityType,
  GithubReviewEntityType,
} from "../types";
import { ConfigPanel } from "./config-panel";
import { TimelineItem } from "./timeline-item";

const Container = styled(({ children, ...props }: BoxProps) => (
  <Box {...props}>{children}</Box>
))(({ theme }) => ({
  backgroundColor: theme.palette.gray[10],
  borderRadius: "0 0 6px 6px",
  position: "relative",
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",

  [theme.breakpoints.down("sm")]: {
    flexDirection: "column-reverse",
  },

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
    height: 580,
    position: "relative",
    overflowY: "scroll",
    flex: 1,

    [theme.breakpoints.down("sm")]: {
      height: "auto",
    },
  },

  [`.${timelineClasses.root}`]: {
    maxWidth: 480,
    paddingTop: 30,
    paddingBottom: 100,
    marginLeft: 96,
    marginRight: 96,

    [theme.breakpoints.down("md")]: {
      marginLeft: 48,
      marginRight: 48,
    },
  },

  ".config-panel-wrapper": {
    paddingTop: 16,
    position: "absolute",
    right: 16,
    top: 0,

    [theme.breakpoints.down("sm")]: {
      position: "static",
    },
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

export const GithubPrTimeline: FunctionComponent<GithubPrTimelineProps> = ({
  pullRequest,
  events,
  reviews,
}) => {
  const [timelineOpacity, setTimelineOpacity] = useState(false);

  const nodes = useMemo(() => {
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

  const possibleEventTypes = useMemo(
    () => uniq(nodes.map((event) => event.event!)),
    [nodes],
  );

  const [selectedEventTypes, setSelectedEventTypes] = useState(
    addDefaultFromPossible(possibleEventTypes),
  );

  const filteredNodes = useMemo(
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
              if (!event.event) {
                return null;
              }

              let hideDate = false;

              if (idx > 0 && idx < filteredNodes.length - 1) {
                hideDate = areDatesWithoutTimeEqual(
                  event.created_at,
                  filteredNodes[idx + 1]?.created_at,
                );
              }

              const eventProp = {
                id: event.id?.toString(),
                event: event.event,
                created_at: event.created_at,
                html_url: event.html_url as string,
                actor: {
                  avatar_url: event.actor?.avatar_url,
                  login: event.actor?.login ?? "User",
                },
              };

              return (
                <Collapse in key={eventProp.id}>
                  <TimelineItem
                    key={eventProp.id}
                    event={eventProp}
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
