import { useMutation } from "@apollo/client";
import type { MultiFilter } from "@blockprotocol/graph";
import { CheckIcon } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import type { OwnedById } from "@local/hash-graph-types/web";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Query } from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { useMemo, useState } from "react";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { createEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { useLatestEntityTypesOptional } from "../../../../shared/entity-types-context/hooks";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { Button } from "../../../../shared/ui/button";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { GoogleAccountSelect } from "../../../shared/integrations/google/google-account-select";
import { useGoogleAuth } from "../../../shared/integrations/google/google-auth-context";
import { SelectOrNameGoogleSheet } from "../../../shared/integrations/google/select-or-name-google-sheet";

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
  spreadsheetId?: string;
  newFileName?: string;
};

type CreateOrEditSheetsSyncProps = {
  close: () => void;
  currentFlow: null;
  onComplete: () => void;
};

export const CreateOrEditSheetsSync = ({
  close,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  currentFlow,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onComplete,
}: CreateOrEditSheetsSyncProps) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const [integrationData, setIntegrationData] = useState<IntegrationData>({
    audience: "human",
  });

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

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

  const submittable =
    !!integrationData.googleAccountId &&
    !!integrationData.query &&
    (integrationData.spreadsheetId || integrationData.newFileName);

  const submit = async () => {
    if (
      !integrationData.googleAccountId ||
      !integrationData.query ||
      (!integrationData.spreadsheetId && !integrationData.newFileName)
    ) {
      return;
    }

    // @todo requires pulling from existing Flow instead, if this UI is retained
    const queryEntityId = null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!queryEntityId) {
      const { data } = await createEntity({
        variables: {
          entityTypeId: blockProtocolEntityTypes.query.entityTypeId,
          ownedById: authenticatedUser.accountId as OwnedById,
          properties: {
            value: {
              "https://blockprotocol.org/@hash/types/property-type/query/": {
                value: integrationData.query,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                },
              },
            } as Query["propertiesWithMetadata"]["value"],
          },
        },
      });

      const serializedEntity = data?.createEntity;
      if (!serializedEntity) {
        throw new Error("Query entity not created");
      }
    }

    throw new Error(
      `Google Sheets sync not creatable here yet – requires updating for Flows.`,
    );

    // onComplete();
  };

  return (
    <Box>
      <Box>
        <StepContainer
          done={!!integrationData.googleAccountId}
          startExpanded
          title="1. Choose a Google Account"
        >
          <GoogleAccountSelect
            googleAccountId={integrationData.googleAccountId}
            setGoogleAccountId={(googleAccountId) => {
              setIntegrationData({ ...integrationData, googleAccountId });
            }}
          />
        </StepContainer>
        <StepContainer
          disabled={!integrationData.googleAccountId}
          done={
            !!integrationData.newFileName || !!integrationData.spreadsheetId
          }
          title="2. Choose or create a spreadsheet"
        >
          <SelectOrNameGoogleSheet
            googleAccountId={integrationData.googleAccountId}
            googleSheet={
              integrationData.spreadsheetId
                ? { spreadsheetId: integrationData.spreadsheetId }
                : { newSheetName: integrationData.newFileName ?? "" }
            }
            setGoogleSheet={(googleSheet) => {
              if ("spreadsheetId" in googleSheet) {
                setIntegrationData({
                  ...integrationData,
                  spreadsheetId: googleSheet.spreadsheetId,
                });
              } else {
                setIntegrationData({
                  ...integrationData,
                  newFileName: googleSheet.newSheetName,
                });
              }
            }}
          />
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
              onSave={(newQuery) => {
                throw new Error(
                  "UI needs updating to create/edit Flows, rather than old Integration entity",
                );

                setIntegrationData({
                  ...integrationData,
                  query: newQuery,
                });
              }}
              saveTitle="Save query"
              discardTitle="Reset query"
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
