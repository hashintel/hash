import { useMutation } from "@apollo/client";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Entity, EntityTypeWithMetadata } from "@local/hash-subgraph";
import { Box, Container, Typography } from "@mui/material";
import { formatDistance } from "date-fns";
import { FunctionComponent, useCallback, useMemo } from "react";

import { useArchivePage } from "../../../components/hooks/use-archive-page";
import { useUsers } from "../../../components/hooks/use-users";
import {
  UnarchiveEntityTypeMutation,
  UnarchiveEntityTypeMutationVariables,
} from "../../../graphql/api-types.gen";
import { unarchiveEntityTypeMutation } from "../../../graphql/queries/ontology/entity-type.queries";
import { useFetchEntityTypes } from "../../../shared/entity-types-context/hooks";
import { BoxArchiveIcon } from "../../../shared/icons/box-archive-icon";
import { CalendarIcon } from "../../../shared/icons/calendar-icon";
import { UserIcon } from "../../../shared/icons/user-icon";
import { isEntityPageEntity } from "../../../shared/is-of-type";
import { Button, Link } from "../../../shared/ui";
import { isItemEntityType } from "./util";

type ArchivedItemBannerProps = {
  item: Entity | EntityTypeWithMetadata;
  onUnarchived: () => void;
};

export const ArchivedItemBanner: FunctionComponent<ArchivedItemBannerProps> = ({
  item,
  onUnarchived,
}) => {
  const { users } = useUsers();

  const refetchEntityTypes = useFetchEntityTypes();

  const [unarchiveEntityType] = useMutation<
    UnarchiveEntityTypeMutation,
    UnarchiveEntityTypeMutationVariables
  >(unarchiveEntityTypeMutation, {});

  const { unarchivePage } = useArchivePage();

  const handleUnarchive = useCallback(async () => {
    if (isItemEntityType(item)) {
      await unarchiveEntityType({
        variables: { entityTypeId: item.schema.$id },
      });
      await refetchEntityTypes();
    } else if (isEntityPageEntity(item)) {
      await unarchivePage(item.metadata.recordId.entityId);
    } else {
      throw new Error("Unarchiving entities is not yet supported.");
    }
    onUnarchived();
  }, [
    item,
    refetchEntityTypes,
    onUnarchived,
    unarchiveEntityType,
    unarchivePage,
  ]);

  const archivedByAccountId = useMemo(() => {
    if (isItemEntityType(item)) {
      return item.metadata.provenance.archivedById!;
    } else if (isEntityPageEntity(item)) {
      return item.metadata.provenance.edition.createdById;
    } else {
      throw new Error("Archived entities are not yet supported.");
    }
  }, [item]);

  const archivedByUser =
    users && users.find(({ accountId }) => archivedByAccountId === accountId);

  const archivedAt = useMemo(
    () =>
      new Date(
        isItemEntityType(item)
          ? item.metadata.temporalVersioning.transactionTime.end.kind ===
            "exclusive"
            ? item.metadata.temporalVersioning.transactionTime.end.limit
            : 0
          : item.metadata.temporalVersioning.decisionTime.start.limit,
      ),
    [item],
  );

  const timeSinceArchived = useMemo(
    () => formatDistance(archivedAt, new Date()),
    [archivedAt],
  );

  const archivedAtTimestamp = useMemo(() => {
    const year = archivedAt.getUTCFullYear();
    const month = String(archivedAt.getUTCMonth() + 1).padStart(2, "0"); // Months are 0-indexed
    const day = String(archivedAt.getUTCDate()).padStart(2, "0");
    const hours = String(archivedAt.getUTCHours()).padStart(2, "0");
    const minutes = String(archivedAt.getUTCMinutes()).padStart(2, "0");
    const seconds = String(archivedAt.getUTCSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
  }, [archivedAt]);

  const isBlockPage = useMemo(
    () => !isItemEntityType(item) && isEntityPageEntity(item),
    [item],
  );

  return (
    <Box
      sx={({ palette }) => ({
        background: palette.gray[10],
      })}
    >
      <Container
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          py: 1,
          maxWidth: {
            md: isBlockPage ? 860 : undefined,
          },
        }}
      >
        <Typography sx={{ fontSize: 14 }}>
          <BoxArchiveIcon
            sx={{
              fontSize: 14,
              position: "relative",
              top: 1,
              marginRight: 1.5,
              color: ({ palette }) => palette.gray[60],
            }}
          />
          <strong>
            This {isItemEntityType(item) ? "type" : "page"} was archived
          </strong>
          {archivedByUser ? (
            <>
              {" by "}
              <Link
                href={`/@${archivedByUser.shortname}`}
                sx={{
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                <UserIcon
                  sx={{
                    fontSize: 14,
                    position: "relative",
                    top: 1,
                    marginRight: 0.75,
                  }}
                />
                {archivedByUser.preferredName}
              </Link>
            </>
          ) : null}
          {" at "}
          <Box component="span">
            <CalendarIcon
              sx={{
                fontSize: 14,
                position: "relative",
                top: 1,
                marginRight: 0.75,
              }}
            />
            <strong>{archivedAtTimestamp}</strong> ({timeSinceArchived} ago).
          </Box>
        </Typography>
        <Button
          variant="secondary"
          sx={({ palette }) => ({
            marginLeft: 1.5,
            minWidth: 0,
            minHeight: 0,
            paddingY: 0.5,
            paddingX: 2,
            background: palette.common.white,
            borderColor: palette.gray[30],
            color: palette.common.black,
            fontWeight: 400,
            fontSize: 14,
            "&:hover": {
              background: palette.blue[20],
              borderColor: palette.blue[50],
              color: palette.blue[100],
              "& svg": {
                color: palette.blue[50],
              },
            },
          })}
          startIcon={
            <FontAwesomeIcon
              sx={{ fontSize: 14, color: ({ palette }) => palette.gray[50] }}
              icon={faRotateRight}
            />
          }
          onClick={handleUnarchive}
        >
          {`Restore ${
            isItemEntityType(item)
              ? "type"
              : isEntityPageEntity(item)
                ? "page"
                : "entity"
          }`}
        </Button>
      </Container>
    </Box>
  );
};
