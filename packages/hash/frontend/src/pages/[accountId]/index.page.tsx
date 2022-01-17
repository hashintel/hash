import { VoidFunctionComponent } from "react";
import { useRouter } from "next/router";

import { MainContentWrapper } from "../../components/layout/MainContentWrapper";

export const AccountHome: VoidFunctionComponent = () => {
  const { query } = useRouter();
  const accountId = query.accountId as string;

  return (
    <MainContentWrapper>
      <header>
        <h1>Welcome to account #{accountId}</h1>
      </header>
      <p>Please select a page from the list, or create a new page.</p>
    </MainContentWrapper>
  );
};

export default AccountHome;
