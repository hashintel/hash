import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { TableBody, TableHead, TableRow } from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useRef } from "react";

import type { NextPageWithLayout } from "../../../shared/layout";
import { Button } from "../../../shared/ui/button";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { getSettingsLayout } from "../shared/settings-layout";
import { SettingsPageContainer } from "../shared/settings-page-container";
import { OrgRow } from "./index.page/org-row";
import { Cell } from "./shared/cell";
import { OrgTable } from "./shared/org-table";

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

      <SettingsPageContainer
        topRightElement={
          <Button
            href="/settings/organizations/new"
            size="small"
            variant="tertiary"
          >
            Create organization
            <FontAwesomeIcon
              icon={faPlus}
              sx={({ palette }) => ({ fill: palette.gray[50], ml: 3 })}
            />
          </Button>
        }
        heading={<>Organizations</>}
        ref={topRef}
      >
        <OrgTable>
          <TableHead>
            <TableRow>
              <Cell width="100%">Organization</Cell>
              <Cell>Namespace</Cell>
              <Cell />
            </TableRow>
          </TableHead>
          <TableBody>
            {authenticatedUser.memberOf
              .sort(({ org: a }, { org: b }) => a.name.localeCompare(b.name))
              .map(({ org }) => (
                <OrgRow key={org.accountGroupId} org={org} />
              ))}
          </TableBody>
        </OrgTable>
      </SettingsPageContainer>
    </>
  );
};

OrganizationListPage.getLayout = (page) => getSettingsLayout(page);

export default OrganizationListPage;
