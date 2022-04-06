import { VoidFunctionComponent, ChangeEvent } from "react";
import { useQuery } from "@apollo/client";
import { Box } from "@mui/material";

import { GetAccountsQuery } from "../../../graphql/apiTypes.gen";
import { getAccounts } from "../../../graphql/queries/account.queries";

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
    <Box
      component="select"
      sx={{
        padding: "8px 15px",
        border: "1px solid lightgray",
        width: 120,
        borderRadius: "4px",
      }}
      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
        onChange(event.target.value)
      }
      value={value}
    >
      {data?.accounts.map((account) => (
        <option key={account.entityId} value={account.entityId}>
          {account.properties.shortname}
        </option>
      ))}
    </Box>
  );
};
