import { VoidFunctionComponent } from "react";
import { useRouter } from "next/router";

import { MainComponentWrapper } from "../../components/pages/MainComponentWrapper";

export const AccountHome: VoidFunctionComponent = () => {
  const { query } = useRouter();
  const accountId = query.accountId as string;

  return (
    <MainComponentWrapper>
      <header>
        <h1>Welcome to account #{accountId}</h1>
      </header>
      <p>Please select a page from the list, or create a new page.</p>
    </MainComponentWrapper>
  );
};

export default AccountHome;
