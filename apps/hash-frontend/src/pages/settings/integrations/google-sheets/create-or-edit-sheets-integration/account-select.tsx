import { Autocomplete } from "@hashintel/design-system";
import { useEffect, useMemo } from "react";

import { useGoogleAuth } from "../google-auth-context";

type GoogleAccountSelectProps = {
  googleAccountId?: string;
  setGoogleAccountId: (googleAccountId: string) => void;
};

export const GoogleAccountSelect = ({
  googleAccountId,
  setGoogleAccountId,
}: GoogleAccountSelectProps) => {
  const authContext = useGoogleAuth();

  const options = useMemo(() => {
    if (authContext.loading) {
      return [];
    }

    return authContext.accounts
      .sort((a, b) =>
        a.metadata.provenance.createdAtDecisionTime >
        b.metadata.provenance.createdAtDecisionTime
          ? -1
          : 1,
      )
      .map((account) => ({
        label:
          account.properties[
            "https://hash.ai/@hash/types/property-type/email/"
          ],
        value:
          account.properties[
            "https://hash.ai/@google/types/property-type/account-id/"
          ],
      }));
  }, [authContext]);

  const value = options.find((option) => option.value === googleAccountId);

  useEffect(() => {
    if (!googleAccountId && options[0]) {
      setGoogleAccountId(options[0].value);
    }
  }, [googleAccountId, setGoogleAccountId, options]);

  return (
    <Autocomplete
      autoFocus={false}
      autoHighlight={false}
      disableClearable
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, val) => option.value === val.value}
      multiple={false}
      onChange={(_event, { value: newValue }) => setGoogleAccountId(newValue)}
      options={options}
      sx={{ width: 300 }}
      value={value}
    />
  );
};
