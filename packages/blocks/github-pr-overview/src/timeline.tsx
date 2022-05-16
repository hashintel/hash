import * as React from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
// eslint-disable-next-line no-restricted-imports -- false-positive frontend-specific rule
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Link from "@mui/icons-material/Link";
import Select from "@mui/material/Select";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineOppositeContent from "@mui/lab/TimelineOppositeContent";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";
import Tooltip from "@mui/material/Tooltip";
import Popover from "@mui/material/Popover";
import format from "date-fns/format";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { uniq, intersection, sortBy, startCase } from "lodash";
import { GithubIssueEvent, GithubPullRequest, GithubReview } from "./types";

const NODE_COLORS: Record<
  string,
  | "inherit"
  | "grey"
  | "primary"
  | "secondary"
  | "error"
  | "info"
  | "success"
  | "warning"
> = {
  opened: "success",
  reviewed: "primary",
  review_requested: "warning",
  ready_for_review: "info",
  closed: "error",
  merged: "secondary",
};

const addDefaultFromPossible = (availableEventTypes: string[]) => {
  return intersection(
    ["opened", "reviewed", "review_requested", "closed", "merged"],
    availableEventTypes,
  );
};

const Config: React.FunctionComponent<{
  possibleEventTypes: string[];
  selectedEventTypes: string[];
  setSelectedEventTypes: (x: any) => void;
}> = ({ possibleEventTypes, selectedEventTypes, setSelectedEventTypes }) => {
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleSelectChange = (event: any) => {
    const {
      target: { value },
    } = event;
    setSelectedEventTypes(
      // On autofill we get a stringified value.
      typeof value === "string" ? value.split(",") : value,
    );
  };

  const handleConfigButtonClick = (event: any) => {
    setAnchorEl(event.currentTarget);
  };

  const handleConfigClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "timeline-config-popover" : undefined;

  return (
    <>
      <IconButton
        aria-describedby={id}
        onClick={handleConfigButtonClick}
        style={{
          position: "absolute",
          top: 0,
          right: "0.3em",
          zIndex: 3,
        }}
      >
        <SettingsOutlinedIcon fontSize="small" />
      </IconButton>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleConfigClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
      >
        <div>
          <FormControl sx={{ m: 1, width: 300 }}>
            <Select
              multiple
              value={selectedEventTypes}
              onChange={handleSelectChange}
              renderValue={(selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={startCase(value)} />
                  ))}
                </Box>
              )}
            >
              {/* eslint-disable-next-line react/destructuring-assignment -- mistakenly thinks map is a variable that needs to be destructured */}
              {possibleEventTypes.map((eventType) => (
                <MenuItem key={eventType} value={eventType}>
                  {startCase(eventType)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
      </Popover>
    </>
  );
};

export type GithubPrTimelineProps = {
  pullRequest: GithubPullRequest;
  reviews: GithubReview[];
  events: GithubIssueEvent[];
};

export const GithubPrTimeline: React.FunctionComponent<
  GithubPrTimelineProps
> = ({ pullRequest, events, reviews }) => {
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

  const maxIdx = filteredNodes.length - 1;

  return (
    <Grid
      item
      xs={6}
      style={{
        position: "relative",
        borderRight: "2px solid grey",
      }}
    >
      <Config
        possibleEventTypes={possibleEventTypes}
        selectedEventTypes={selectedEventTypes}
        setSelectedEventTypes={setSelectedEventTypes}
      />
      <div className="timeline">
        <Timeline position="left">
          {filteredNodes.map((event, idx) => {
            const color = NODE_COLORS[event.event!] ?? "grey";
            return (
              <TimelineItem
                className="timelineItem"
                key={event.id?.toString()}
                style={{ alignContent: "right" }}
              >
                {event.created_at != null ? (
                  <TimelineOppositeContent color="text.secondary">
                    {format(new Date(event.created_at), "iii, do MMM y, HH:mm")}
                  </TimelineOppositeContent>
                ) : undefined}
                <TimelineSeparator>
                  <TimelineDot color={color} />
                  {idx < maxIdx ? <TimelineConnector /> : undefined}
                </TimelineSeparator>
                <TimelineContent>
                  <Tooltip
                    title={
                      <>
                        {event.actor?.login != null ? (
                          <span>Actor: {event.actor.login}</span>
                        ) : null}
                        {event.html_url != null &&
                        typeof event.html_url === "string" ? (
                          <>
                            <br />
                            <Button
                              startIcon={<Link />}
                              href={event.html_url}
                              variant="contained"
                              size="small"
                            >
                              Link
                            </Button>
                          </>
                        ) : null}
                      </>
                    }
                  >
                    {/* Even though this span isn't in a list, React complains about list elements needing unique keys unless 
                    we add a key here. Assuming it's because of some weird behavior of the Tooltip */}
                    <span key={`LABEL_${event.id?.toString()}`}>
                      {startCase(event.event!)}
                    </span>
                  </Tooltip>
                </TimelineContent>
              </TimelineItem>
            );
          })}
        </Timeline>
      </div>
    </Grid>
  );
};
