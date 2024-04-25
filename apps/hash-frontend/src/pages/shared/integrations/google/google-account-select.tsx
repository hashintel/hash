import { Autocomplete } from "@hashintel/design-system";
import { Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "../../../../shared/ui/button";
import { useGoogleAuth } from "./google-auth-context";

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

  console.log({ googleAccountId, options, value }, options[0] === value);

  const lastOptionsLength = useRef(options.length);
  useEffect(() => {
    if (
      /**
       * Automatically select the first Google Account if none is selected,
       * or select the latest if a new one appears in the list
       */
      (!googleAccountId || options.length > lastOptionsLength.current) &&
      options[0]
    ) {
      setGoogleAccountId(options[0].value);
    }

    lastOptionsLength.current = options.length;
  }, [googleAccountId, setGoogleAccountId, options]);

  return (
    <Stack direction="row" alignItems="center" gap={2}>
      <Autocomplete
        autoFocus={false}
        autoHighlight={false}
        disableClearable
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, val) => option.value === val.value}
        inputHeight={50}
        multiple={false}
        onChange={(_event, { value: newValue }) => setGoogleAccountId(newValue)}
        options={options}
        sx={{ width: 200 }}
        value={value}
      />
      <Typography>or</Typography>
      <Button
        disabled={authContext.loading}
        onClick={() => {
          if (authContext.loading) {
            return;
          }
          authContext.addGoogleAccount();
        }}
        size="small"
      >
        Link a new account
      </Button>
    </Stack>
  );
};
