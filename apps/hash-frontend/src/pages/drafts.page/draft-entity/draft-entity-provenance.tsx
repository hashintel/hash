import { Chip } from "@hashintel/design-system";
import { Entity } from "@local/hash-subgraph";
import { Box, chipClasses, styled, Typography } from "@mui/material";
import { format } from "date-fns";
import { FunctionComponent, useMemo } from "react";

import { ClockRegularIcon } from "../../../shared/icons/clock-regular-icon";
import { UserIcon } from "../../../shared/icons/user-icon";
import { useActors } from "../../../shared/use-actors";
import { useAuthenticatedUser } from "../../shared/auth-info-context";

const DraftEntityChip = styled(Chip)(({ theme }) => ({
  color: theme.palette.common.black,
  background: theme.palette.common.white,
  borderColor: theme.palette.gray[30],
  fontWeight: 500,
  fontSize: 12,
  textTransform: "none",
  [`& .${chipClasses.icon}`]: {
    marginLeft: theme.spacing(1.25),
    color: theme.palette.gray[50],
  },
  [`& .${chipClasses.label}`]: {
    padding: theme.spacing(0.5, 1.25),
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
  const { authenticatedUser } = useAuthenticatedUser();

  const recordCreatedById = entity.metadata.provenance.recordCreatedById;

  const { actors } = useActors({
    accountIds: [recordCreatedById],
  });

  /** @todo: account for machine users */
  const createdBy = useMemo(
    () => actors?.find(({ accountId }) => accountId === recordCreatedById),
    [actors, recordCreatedById],
  );

  const formattedCreatedAt = useMemo(
    () => format(createdAt, "yyyy-MM-dd h:mma").toLowerCase(),
    [createdAt],
  );

  return (
    <Box display="flex" alignItems="center">
      <DraftEntityTypography>By</DraftEntityTypography>
      <DraftEntityChip
        sx={{ marginRight: 1 }}
        icon={<UserIcon />}
        label={
          createdBy
            ? createdBy.accountId === authenticatedUser.accountId
              ? "Me"
              : "displayName" in createdBy
                ? createdBy.displayName
                : createdBy.preferredName
            : ""
        }
      />
      <DraftEntityTypography>at</DraftEntityTypography>
      <DraftEntityChip icon={<ClockRegularIcon />} label={formattedCreatedAt} />
    </Box>
  );
};
