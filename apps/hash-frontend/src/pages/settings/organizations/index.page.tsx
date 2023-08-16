import { Table, TableBody, TableHead, TableRow } from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useRef } from "react";

import { NextPageWithLayout } from "../../../shared/layout";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { getSettingsLayout } from "../shared/settings-layout";
import { OrgRow } from "./index.page/org-row";
import { Cell } from "./shared/cell";
import { OrgSettingsContainer } from "./shared/org-settings-container";

const OrganizationListPage: NextPageWithLayout = () => {
  const router = useRouter();

  const topRef = useRef<HTMLSpanElement>(null);

  const { authenticatedUser } = useAuthenticatedUser();

  if (!authenticatedUser.accountSignupComplete) {
    void router.push("/");
    return null;
  }

  return (
    <>
      <NextSeo title="Organizations" />

      <OrgSettingsContainer header={<>Organizations</>} ref={topRef}>
        <Table
          sx={{
            borderRadius: 1,
            boxShadow: "0px 1px 5px 0px rgba(27, 33, 40, 0.07)",
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
              <Cell width="100%">Organization</Cell>
              <Cell>Namespace</Cell>
              <Cell />
            </TableRow>
          </TableHead>
          <TableBody>
            {authenticatedUser.memberOf
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((org) => (
                <OrgRow key={org.accountId} org={org} />
              ))}
          </TableBody>
        </Table>
      </OrgSettingsContainer>
    </>
  );
};

OrganizationListPage.getLayout = (page) => getSettingsLayout(page);

export default OrganizationListPage;
