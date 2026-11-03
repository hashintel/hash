import { useMutation, useQuery } from "@apollo/client";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from "@mui/material";
import { NextSeo } from "next-seo";
import { useCallback, useState } from "react";

import {
  myApiTokensQuery,
  revokeApiTokenMutation,
} from "../../graphql/queries/api-token.queries";
import { Button } from "../../shared/ui";
import { getSettingsLayout } from "../shared/settings-layout";
import { ApiTokensTable } from "./api-tokens.page/api-tokens-table";
import { CreateApiTokenModal } from "./api-tokens.page/create-api-token-modal";
import { SettingsPageContainer } from "./shared/settings-page-container";

import type {
  MyApiTokensQuery,
  RevokeApiTokenMutation,
  RevokeApiTokenMutationVariables,
} from "../../graphql/api-types.gen";
import type { NextPageWithLayout } from "../../shared/layout";
import type { ApiTokenResponse } from "@local/hash-graph-sdk/api-token";

const ApiTokensPage: NextPageWithLayout = () => {
  const { data, refetch } = useQuery<MyApiTokensQuery>(myApiTokensQuery, {
    fetchPolicy: "cache-and-network",
  });

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [tokenPendingRevocation, setTokenPendingRevocation] =
    useState<ApiTokenResponse | null>(null);

  const [revokeApiToken] = useMutation<
    RevokeApiTokenMutation,
    RevokeApiTokenMutationVariables
  >(revokeApiTokenMutation);

  const apiTokens = data?.myApiTokens;

  const revokePendingToken = useCallback(async () => {
    if (!tokenPendingRevocation) {
      return;
    }

    await revokeApiToken({
      variables: { tokenId: tokenPendingRevocation.tokenId },
    });

    setTokenPendingRevocation(null);

    await refetch();
  }, [refetch, revokeApiToken, tokenPendingRevocation]);

  return (
    <>
      <NextSeo title="API tokens" />

      <SettingsPageContainer
        disableContentWrapper
        heading="API tokens"
        subHeading="Access the HASH API from scripts, integrations, and other applications"
        topRightElement={
          <Button
            size="xs"
            onClick={() => setCreateModalOpen(true)}
            // match the heading's mt={-1} so flex centering aligns both
            sx={{ mt: -1 }}
          >
            Create token
          </Button>
        }
      >
        {apiTokens ? (
          apiTokens.length > 0 ? (
            <>
              <Typography
                variant="smallTextParagraphs"
                sx={({ palette }) => ({
                  color: palette.gray[70],
                  display: "block",
                  mb: 2,
                })}
              >
                Tokens authenticate requests to the HASH API on your behalf.
                Revoke any token you no longer use.
              </Typography>
              <ApiTokensTable
                apiTokens={apiTokens}
                onRevoke={setTokenPendingRevocation}
              />
            </>
          ) : (
            <Box
              sx={({ palette }) => ({
                background: palette.common.white,
                borderRadius: 1,
                boxShadow: ({ boxShadows }) => boxShadows.xs,
                px: 5,
                py: 4,
              })}
            >
              <Typography
                variant="smallTextParagraphs"
                sx={({ palette }) => ({ color: palette.gray[70] })}
              >
                You don't have any API tokens yet. Create one to access the HASH
                API from scripts and other applications. Each token acts on your
                behalf, with the same permissions as your account.
              </Typography>
            </Box>
          )
        ) : null}
      </SettingsPageContainer>

      <CreateApiTokenModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onTokenCreated={() => {
          void refetch();
        }}
      />

      <Dialog
        open={!!tokenPendingRevocation}
        onClose={() => setTokenPendingRevocation(null)}
      >
        <DialogTitle
          variant="h5"
          sx={{ display: "flex", fontSize: 22, whiteSpace: "nowrap" }}
        >
          Revoke the token "
          <Box
            component="span"
            sx={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tokenPendingRevocation?.name ?? ""}
          </Box>
          "?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Anything still using this token will immediately lose access to the
            HASH API. Revocation is permanent – if you need access again, create
            a new token.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 3 }}>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setTokenPendingRevocation(null)}
          >
            Cancel
          </Button>
          <Button
            autoFocus
            variant="danger"
            size="small"
            onClick={() => {
              void revokePendingToken();
            }}
          >
            Revoke
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

ApiTokensPage.getLayout = (page) => getSettingsLayout(page);

export default ApiTokensPage;
