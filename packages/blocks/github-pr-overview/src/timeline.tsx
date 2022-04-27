import * as React from "react";
import moment from "moment";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
/* eslint-disable-next-line -- says the import of Button is restricted */
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";
import Tooltip from "@mui/material/Tooltip";
import Popover from "@mui/material/Popover";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { uniq, intersection } from "lodash";
import { GithubIssueEvent, GithubPullRequest, isDefined } from "./types";

export type GithubPrTimelineProps = {
  pullRequest: GithubPullRequest;
  events: GithubIssueEvent[];
};

const NODE_COLORS: {
  [key: string]:
    | "inherit"
    | "grey"
    | "primary"
    | "secondary"
    | "error"
    | "info"
    | "success"
    | "warning";
} = {
  opened: "info",
  reviewed: "primary",
  review_requested: "warning",
  ready_for_review: "secondary",
  closed: "error",
  merged: "success",
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
      <Button
        aria-describedby={id}
        onClick={handleConfigButtonClick}
        style={{
          position: "absolute",
          top: "1em",
          left: "1em",
          zIndex: 3,
        }}
        variant="contained"
      >
        <SettingsOutlinedIcon fontSize="small" />
      </Button>
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
                    <Chip key={value} label={value} />
                  ))}
                </Box>
              )}
            >
              {/* eslint-disable-next-line react/destructuring-assignment -- mistakenly thinks map is a variable that needs to be destructured */}
              {possibleEventTypes.map((eventType) => (
                <MenuItem key={eventType} value={eventType}>
                  {eventType}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
      </Popover>
    </>
  );
};

export const GithubPrTimeline: React.FunctionComponent<
  GithubPrTimelineProps
> = ({ pullRequest, events }) => {
  // there isn't an issue event for opening so we manually make an object to append to the timeline
  const openedEvent = {
    id: pullRequest.node_id,
    event: "opened",
    created_at: pullRequest.created_at,
  };
  const nodes = [openedEvent, ...events];
  const maxIdx = nodes.length - 1;

  const possibleEventTypes = uniq(
    nodes.map((event) => event.event).filter(isDefined),
  );

  // const [configOpen, setConfigOpen] = React.useState(false);
  const [selectedEventTypes, setSelectedEventTypes] = React.useState(
    addDefaultFromPossible(possibleEventTypes),
  );

  return (
    <Grid item xs={4} style={{ position: "relative" }}>
      <Config
        possibleEventTypes={possibleEventTypes}
        selectedEventTypes={selectedEventTypes}
        setSelectedEventTypes={setSelectedEventTypes}
      />
      <div className="timeline">
        <Timeline position="left">
          {nodes
            .filter(
              (event) =>
                event.event != null && selectedEventTypes.includes(event.event),
            )
            .map((event, idx) => {
              const color = NODE_COLORS[event.event!] ?? "grey";
              return (
                <TimelineItem key={event.id?.toString()}>
                  <TimelineSeparator>
                    <TimelineDot color={color} />
                    {idx < maxIdx ? <TimelineConnector /> : undefined}
                  </TimelineSeparator>
                  <TimelineContent>
                    <Tooltip
                      title={moment(event.created_at).format(
                        "dddd, MMMM Do YYYY, HH:mm",
                      )}
                    >
                      {/* This key seems necessary because of some weird behavior of the Tooltip */}
                      <span key={`LABEL_${event.id?.toString()}`}>
                        {event.event}
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
