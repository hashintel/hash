import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import {
  Container,
  Skeleton,
  styled,
  Table as MuiTable,
  TableBody,
  TableCell as MuiTableCell,
  tableCellClasses,
  TableHead,
  TableRow as MuiTableRow,
  tableRowClasses,
  Typography,
} from "@mui/material";
import {
  differenceInDays,
  differenceInMinutes,
  format,
  isThisYear,
  isToday,
} from "date-fns";
import { FunctionComponent, useCallback, useMemo } from "react";

import { useUserOrOrgShortnameByOwnedById } from "../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import { constructPageRelativeUrl } from "../lib/routes";
import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import {
  Notification,
  useNotifications,
} from "../shared/notifications-context";
import { Button, Link } from "../shared/ui";

const Table = styled(MuiTable)(({ theme }) => ({
  borderCollapse: "separate",
  borderSpacing: 0,
  background: theme.palette.common.white,
  borderRadius: "8px",
  borderColor: theme.palette.gray[30],
  borderStyle: "solid",
  borderWidth: 1,
  overflow: "hidden",
}));

const TableRow = styled(MuiTableRow)(() => ({
  [`&:last-of-type .${tableCellClasses.body}`]: {
    borderBottom: "none",
  },
  [`&:first-of-type .${tableCellClasses.head}`]: {
    "&:first-of-type": {
      borderTopLeftRadius: "8px",
    },
    "&:last-of-type": {
      borderTopRightRadius: "8px",
    },
  },
  [`&:last-of-type .${tableCellClasses.body}`]: {
    "&:first-of-type": {
      borderBottomLeftRadius: "8px",
    },
    "&:last-of-type": {
      borderBottomRightRadius: "8px",
    },
  },
}));

const TableCell = styled(MuiTableCell)(({ theme }) => ({
  whiteSpace: "nowrap",
  border: 0,
  borderStyle: "solid",
  borderColor: theme.palette.gray[20],
  borderBottomWidth: 1,
  borderRightWidth: 1,
  padding: theme.spacing(0.5, 1.5),
  [`&.${tableCellClasses.head}`]: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.palette.common.black,
  },
  [`&.${tableCellClasses.body}`]: {
    fontSize: 14,
    fontWeight: 500,
    color: theme.palette.gray[90],
  },
  "&:last-of-type": {
    borderRightWidth: 0,
  },
}));

const NotificationRow: FunctionComponent<Notification> = (notification) => {
  const { markNotificationAsRead } = useNotifications();
  const {
    kind,
    triggeredByUser,
    occurredInEntity,
    occurredInBlock,
    readAt,
    createdAt,
  } = notification;

  const ownedById = useMemo(
    () =>
      extractOwnedByIdFromEntityId(occurredInEntity.metadata.recordId.entityId),
    [occurredInEntity],
  );

  const { shortname } = useUserOrOrgShortnameByOwnedById({ ownedById });

  const pageHref = useMemo(() => {
    if (!shortname) {
      return undefined;
    }

    /** @todo: append query param if the mention was in a comment */
    return constructPageRelativeUrl({
      workspaceShortname: shortname,
      pageEntityUuid: extractEntityUuidFromEntityId(
        occurredInEntity.metadata.recordId.entityId,
      ),
      highlightedBlockEntityId: occurredInBlock.metadata.recordId.entityId,
    });
  }, [shortname, occurredInEntity, occurredInBlock]);

  const pageTitle = useMemo(() => {
    const { title } = simplifyProperties(occurredInEntity.properties);

    return title;
  }, [occurredInEntity]);

  const handleNotificationClick = useCallback(async () => {
    await markNotificationAsRead({ notification });
  }, [markNotificationAsRead, notification]);

  const humanReadableCreatedAt = useMemo(() => {
    const now = new Date();

    const numberOfMinutesAgo = differenceInMinutes(now, createdAt);

    if (numberOfMinutesAgo < 1) {
      return "Just now";
    }

    if (isToday(createdAt)) {
      if (numberOfMinutesAgo < 60) {
        return `${numberOfMinutesAgo} minute${
          numberOfMinutesAgo > 1 ? "s" : ""
        } ago`;
      }
      const numberOfHoursAgo = Math.floor(numberOfMinutesAgo / 60);
      return `${numberOfHoursAgo} hour${numberOfHoursAgo > 1 ? "s" : ""} ago`;
    }
    const numberOfDaysAgo = differenceInDays(now, createdAt);

    if (numberOfDaysAgo < 7) {
      return format(createdAt, "iiii"); // "Monday"
    }

    if (isThisYear(createdAt)) {
      return format(createdAt, "MMMM do"); // "October 27th"
    }

    return format(createdAt, "MMMM do, yyyy"); // "December 24th, 2022"
  }, [createdAt]);

  return (
    <TableRow
      sx={{
        background: readAt ? ({ palette }) => palette.gray[20] : undefined,
        opacity: readAt ? 0.6 : 1,
      }}
    >
      <TableCell
        sx={{
          [`&.${tableCellClasses.body}`]: {
            color: ({ palette }) => palette.gray[70],
          },
        }}
      >
        {humanReadableCreatedAt}
      </TableCell>
      <TableCell
        sx={{
          a: {
            fontWeight: 600,
            color: ({ palette }) => palette.blue[70],
            "&:hover": { color: ({ palette }) => palette.blue[90] },
          },
        }}
      >
        <Link noLinkStyle href={`/@${triggeredByUser.shortname}`}>
          {triggeredByUser.preferredName}
        </Link>{" "}
        {kind === "new-comment"
          ? "commented on "
          : kind === "comment-reply"
          ? "replied to your comment on "
          : kind === "page-mention"
          ? "mentioned you in "
          : "mentioned you in a comment on "}
        <Link
          noLinkStyle
          href={pageHref ?? ""}
          onClick={handleNotificationClick}
        >
          {pageTitle}
        </Link>{" "}
      </TableCell>
      <TableCell sx={{ display: "flex", columnGap: 1 }}>
        <Button href={pageHref} onClick={handleNotificationClick} size="xs">
          {kind === "new-comment" ||
          kind === "comment-reply" ||
          kind === "comment-mention"
            ? "View comment"
            : "View page"}
        </Button>
        {readAt ? null : (
          <Button
            variant="tertiary"
            size="xs"
            onClick={() => markNotificationAsRead({ notification })}
          >
            Mark as read
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
};

const InboxPage: NextPageWithLayout = () => {
  const { notifications } = useNotifications();

  return (
    <Container sx={{ paddingY: 6 }}>
      <Typography variant="h5" sx={{ marginBottom: 4 }}>
        Notifications
      </Typography>
      {notifications && notifications.length === 0 ? (
        <Typography>You don't have any notifications.</Typography>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell variant="head" sx={{ width: "auto" }}>
                When
              </TableCell>
              <TableCell variant="head" sx={{ width: "100%" }}>
                Title
              </TableCell>
              <TableCell variant="head" sx={{ width: "auto" }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody
            sx={{
              [`> .${tableRowClasses.root}:last-of-type > .${tableCellClasses.root}`]:
                {
                  borderBottomWidth: 0,
                },
            }}
          >
            {notifications ? (
              notifications.map((notification) => (
                <NotificationRow
                  key={notification.entity.metadata.recordId.entityId}
                  {...notification}
                />
              ))
            ) : (
              <TableRow>
                <TableCell>
                  <Skeleton sx={{ maxWidth: 150 }} />
                </TableCell>
                <TableCell sx={{ display: "flex", columnGap: 1 }}>
                  <Skeleton sx={{ width: 50 }} />
                  <Skeleton sx={{ width: 50 }} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </Container>
  );
};

InboxPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default InboxPage;
