import { Autocomplete, Avatar } from "@hashintel/design-system";
import type { AccountGroupId, AccountId } from "@local/hash-subgraph";
import {
  autocompleteClasses,
  Box,
  outlinedInputClasses,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import { useOrgs } from "../../../../components/hooks/use-orgs";
import { useOrgsWithLinks } from "../../../../components/hooks/use-orgs-with-links";
import { useUsers } from "../../../../components/hooks/use-users";
import { useUsersWithLinks } from "../../../../components/hooks/use-users-with-links";
import type {
  MinimalOrg,
  MinimalUser,
  Org,
  User,
} from "../../../../lib/user-and-org";
import { Button } from "../../../../shared/ui";
import { getImageUrlFromEntityProperties } from "../../get-image-url-from-properties";

export const InviteAccountForm: FunctionComponent<{
  excludeAccountIds?: (AccountId | AccountGroupId)[];
  onInviteAccount: (account: MinimalOrg | MinimalUser) => void;
}> = ({ onInviteAccount, excludeAccountIds }) => {
  const [selectedAccount, setSelectedAccount] = useState<
    User | MinimalUser | Org | MinimalOrg | null
  >(null);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { users: minimalUsers } = useUsers();
  const { orgs: minimalOrgs } = useOrgs();

  const { orgs } = useOrgsWithLinks({
    orgAccountGroupIds: minimalOrgs?.map((org) => org.accountGroupId),
  });
  const { users } = useUsersWithLinks({
    userAccountIds: minimalUsers?.map((user) => user.accountId),
  });

  const options = useMemo(
    () =>
      [...(users ?? minimalUsers ?? []), ...(orgs ?? minimalOrgs ?? [])].filter(
        (account) =>
          !excludeAccountIds ||
          !excludeAccountIds.includes(
            account.kind === "user"
              ? account.accountId
              : account.accountGroupId,
          ),
      ),
    [excludeAccountIds, orgs, minimalOrgs, users, minimalUsers],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (selectedAccount) {
        onInviteAccount(selectedAccount);
        setSelectedAccount(null);
        setSearch("");
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
      <Autocomplete<User | MinimalUser | Org | MinimalOrg | null, false, false>
        inputProps={{
          endAdornment: null,
        }}
        autoFocus={false}
        options={options}
        inputPlaceholder="Add a user or organization..."
        open={open}
        disableClearable={false}
        onOpen={() => setOpen(true)}
        onClose={(_, reason) => {
          if (reason !== "toggleInput") {
            setOpen(false);
          }
        }}
        inputValue={search}
        value={selectedAccount}
        onInputChange={(_, value) => setSearch(value)}
        onChange={(_, account) => setSelectedAccount(account)}
        getOptionLabel={(option) =>
          option?.kind === "user"
            ? option.displayName ?? ""
            : option?.name ?? ""
        }
        renderOption={(props, option) => {
          if (!option) {
            return null;
          }

          const avatarSrc =
            "hasAvatar" in option && option.hasAvatar
              ? getImageUrlFromEntityProperties(
                  option.hasAvatar.imageEntity.properties,
                )
              : undefined;

          return (
            <Box component="li" {...props}>
              <Avatar
                src={avatarSrc}
                title={
                  option.kind === "user" ? option.displayName : option.name
                }
                size={28}
                sx={{ marginRight: 1 }}
                borderRadius={option.kind === "org" ? "4px" : undefined}
              />
              <Typography>
                {option.kind === "user" ? option.displayName : option.name}
              </Typography>
            </Box>
          );
        }}
        inputHeight={36}
        sx={{
          height: 36,
          [`.${outlinedInputClasses.root}`]: {
            height: "unset",
            paddingY: 0.75,
            [`.${autocompleteClasses.input}`]: {
              paddingY: 0,
            },
          },
        }}
      />
      <Button disabled={!selectedAccount} size="xs" type="submit">
        Invite
      </Button>
    </Box>
  );
};
