import { VoidFunctionComponent } from "react";
import { useRouter } from "next/router";

import { MainContentWrapper } from "../../components/layout/MainContentWrapper";
import { useUser } from "../../components/hooks/useUser";
import { useOrgs } from "../../components/hooks/useOrgs";
import { Link } from "../../components/Link";

export const AccountHome: VoidFunctionComponent = () => {
  const { query } = useRouter();
  const { user } = useUser();
  const { data: orgs } = useOrgs();
  const accountId = query.accountId as string;

  if (!user) {
    return (
      <MainContentWrapper>
        <h2>
          You must be{" "}
          <Link href="/login" noLinkStyle>
            <a style={{ fontWeight: "700" }}>logged in</a>
          </Link>{" "}
          to access this workspace.
        </h2>
      </MainContentWrapper>
    );
  }

  const ownWorkspace = accountId === user.accountId;

  const thisOrg = ownWorkspace
    ? undefined
    : orgs.find((org) => org.entityId === accountId);

  if (!ownWorkspace && !thisOrg) {
    return (
      <MainContentWrapper>
        <h2>This workspace does not exist or you do not have access to it.</h2>
      </MainContentWrapper>
    );
  }

  const workspaceName = ownWorkspace ? "your" : `${thisOrg!.name}'s`;

  return (
    <MainContentWrapper>
      <header style={{ marginTop: "1.5rem" }}>
        <h1>
          <strong>Hi, {user.properties.preferredName}!</strong>
        </h1>
        <h2>Welcome to {workspaceName} workspace.</h2>
      </header>
      <p style={{ fontSize: "1.2rem" }}>
        Please select a page from the list, or create a new page.
      </p>
    </MainContentWrapper>
  );
};

export default AccountHome;
