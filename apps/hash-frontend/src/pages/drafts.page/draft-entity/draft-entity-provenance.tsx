import { Chip } from "@hashintel/design-system";
import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { chipClasses, styled, Typography } from "@mui/material";
import { format } from "date-fns";
import { FunctionComponent, useMemo } from "react";

import { useUsers } from "../../../components/hooks/use-users";
import { ClockRegularIcon } from "../../../shared/icons/clock-regular-icon";
import { UserIcon } from "../../../shared/icons/user-icon";

const DraftEntityChip = styled(Chip)(({ theme }) => ({
  color: theme.palette.common.black,
  background: theme.palette.common.white,
  borderColor: theme.palette.gray[30],
  fontWeight: 500,
  fontSize: 12,
  textTransform: "none",
  [`& .${chipClasses.icon}`]: {
    color: theme.palette.gray[50],
  },
  [`& .${chipClasses.label}`]: {
    paddingTop: theme.spacing(0.25),
    paddingBottom: theme.spacing(0.25),
  },
}));

export const DraftEntityProvenance: FunctionComponent<{ entity: Entity }> = ({
  entity,
}) => {
  const { users } = useUsers();

  const createdBy = useMemo(
    () =>
      users?.find(
        ({ accountId }) =>
          accountId ===
          extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
      ),
    [users, entity],
  );

  const formattedCreatedAt = useMemo(
    () =>
      format(
        new Date(entity.metadata.temporalVersioning.decisionTime.start.limit),
        "yyyy-MM-dd h:mma",
      ),
    [entity],
  );

  return (
    <Typography
      sx={{
        color: ({ palette }) => palette.gray[50],
        fontWeight: 600,
        fontSize: 11,
        textTransform: "uppercase",
        [`.${chipClasses.root}`]: {
          position: "relative",
          top: -1,
        },
      }}
    >
      By{" "}
      <DraftEntityChip icon={<UserIcon />} label={createdBy?.preferredName} />{" "}
      at{" "}
      <DraftEntityChip icon={<ClockRegularIcon />} label={formattedCreatedAt} />
    </Typography>
  );
};
