import { useMutation } from "@apollo/client";
import type { MultiFilter } from "@blockprotocol/graph";
import { AlertModal, CheckIcon, TextField } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import type { CreateOrUpdateSheetsIntegrationRequest } from "@local/hash-isomorphic-utils/google-integration";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { QueryProperties } from "@local/hash-isomorphic-utils/system-types/googlesheetsintegration";
import type { OwnedById } from "@local/hash-subgraph";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { useMemo, useState } from "react";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  createEntityMutation,
  updateEntityMutation,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { useLatestEntityTypesOptional } from "../../../../shared/entity-types-context/hooks";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { Button } from "../../../../shared/ui/button";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { GoogleAccountSelect } from "./create-or-edit-sheets-integration/account-select";
import { useGoogleAuth } from "./google-auth-context";
import { GoogleFilePicker } from "./google-file-picker";
import type { UseSheetsIntegrationsData } from "./use-sheet-integrations";

const StepContainer = ({
  children,
  disabled,
  done,
  startExpanded,
  title,
}: PropsWithChildren<{
  disabled?: boolean;
  done: boolean;
  startExpanded?: boolean;
  title: string;
}>) => {
  const [expanded, setExpanded] = useState(!disabled && startExpanded);

  return (
    <Box>
      <Stack
        alignItems="center"
        component="button"
        direction="row"
        justifyContent="space-between"
        onClick={() => {
          if (!disabled) {
            setExpanded(!expanded);
          }
        }}
        sx={({ palette }) => ({
          cursor: "pointer",
          width: "100%",
          background: disabled ? palette.gray[50] : palette.blue[70],
          border: "none",
          py: 1,
          px: 2,
        })}
      >
        <Typography
          sx={{
            color: ({ palette }) => palette.common.white,
            fontWeight: 600,
            textAlign: "left",
          }}
        >
          {title}
        </Typography>
        {done && (
          <CheckIcon
            sx={({ palette }) => ({ fill: palette.common.white, fontSize: 18 })}
          />
        )}
      </Stack>

      <Collapse in={expanded}>
        <Box
          sx={({ palette }) => ({
            p: 2,
            background: palette.gray[5],
            border: `1px solid ${palette.gray[30]}`,
          })}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
};

type IntegrationData = {
  audience: "human" | "machine";
  googleAccountId?: string;
  query?: MultiFilter;
  existingFile?: {
    id: string;
    name: string;
  };
  newFileName?: string;
};

type CreateOrEditSheetsIntegrationProps = {
  close: () => void;
  currentIntegration: UseSheetsIntegrationsData["integrations"][0] | null;
  onComplete: () => void;
};

export const CreateOrEditSheetsIntegration = ({
  close,
  currentIntegration,
  onComplete,
}: CreateOrEditSheetsIntegrationProps) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showReauthModal, setShowReauthModal] = useState(false);

  const { authenticatedUser } = useAuthenticatedUser();

  const [integrationData, setIntegrationData] = useState<IntegrationData>({
    audience:
      (currentIntegration?.properties[
        "https://hash.ai/@hash/types/property-type/data-audience/"
      ] as "human" | "machine" | undefined) ?? "human",
    existingFile: currentIntegration
      ? {
          id: currentIntegration.properties[
            "https://hash.ai/@hash/types/property-type/file-id/"
          ],
          name: "[existing file - todo, get file name]",
        }
      : undefined,
    googleAccountId:
      currentIntegration?.account.properties[
        "https://hash.ai/@google/types/property-type/account-id/"
      ],
    query: currentIntegration?.query.properties[
      "https://blockprotocol.org/@hash/types/property-type/query/"
    ] as MultiFilter | undefined,
  });

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const { propertyTypes } = usePropertyTypes({ latestOnly: true });
  const { latestEntityTypes } = useLatestEntityTypesOptional();

  const entityTypeSchemas = useMemo(
    () => latestEntityTypes?.map((type) => type.schema) ?? [],
    [latestEntityTypes],
  );

  const propertyTypeSchemas = useMemo(
    () => Object.values(propertyTypes ?? {}).map((type) => type.schema),
    [propertyTypes],
  );

  const authContext = useGoogleAuth();
  if (authContext.loading) {
    return null;
  }

  const { addGoogleAccount, checkAccessToken, getAccessToken } = authContext;

  const submittable =
    !!integrationData.googleAccountId &&
    !!integrationData.query &&
    (integrationData.existingFile || integrationData.newFileName);

  const submit = async () => {
    if (
      !integrationData.googleAccountId ||
      !integrationData.query ||
      (!integrationData.existingFile && !integrationData.newFileName)
    ) {
      return;
    }

    try {
      await checkAccessToken({
        googleAccountId: integrationData.googleAccountId,
      });
    } catch {
      setShowReauthModal(true);
      return;
    }

    let queryEntityId = currentIntegration?.query.metadata.recordId.entityId;
    if (!queryEntityId) {
      const { data } = await createEntity({
        variables: {
          entityTypeId: blockProtocolEntityTypes.query.entityTypeId,
          ownedById: authenticatedUser.accountId as OwnedById,
          properties: {
            "https://blockprotocol.org/@hash/types/property-type/query/":
              integrationData.query,
          } as QueryProperties,
        },
      });

      queryEntityId = data?.createEntity.metadata.recordId.entityId;
      if (!queryEntityId) {
        throw new Error("Query entity not created");
      }
    }

    const syncPayload: CreateOrUpdateSheetsIntegrationRequest = {
      audience: integrationData.audience,
      existingIntegrationEntityId:
        currentIntegration?.metadata.recordId.entityId,
      googleAccountId: integrationData.googleAccountId,
      queryEntityId,
      spreadsheetId: integrationData.existingFile?.id,
      newFileName: integrationData.newFileName,
    };

    await fetch(`${apiOrigin}/integrations/google/sheets`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(syncPayload),
    });

    onComplete();
  };

  return (
    <Box>
      {showReauthModal && (
        <AlertModal
          callback={() => addGoogleAccount()}
          calloutMessage="Access to this Google account has expired or been revoked"
          close={() => setShowReauthModal(false)}
          type="info"
        >
          <Typography>
            Please log in with Google again to continue setting up the
            integration.
          </Typography>
        </AlertModal>
      )}
      {accessToken && (
        <GoogleFilePicker
          accessToken={accessToken}
          onUserChoice={(response) => {
            setAccessToken(null);

            if (
              response.action !== google.picker.Action.PICKED ||
              !response.docs[0]
            ) {
              return;
            }

            setIntegrationData({
              ...integrationData,
              existingFile: {
                id: response.docs[0].id,
                name: response.docs[0].name,
              },
            });
          }}
        />
      )}
      <Box>
        <StepContainer
          done={!!integrationData.googleAccountId}
          startExpanded
          title="1. Choose a Google Account"
        >
          <Stack alignItems="center" direction="row" gap={2}>
            <GoogleAccountSelect
              googleAccountId={integrationData.googleAccountId}
              setGoogleAccountId={(googleAccountId) => {
                setIntegrationData({ ...integrationData, googleAccountId });
              }}
            />
            <Typography>or</Typography>
            <Button onClick={() => addGoogleAccount()}>
              Link a new account
            </Button>
          </Stack>
        </StepContainer>
        <StepContainer
          disabled={!integrationData.googleAccountId}
          done={!!integrationData.newFileName || !!integrationData.existingFile}
          title="2. Choose or create a spreadsheet"
        >
          {integrationData.existingFile && (
            <Typography mb={2}>
              Sync with <strong>{integrationData.existingFile.name}</strong>
            </Typography>
          )}
          <Box>
            <Button
              disabled={!integrationData.googleAccountId}
              onClick={async () => {
                if (!integrationData.googleAccountId) {
                  return;
                }

                try {
                  const response = await getAccessToken({
                    googleAccountId: integrationData.googleAccountId,
                  });

                  setAccessToken(response.accessToken);
                } catch {
                  setShowReauthModal(true);
                }
              }}
            >
              Choose {integrationData.existingFile ? "a different" : "a"} file
            </Button>
          </Box>
          <Typography my={1}>or name a new file</Typography>
          <Box>
            <TextField
              value={integrationData.newFileName}
              onChange={(event) => {
                setIntegrationData({
                  ...integrationData,
                  newFileName: event.target.value,
                });
              }}
              placeholder="New file name"
            />
          </Box>
        </StepContainer>
        <StepContainer
          done={!!integrationData.query}
          title="3. Select data to sync"
        >
          <Box>
            <Typography mb={2}>
              Specify the entities that will be synced to the spreadsheet
            </Typography>
            <EntityQueryEditor
              sx={{ marginBottom: 2 }}
              entityTypes={entityTypeSchemas}
              propertyTypes={propertyTypeSchemas}
              defaultValue={integrationData.query}
              onSave={async (newQuery) => {
                if (currentIntegration) {
                  await updateEntity({
                    variables: {
                      entityUpdate: {
                        entityId:
                          currentIntegration.query.metadata.recordId.entityId,
                        updatedProperties: {
                          "https://blockprotocol.org/@hash/types/property-type/query/":
                            newQuery,
                        } as QueryProperties,
                      },
                    },
                  });
                }
                setIntegrationData({
                  ...integrationData,
                  query: newQuery,
                });
              }}
              saveTitle={currentIntegration ? "Update query" : "Save query"}
              discardTitle={
                currentIntegration ? "Discard changes" : "Reset query"
              }
            />
          </Box>
        </StepContainer>
        <StepContainer
          done={!!integrationData.audience}
          title="4. Select formatting"
        >
          <Box>
            <select
              value={integrationData.audience}
              onChange={(event) =>
                setIntegrationData({
                  ...integrationData,
                  audience: event.target.value as "human" | "machine",
                })
              }
            >
              <option value="human">Human</option>
              <option value="machine">Machine</option>
            </select>
          </Box>
        </StepContainer>
      </Box>
      <Stack direction="row" gap={2} mt={2}>
        <Button onClick={submit} disabled={!submittable} type="button">
          Save and update sheet
        </Button>
        <Button onClick={close} variant="secondary" type="button">
          Discard / done
        </Button>
      </Stack>
    </Box>
  );
};
