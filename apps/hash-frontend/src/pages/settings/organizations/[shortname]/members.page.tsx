import {
  styled,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useEffect, useRef, useState } from "react";

import { NextPageWithLayout } from "../../../../shared/layout";
import { useUserPermissionsOnEntity } from "../../../../shared/use-user-permissions-on-entity";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getSettingsLayout } from "../../shared/settings-layout";
import { Cell } from "../shared/cell";
import { OrgSettingsContainer } from "../shared/org-settings-container";
import { OrgTable } from "../shared/org-table";
import { AddMemberForm } from "./members.page/add-member-form";
import { MemberRow } from "./members.page/member-row";

const InviteNewButton = styled("button")`
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 500;
  padding: 0;
`;

const OrgMembersPage: NextPageWithLayout = () => {
  const router = useRouter();

  const topRef = useRef<HTMLSpanElement>(null);

  const { shortname } = router.query as { shortname: string };

  const { authenticatedUser } = useAuthenticatedUser();

  const [showAddMemberForm, setShowAddMemberForm] = useState(false);

  const org = authenticatedUser.memberOf.find(
    ({ org: orgOption }) => orgOption.shortname === shortname,
  )?.org;

  useEffect(() => {
    const [_, anchorTag] = router.asPath.split("#");

    if (anchorTag && anchorTag === "invite") {
      setShowAddMemberForm(true);
    }
  }, [router]);

  const { userPermissions } = useUserPermissionsOnEntity(org?.entity);
  const readonly = !userPermissions?.editMembers;

  if (!org) {
    // @todo show a 404 page
    void router.push("/settings/organizations");
    return null;
  }

  return (
    <>
      <NextSeo title={`${org.name} | Members`} />

      <OrgSettingsContainer
        header={org.name}
        sectionLabel="Members"
        ref={topRef}
      >
        <OrgTable>
          <TableHead>
            <TableRow>
              <Cell width="70%">Name</Cell>
              <Cell>Username</Cell>
              <Cell />
            </TableRow>
          </TableHead>
          <TableBody>
            {org.memberships
              .sort(
                ({ user: a }, { user: b }) =>
                  a.preferredName?.localeCompare(b.preferredName ?? "ZZZ") ?? 1,
              )
              .map((membership) => (
                <MemberRow
                  accountGroupId={org.accountGroupId}
                  key={membership.linkEntity.metadata.recordId.entityId}
                  membership={membership}
                  self={
                    membership.user.accountId === authenticatedUser.accountId
                  }
                  readonly={readonly}
                />
              ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>
                {showAddMemberForm ? (
                  <AddMemberForm org={org} />
                ) : (
                  !readonly && (
                    <InviteNewButton>
                      <Typography
                        variant="smallTextLabels"
                        color="gray.60"
                        fontWeight={600}
                        onClick={() => setShowAddMemberForm(true)}
                        sx={({ transitions }) => ({
                          "&:hover": {
                            color: "black",
                          },
                          transition: transitions.create("color"),
                        })}
                      >
                        Invite new member...
                      </Typography>
                    </InviteNewButton>
                  )
                )}
              </TableCell>
            </TableRow>
          </TableFooter>
        </OrgTable>
      </OrgSettingsContainer>
    </>
  );
};

OrgMembersPage.getLayout = (page) => getSettingsLayout(page);

export default OrgMembersPage;
