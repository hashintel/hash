import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { OrgMembershipProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { TableCell, TableRow, Typography } from "@mui/material";

import { useBlockProtocolArchiveEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
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
  const { refetch } = useAuthenticatedUser();

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
      <Cell>{membership.membershipEntity.properties[responsibilityKey]}</Cell>
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
