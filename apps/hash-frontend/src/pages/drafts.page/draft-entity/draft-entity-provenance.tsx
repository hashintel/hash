import { Chip } from "@hashintel/design-system";
import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { Box, chipClasses, styled, Typography } from "@mui/material";
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

const DraftEntityTypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[50],
  fontWeight: 600,
  fontSize: 11,
  textTransform: "uppercase",
  marginRight: theme.spacing(0.5),
}));

export const DraftEntityProvenance: FunctionComponent<{
  entity: Entity;
  createdAt: Date;
}> = ({ entity, createdAt }) => {
  const { users } = useUsers();

  /** @todo: account for machine users */
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
    () => format(createdAt, "yyyy-MM-dd h:mma"),
    [createdAt],
  );

  return (
    <Box display="flex" alignItems="center">
      <DraftEntityTypography>By</DraftEntityTypography>
      <DraftEntityChip
        sx={{ marginRight: 1 }}
        icon={<UserIcon />}
        label={createdBy?.preferredName}
      />
      <DraftEntityTypography>at</DraftEntityTypography>
      <DraftEntityChip icon={<ClockRegularIcon />} label={formattedCreatedAt} />
    </Box>
  );
};
