import { TextField } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { OrgMembershipProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { BaseUrl } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, TableCell, TableRow, Typography } from "@mui/material";
import { FormEvent, useRef, useState } from "react";

import { useBlockProtocolArchiveEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useBlockProtocolUpdateEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { Org } from "../../../../../lib/user-and-org";
import { Link } from "../../../../../shared/ui/link";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";
import { Cell } from "./cell";
import { MemberContextMenu } from "./member-row/member-context-menu";

const responsibilityKey = extractBaseUrl(
  types.propertyType.responsibility.propertyTypeId,
) as keyof OrgMembershipProperties;

export const MemberRow = ({
  membership,
  self,
}: {
  membership: Org["memberships"][0];
  self: boolean;
}) => {
  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const { refetch } = useAuthenticatedUser();

  const responsibilityInputRef = useRef<HTMLInputElement>(null);

  const initialResponsibility =
    membership.membershipEntity.properties[responsibilityKey];

  const [draftResponsibility, setDraftResponsibility] = useState(
    initialResponsibility,
  );

  const updateResponsibility = async (event: FormEvent) => {
    event.preventDefault();

    if (draftResponsibility === initialResponsibility) {
      return;
    }

    await updateEntity({
      data: {
        entityId: membership.membershipEntity.metadata.recordId.entityId,
        entityTypeId: membership.membershipEntity.metadata.entityTypeId,
        properties: {
          ...membership.membershipEntity.properties,
          [responsibilityKey as BaseUrl]: draftResponsibility,
        },
      },
    });
    void refetch();

    responsibilityInputRef.current?.blur();
  };

  const removeFromOrg = async () => {
    await archiveEntity({
      data: {
        entityId: membership.membershipEntity.metadata.recordId.entityId,
      },
    });
    void refetch();
  };

  return (
    <TableRow key={membership.membershipEntity.metadata.recordId.entityId}>
      <Cell>
        <Link
          href={`/@${membership.user.shortname}`}
          sx={{ textDecoration: "none" }}
        >
          {membership.user.preferredName}
        </Link>
      </Cell>
      <Cell>
        <Box component="form" onSubmit={updateResponsibility}>
          <TextField
            onBlur={updateResponsibility}
            onChange={(event) => setDraftResponsibility(event.target.value)}
            inputRef={responsibilityInputRef}
            size="xs"
            sx={{ "&:not(:hover) *": { border: "none" } }}
            value={draftResponsibility}
          />
        </Box>
      </Cell>
      <TableCell>
        <Typography
          variant="smallTextLabels"
          sx={({ palette }) => ({
            background: palette.gray[10],
            borderRadius: 10,
            lineHeight: 1,
            px: "10px",
            py: "4px",
            color: palette.gray[60],
            fontWeight: 500,
          })}
        >
          @{membership.user.shortname}
        </Typography>
      </TableCell>
      <TableCell>
        <MemberContextMenu removeFromOrg={removeFromOrg} self={self} />
      </TableCell>
    </TableRow>
  );
};
