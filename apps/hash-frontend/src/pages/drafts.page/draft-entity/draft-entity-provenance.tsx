import { WandMagicSparklesIcon } from "@hashintel/design-system";
import { Entity } from "@local/hash-subgraph";
import { Box, styled, Typography } from "@mui/material";
import { format } from "date-fns";
import { FunctionComponent, useMemo } from "react";

import { ClockRegularIcon } from "../../../shared/icons/clock-regular-icon";
import { UserIcon } from "../../../shared/icons/user-icon";
import { useActors } from "../../../shared/use-actors";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { DraftEntityChip } from "./draft-entity-chip";

const DraftEntityTypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[50],
  fontWeight: 600,
  fontSize: 11,
  textTransform: "uppercase",
  marginRight: theme.spacing(0.5),
}));

export const DraftEntityProvenance: FunctionComponent<{
  entity: Entity;
}> = ({ entity }) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const editionCreatedById = entity.metadata.provenance.edition.createdById;

  const { actors } = useActors({
    accountIds: [editionCreatedById],
  });

  /** @todo: account for machine users */
  const createdBy = useMemo(
    () => actors?.find(({ accountId }) => accountId === editionCreatedById),
    [actors, editionCreatedById],
  );

  const createdAt = useMemo(
    () => new Date(entity.metadata.provenance.createdAtDecisionTime),
    [entity],
  );

  const formattedCreatedAt = useMemo(
    () => format(createdAt, "yyyy-MM-dd h:mma").toLowerCase(),
    [createdAt],
  );

  return (
    <Box display="flex" alignItems="center">
      <DraftEntityTypography
        sx={({ breakpoints }) => ({
          [breakpoints.down(1300)]: {
            display: "none",
          },
        })}
      >
        By
      </DraftEntityTypography>
      <DraftEntityChip
        sx={{ marginRight: 1 }}
        icon={
          createdBy &&
          "displayName" in createdBy &&
          createdBy.displayName === "HASH AI" ? (
            <WandMagicSparklesIcon />
          ) : (
            <UserIcon />
          )
        }
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
      <DraftEntityTypography
        sx={({ breakpoints }) => ({
          [breakpoints.down(1300)]: {
            display: "none",
          },
        })}
      >
        at
      </DraftEntityTypography>
      <DraftEntityChip icon={<ClockRegularIcon />} label={formattedCreatedAt} />
    </Box>
  );
};
