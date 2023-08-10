import {
  styled,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useRef, useState } from "react";

import { NextPageWithLayout } from "../../../../shared/layout";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getSettingsLayout } from "../../shared/settings-layout";
import { Cell } from "../shared/cell";
import { OrgSettingsContainer } from "../shared/org-settings-container";
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
    (orgOption) => orgOption.shortname === shortname,
  );

  if (!org) {
    // @todo show a 404 page
    void router.push("/");
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
        <Table
          sx={{
            borderRadius: 1,
            "th, td": {
              padding: "12px 16px",
              "&:first-of-type": {
                paddingLeft: "24px",
              },
              "&:last-of-type": {
                paddingRight: "24px",
              },
            },
          }}
        >
          <TableHead
            sx={({ palette }) => ({
              borderBottom: `1px solid ${palette.gray[20]}`,
            })}
          >
            <TableRow>
              <Cell width="70%">Name</Cell>
              <Cell>Username</Cell>
              <Cell />
            </TableRow>
          </TableHead>
          <TableBody>
            {org.memberships
              .sort(
                (a, b) =>
                  a.user.preferredName?.localeCompare(
                    b.user.preferredName ?? "ZZZ",
                  ) ?? 1,
              )
              .map((membership) => (
                <MemberRow
                  key={membership.membershipEntity.metadata.recordId.entityId}
                  membership={membership}
                  self={
                    membership.user.accountId === authenticatedUser.accountId
                  }
                />
              ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>
                {showAddMemberForm ? (
                  <AddMemberForm org={org} />
                ) : (
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
                )}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </OrgSettingsContainer>
    </>
  );
};

OrgMembersPage.getLayout = (page) => getSettingsLayout(page);

export default OrgMembersPage;
