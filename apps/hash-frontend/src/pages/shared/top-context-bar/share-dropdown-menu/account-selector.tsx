import { Autocomplete, Avatar } from "@hashintel/design-system";
import { AccountGroupId, AccountId } from "@local/hash-subgraph/.";
import { autocompleteClasses, Box, outlinedInputClasses } from "@mui/material";
import { FunctionComponent, useMemo, useState } from "react";

import { useOrgs } from "../../../../components/hooks/use-orgs";
import { useOrgsWithLinks } from "../../../../components/hooks/use-orgs-with-links";
import { useUsers } from "../../../../components/hooks/use-users";
import { useUsersWithLinks } from "../../../../components/hooks/use-users-with-links";
import { MinimalOrg, MinimalUser } from "../../../../lib/user-and-org";
import { getImageUrlFromEntityProperties } from "../../get-image-url-from-properties";

export const AccountSelector: FunctionComponent<{
  excludeAccountIds?: (AccountId | AccountGroupId)[];
  onSelect: (selectedAccount: MinimalUser | MinimalOrg | undefined) => void;
}> = ({ onSelect, excludeAccountIds }) => {
  const [search, setSearch] = useState("");

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
      [...(users ?? []), ...(orgs ?? [])].filter(
        (account) =>
          !excludeAccountIds ||
          !excludeAccountIds.includes(
            account.kind === "user"
              ? account.accountId
              : account.accountGroupId,
          ),
      ),
    [excludeAccountIds, orgs, users],
  );

  const [open, setOpen] = useState(false);

  return (
    <Autocomplete
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
      onInputChange={(_, value) => setSearch(value)}
      onChange={(_, selectedAccount) => onSelect(selectedAccount ?? undefined)}
      getOptionLabel={(option) =>
        option.kind === "user" ? option.preferredName ?? "" : option.name
      }
      renderOption={(props, option) => {
        const avatarSrc = option.hasAvatar
          ? getImageUrlFromEntityProperties(
              option.hasAvatar.imageEntity.properties,
            )
          : undefined;
        return (
          <Box component="li" {...props}>
            <Avatar
              src={avatarSrc}
              title={
                option.kind === "user" ? option.preferredName : option.name
              }
              size={28}
              sx={{ marginRight: 1 }}
            />
            {option.kind === "user" ? option.preferredName : option.name}
          </Box>
        );
      }}
      height={36}
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
  );
};
