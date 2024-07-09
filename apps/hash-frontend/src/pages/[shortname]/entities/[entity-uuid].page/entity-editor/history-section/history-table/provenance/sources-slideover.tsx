import { faFile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type { Subgraph } from "@local/hash-subgraph";
import {
  Backdrop,
  Box,
  Slide,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  tableContainerClasses,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

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
  onClose,
  open,
  subgraph,
}: {
  event: HistoryEvent;
  onClose: () => void;
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
    <Backdrop
      open={open}
      onClick={onClose}
      sx={{
        zIndex: ({ zIndex }) => zIndex.drawer + 2,
        justifyContent: "flex-end",
      }}
    >
      <Slide in={open} direction="left">
        <Stack
          sx={{
            height: "100vh",
            overflowY: "auto",
            background: ({ palette }) => palette.common.white,
            maxWidth: { xs: "90%", md: 800, lg: 1000 },
          }}
        >
          <Box
            sx={{
              ...boxPadding,
              borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
            }}
          >
            <Typography
              variant="h5"
              sx={{ color: ({ palette }) => palette.gray[90], mb: 2 }}
            >
              {headerText}
            </Typography>
            <Stack direction="row" alignItems="center">
              <EventDetail event={event} subgraph={subgraph} />
            </Stack>
          </Box>
          <Box
            sx={{
              ...boxPadding,
              background: ({ palette }) => palette.gray[10],
              flexGrow: 1,
            }}
          >
            <Typography
              variant="h5"
              sx={{ color: ({ palette }) => palette.gray[90], mb: 2 }}
            >
              Sources
            </Typography>
            <TableContainer
              onClick={(evt) => evt.stopPropagation()}
              sx={{
                [`&.${tableContainerClasses.root}`]: { overflowY: "auto" },
              }}
            >
              <Table
                sx={[
                  ({ palette }) => ({
                    background: palette.common.white,
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
                        <Chip type sx={{ py: 0.2 }}>
                          <FontAwesomeIcon
                            icon={faFile}
                            sx={(theme) => ({
                              fontSize: 12,
                              color: theme.palette.blue[70],
                              mr: 0.6,
                            })}
                          />
                          <Box
                            component="span"
                            sx={{
                              textTransform: "capitalize",
                              fontWeight: 500,
                            }}
                          >
                            {type}
                          </Box>
                        </Chip>
                      </TableCell>
                      <TableCell
                        sx={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: ({ palette }) => palette.gray[80],
                        }}
                      >
                        {location?.name ?? "Unknown"}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: ({ palette }) => palette.gray[80],
                        }}
                      >
                        {location?.uri ? (
                          <Link
                            href={location.uri}
                            target="_blank"
                            sx={{
                              textDecoration: "none",
                              wordBreak: "break-word",
                            }}
                          >
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
            </TableContainer>
          </Box>
        </Stack>
      </Slide>
    </Backdrop>
  );
};
