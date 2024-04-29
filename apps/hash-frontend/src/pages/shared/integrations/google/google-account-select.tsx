import { Select } from "@hashintel/design-system";
import { Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "../../../../shared/ui/button";
import { MenuItem } from "../../../../shared/ui/menu-item";
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
      {options.length > 0 ? (
        <>
          <Select
            displayEmpty
            onChange={(event) => setGoogleAccountId(event.target.value)}
            placeholder="Select Google Account"
            value={googleAccountId}
          >
            {options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          <Typography variant="smallTextParagraphs">or</Typography>
        </>
      ) : null}
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
