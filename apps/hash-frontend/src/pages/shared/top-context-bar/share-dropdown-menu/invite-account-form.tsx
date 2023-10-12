import { AccountGroupId, AccountId } from "@local/hash-subgraph";
import { Box } from "@mui/material";
import { FunctionComponent, useCallback, useState } from "react";

import { MinimalOrg, MinimalUser } from "../../../../lib/user-and-org";
import { Button } from "../../../../shared/ui";
import { AccountSelector } from "./account-selector";

export const InviteAccountForm: FunctionComponent<{
  excludeAccountIds?: (AccountId | AccountGroupId)[];
  onInviteAccount: (account: MinimalOrg | MinimalUser) => void;
}> = ({ onInviteAccount, excludeAccountIds }) => {
  const [selectedAccount, setSelectedAccount] = useState<
    MinimalOrg | MinimalUser
  >();

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (selectedAccount) {
        onInviteAccount(selectedAccount);
      }
    },
    [selectedAccount, onInviteAccount],
  );

  return (
    <Box
      component="form"
      display="flex"
      columnGap={0.75}
      onSubmit={handleSubmit}
    >
      <AccountSelector
        excludeAccountIds={excludeAccountIds}
        onSelect={(account) => setSelectedAccount(account)}
      />
      <Button disabled={!selectedAccount} size="xs" type="submit">
        Invite
      </Button>
    </Box>
  );
};
