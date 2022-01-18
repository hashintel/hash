import { VoidFunctionComponent } from "react";
import { useQuery } from "@apollo/client";

import { GetAccountsQuery } from "../../../graphql/apiTypes.gen";
import { getAccounts } from "../../../graphql/queries/account.queries";

import styles from "./PageSidebar.module.scss";

type AccountSelectProps = {
  onChange: (account: string) => void;
  value: string;
};

export const AccountSelect: VoidFunctionComponent<AccountSelectProps> = ({
  onChange,
  value,
}) => {
  const { data } = useQuery<GetAccountsQuery>(getAccounts);

  return (
    <select
      className={styles.AccountSelect}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {data?.accounts.map((account) => (
        <option key={account.entityId} value={account.entityId}>
          {account.properties.shortname}
        </option>
      ))}
    </select>
  );
};
