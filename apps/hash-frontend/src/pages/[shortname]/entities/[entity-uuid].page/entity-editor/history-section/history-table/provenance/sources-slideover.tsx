import type { Subgraph } from "@local/hash-subgraph";
import {
  Box,
  Slide,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { PageIcon } from "../../../../../../../../components/page-icon";
import { Link } from "../../../../../../../../shared/ui/link";
import { Cell } from "../../../../../../../settings/organizations/shared/cell";
import type { HistoryEvent } from "../../shared/types";
import { Chip } from "../shared/chip";
import { EventDetail } from "../shared/event-detail";

const boxPadding = {
  px: 4,
  py: 3,
};

export const SourcesSlideover = ({
  event,
  open,
  subgraph,
}: {
  event: HistoryEvent;
  open: boolean;
  subgraph: Subgraph;
}) => {
  let headerText;
  switch (event.type) {
    case "created":
      headerText = "Entity Created";
      break;
    case "property-update":
      headerText = "Attribute Updated";
      break;
    case "type-update":
      headerText = "Type Updated";
      break;
  }

  const sources =
    (event.type === "property-update"
      ? event.provenance.property?.sources
      : event.provenance.edition.sources) ?? [];

  return (
    <Slide in={open} direction="left">
      <Box>
        <Box sx={boxPadding}>
          <Typography
            variant="h5"
            sx={{ color: ({ palette }) => palette.gray[90] }}
          >
            {headerText}
          </Typography>
          <EventDetail event={event} subgraph={subgraph} />
        </Box>
        <Box
          sx={{ ...boxPadding, background: ({ palette }) => palette.blue[10] }}
        >
          <Typography
            variant="h5"
            sx={{ color: ({ palette }) => palette.gray[90] }}
          >
            Sources
          </Typography>
          <Table
            sx={[
              ({ palette }) => ({
                borderRadius: 1,
                boxShadow: ({ boxShadows }) => boxShadows.xs,
                "th, td": {
                  padding: "12px 16px",
                  "&:first-of-type": {
                    paddingLeft: "24px",
                  },
                  "&:last-of-type": {
                    paddingRight: "24px",
                  },
                },
                th: {
                  borderBottom: `1px solid ${palette.gray[20]}`,
                },
              }),
            ]}
          >
            <TableHead>
              <TableRow>
                <Cell>Type</Cell>
                <Cell>Title</Cell>
                <Cell>Location</Cell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map(({ type, location }, index) => (
                <TableRow key={location?.uri ?? index}>
                  <TableCell>
                    <Chip type>
                      <PageIcon
                        sx={{
                          fill: ({ palette }) => palette.blue[70],
                          fontSize: 12,
                          mr: 1,
                        }}
                      />{" "}
                      {type}
                    </Chip>
                  </TableCell>
                  <TableCell>{location?.name ?? "Unknown"}</TableCell>
                  <TableCell>
                    {location?.uri ? (
                      <Link href={location.uri} target="_blank">
                        {location.uri}
                      </Link>
                    ) : (
                      "Unknown"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Slide>
  );
};
