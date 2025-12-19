import { useMutation } from "@apollo/client";
import { TableCell, TableRow, Typography } from "@mui/material";

import type {
  RemoveUserFromOrgMutation,
  RemoveUserFromOrgMutationVariables,
} from "../../../../graphql/api-types.gen";
import { removeUserFromOrgMutation } from "../../../../graphql/queries/knowledge/org.queries";
import type { Org } from "../../../../lib/user-and-org";
import { Link } from "../../../../shared/ui/link";
import { useUserPermissionsOnEntity } from "../../../../shared/use-user-permissions-on-entity";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { SettingsTableCell } from "../../shared/settings-table-cell";
import { OrgContextMenu } from "./org-row/org-context-menu";

export const OrgRow = ({ org }: { org: Org }) => {
  const { authenticatedUser, refetch } = useAuthenticatedUser();

  const { userPermissions } = useUserPermissionsOnEntity(org.entity);
  const readonly = !userPermissions?.editMembers;

  const [removeUserFromOrg] = useMutation<
    RemoveUserFromOrgMutation,
    RemoveUserFromOrgMutationVariables
  >(removeUserFromOrgMutation);

  const leaveOrg = async () => {
    const membership = org.memberships.find(
      (option) => option.user.accountId === authenticatedUser.accountId,
    );

    if (!membership) {
      throw new Error("Membership not found");
    }

    await removeUserFromOrg({
      variables: {
        orgWebId: org.webId,
        userEntityId: membership.user.entity.entityId,
      },
    });

    void refetch();
  };

  return (
    <TableRow key={org.entity.metadata.recordId.entityId}>
      <SettingsTableCell>
        <Link
          href={`/settings/organizations/${org.shortname}/general`}
          sx={{ textDecoration: "none" }}
        >
          {org.name}
        </Link>
      </SettingsTableCell>
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
            whiteSpace: "nowrap",
          })}
        >
          @{org.shortname}
        </Typography>
      </TableCell>
      <TableCell>
        <OrgContextMenu org={org} leaveOrg={leaveOrg} readonly={readonly} />
      </TableCell>
    </TableRow>
  );
};
