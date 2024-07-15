import { faFile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type { SourceProvenance } from "@local/hash-graph-client";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Subgraph } from "@local/hash-subgraph";
import { splitEntityId } from "@local/hash-subgraph";
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

import { useUserOrOrgShortnameByOwnedById } from "../../../../../../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import { Link } from "../../../../../../../../shared/ui/link";
import { Cell } from "../../../../../../../settings/organizations/shared/cell";
import { ValueChip } from "../../../../../../../shared/value-chip";
import type { HistoryEvent } from "../../shared/types";
import { EventDetail } from "../shared/event-detail";

const boxPadding = {
  px: 4,
  py: 3,
};

const SourceRow = ({ source }: { source: SourceProvenance }) => {
  const { entityId, location, type } = source;

  const [ownedById, entityUuid] = source.entityId
    ? splitEntityId(entityId as EntityId)
    : [null, null];

  const { shortname: entityOwningShortname } = useUserOrOrgShortnameByOwnedById(
    { ownedById },
  );

  const hashMirrorUrl =
    entityOwningShortname && entityUuid
      ? `/@${entityOwningShortname}/entities/${entityUuid}`
      : undefined;

  const sourceUrl = hashMirrorUrl ?? location?.uri;

  return (
    <TableRow>
      <TableCell>
        <ValueChip type sx={{ py: 0.2 }}>
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
        </ValueChip>
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
        {sourceUrl ? (
          <Link
            href={sourceUrl}
            target="_blank"
            sx={{
              textDecoration: "none",
              wordBreak: "break-word",
            }}
          >
            {hashMirrorUrl ? "HASH Backup" : location?.uri}
          </Link>
        ) : (
          "Unknown"
        )}
      </TableCell>
    </TableRow>
  );
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
                  {sources.map((source, index) => {
                    return (
                      <SourceRow
                        key={source.location?.uri ?? index}
                        source={source}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Stack>
      </Slide>
    </Backdrop>
  );
};
