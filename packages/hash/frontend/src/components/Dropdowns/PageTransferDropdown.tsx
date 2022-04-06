import {
  ChangeEvent,
  useEffect,
  useState,
  VFC,
  VoidFunctionComponent,
} from "react";
import { useRouter } from "next/router";
import { useMutation, useQuery } from "@apollo/client";

import { Box } from "@mui/material";
import {
  GetAccountsQuery,
  MutationTransferEntityArgs,
} from "../../graphql/apiTypes.gen";
import { transferEntityMutation } from "../../graphql/queries/entityType.queries";
import {
  getAccountPages,
  getAccounts,
} from "../../graphql/queries/account.queries";

type AccountSelectProps = {
  onChange: (account: string) => void;
  value: string;
};

export const AccountSelect: VFC<AccountSelectProps> = ({ onChange, value }) => {
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

type PageTransferDropdownType = {
  pageEntityId: string;
  accountId: string;
  setPageState: (state: "normal" | "transferring") => void;
};

export const PageTransferDropdown: VoidFunctionComponent<
  PageTransferDropdownType
> = ({ pageEntityId, accountId, setPageState }) => {
  const router = useRouter();

  const [selectedAccountId, setSelectedAccountId] = useState(accountId);

  useEffect(() => {
    setSelectedAccountId(accountId);
  }, [accountId]);

  const [transferEntity] = useMutation<MutationTransferEntityArgs>(
    transferEntityMutation,
  );

  const transferAccount = (newAccountId: string) => {
    setPageState("transferring");

    transferEntity({
      variables: {
        originalAccountId: accountId,
        entityId: pageEntityId,
        newAccountId,
      },
      refetchQueries: [
        { query: getAccountPages, variables: { accountId } },
        { query: getAccountPages, variables: { accountId: newAccountId } },
      ],
    })
      .then(() => {
        return router.replace(`/${newAccountId}/${pageEntityId}`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        setPageState("normal");
      });
  };

  return <AccountSelect value={selectedAccountId} onChange={transferAccount} />;
};
