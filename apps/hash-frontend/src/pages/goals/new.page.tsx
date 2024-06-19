import { useApolloClient, useMutation } from "@apollo/client";
import {
  ArrowRightIconRegular,
  BullseyeLightIcon,
  TextField,
} from "@hashintel/design-system";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import type {
  GoalFlowTriggerInput,
  GoogleSheetTriggerInput,
  ReportTriggerInput,
} from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import {
  goalFlowDefinition,
  goalFlowDefinitionWithReportDeliverable,
  goalFlowDefinitionWithSpreadsheetDeliverable,
} from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";
import { getFlowRunsQuery } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";
import {
  autocompleteClasses,
  Box,
  Container,
  FormControlLabel,
  outlinedInputClasses,
  Radio,
  RadioGroup,
  Stack,
  type SxProps,
  type Theme,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import type { FormEvent, PropsWithChildren } from "react";
import { useMemo, useState } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import type {
  StartFlowMutation,
  StartFlowMutationVariables,
} from "../../graphql/api-types.gen";
import { startFlowMutation } from "../../graphql/queries/knowledge/entity.queries";
import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { Button } from "../../shared/ui/button";
import { WorkersHeader } from "../../shared/workers-header";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { EntityTypeSelector } from "../shared/entity-type-selector";
import { WebSelector } from "../shared/web-selector";
import type { DeliverableSettingsState } from "./new.page/deliverable-settings";
import { DeliverableSettings } from "./new.page/deliverable-settings";

const Question = ({ number, text }: { number: number; text: string }) => (
  <Typography sx={{ fontSize: 17, fontWeight: 600, mb: 1.5 }}>
    <Typography
      component="span"
      sx={{
        color: ({ palette }) => palette.gray[50],
        fontSize: 17,
        fontWeight: 600,
        mr: 2,
      }}
    >
      {number}.
    </Typography>
    {text}
  </Typography>
);

const Setting = ({
  children,
  header,
  inputId,
}: PropsWithChildren<{ header: string; inputId: string }>) => (
  <Box mb={2.5}>
    <Typography
      component="label"
      htmlFor={inputId}
      sx={{ display: "block", fontSize: 14, fontWeight: 500, mb: 1 }}
    >
      {header}
    </Typography>
    {children}
  </Box>
);

const SettingCard = ({ children }: PropsWithChildren) => (
  <Box
    sx={({ palette }) => ({
      background: palette.gray[5],
      border: `1px solid ${palette.gray[20]}`,
      borderRadius: 2,
      px: 2.2,
      py: 1.8,
    })}
  >
    {children}
  </Box>
);

const SettingCardSectionHeader = ({ text }: { text: string }) => (
  <Typography
    component="h4"
    sx={{ color: ({ palette }) => palette.gray[50], mb: 2 }}
    variant="smallCaps"
  >
    {text}
  </Typography>
);

const createRadioItemSx = (active: boolean): SxProps<Theme> => ({
  color: ({ palette }) => (active ? palette.common.black : palette.gray[80]),
  "& span": { fontSize: 14 },
  m: 0,
  "&:not(:last-of-type)": { mb: 1 },
});

const inputWidth = 390;

const NewGoalPageContent = () => {
  const { authenticatedUser } = useAuthenticatedUser();

  const [goal, setGoal] = useState("");
  const [entityTypes, setEntityTypes] = useState<EntityTypeWithMetadata[]>([]);
  const [webId, setWebId] = useState<OwnedById>(
    authenticatedUser.accountId as OwnedById,
  );
  const [createAsDraft, setCreateAsDraft] = useState(true);
  const [deliverablesSettings, setDeliverablesSettings] =
    useState<DeliverableSettingsState>({
      document: null,
      spreadsheet: null,
    });

  const apolloClient = useApolloClient();
  const getOwner = useGetOwnerForEntity();
  const { push } = useRouter();

  const [startFlow, { called }] = useMutation<
    StartFlowMutation,
    StartFlowMutationVariables
  >(startFlowMutation);

  const submittable = useMemo(() => {
    if (called || !goal.trim() || !entityTypes.length) {
      return false;
    }
    if (deliverablesSettings.document) {
      return !!deliverablesSettings.document.brief;
    }
    if (deliverablesSettings.spreadsheet) {
      return (
        !!deliverablesSettings.spreadsheet.googleSheet &&
        !!deliverablesSettings.spreadsheet.googleAccountId
      );
    }
    return true;
  }, [
    called,
    deliverablesSettings.document,
    deliverablesSettings.spreadsheet,
    entityTypes.length,
    goal,
  ]);

  const createGoal = async (event: FormEvent) => {
    event.preventDefault();

    if (!submittable) {
      return;
    }

    const triggerOutputs: StepOutput[] = [
      {
        outputName: "Create as draft" satisfies GoalFlowTriggerInput,
        payload: {
          kind: "Boolean",
          value: createAsDraft,
        },
      },
      {
        outputName: "Research guidance" satisfies GoalFlowTriggerInput,
        payload: {
          kind: "Text",
          value: goal,
        },
      },
      {
        outputName: "Entity Types" satisfies GoalFlowTriggerInput,
        payload: {
          kind: "VersionedUrl",
          value: entityTypes.map((entityType) => entityType.schema.$id),
        },
      },
    ];

    /**
     * @todo handle flows with multiple deliverables – probably need to dynamically generate the definition,
     *   and have an explicit flag for 'goal' definitions rather than relying on a static set of flowDefinitionIds
     */
    let flowDefinition = goalFlowDefinition;
    if (deliverablesSettings.document) {
      if (!deliverablesSettings.document.brief) {
        return;
      }
      triggerOutputs.push({
        outputName: "Report specification" satisfies ReportTriggerInput,
        payload: {
          kind: "Text",
          value: `Produce a Markdown-formatted report on the following: ${deliverablesSettings.document.brief}`,
        },
      });
      flowDefinition = goalFlowDefinitionWithReportDeliverable;
    } else if (deliverablesSettings.spreadsheet) {
      if (
        !deliverablesSettings.spreadsheet.googleSheet ||
        !deliverablesSettings.spreadsheet.googleAccountId
      ) {
        return;
      }
      triggerOutputs.push({
        outputName: "Google Sheet" satisfies GoogleSheetTriggerInput,
        payload: {
          kind: "GoogleSheet",
          value: deliverablesSettings.spreadsheet.googleSheet,
        },
      });
      triggerOutputs.push({
        outputName: "Google Account" satisfies GoogleSheetTriggerInput,
        payload: {
          kind: "GoogleAccountId",
          value: deliverablesSettings.spreadsheet.googleAccountId,
        },
      });
      flowDefinition = goalFlowDefinitionWithSpreadsheetDeliverable;
    }

    const { data } = await startFlow({
      variables: {
        flowDefinition,
        flowTrigger: {
          outputs: triggerOutputs,
          triggerDefinitionId: "userTrigger",
        },
        webId,
      },
    });

    const flowRunId = data?.startFlow;
    if (!flowRunId) {
      throw new Error("Failed to start flow");
    }

    await apolloClient.refetchQueries({
      include: [getFlowRunsQuery],
    });

    const { shortname } = getOwner({ ownedById: webId });

    void push(generateWorkerRunPath({ shortname, flowRunId }));
  };

  return (
    <Box>
      <WorkersHeader
        crumbs={[
          {
            href: "/goals",
            icon: null,
            id: "goals",
            title: "Goals",
          },
          {
            icon: null,
            id: "new",
            title: "New",
          },
        ]}
        sideTitle="New research goal"
        title={{
          text: "Goals",
          Icon: BullseyeLightIcon,
          iconSx: { fontSize: 32, my: 0.4 },
        }}
      />
      <Container
        component="form"
        onSubmit={(event) => {
          if (submittable) {
            void createGoal(event);
          }
        }}
      >
        <Box
          sx={({ palette }) => ({
            background: palette.common.white,
            borderRadius: 2,
            border: `1px solid ${palette.gray[30]}`,
            maxWidth: 800,
            p: 4,
          })}
        >
          <Question number={1} text="What do you want to research?" />
          <TextField
            inputProps={{}}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Enter your goal"
            sx={{
              [`.${outlinedInputClasses.root}`]: {
                boxShadow: "none",
              },
              [`.${outlinedInputClasses.root} input`]: {
                fontSize: 15,
                px: 2.8,
                py: 1.8,
              },
              mb: 4,
              width: inputWidth,
            }}
            value={goal}
          />
          <Question
            number={2}
            text="What types of entities are you looking for?"
          />
          <EntityTypeSelector
            autoFocus={false}
            disableCreate
            multiple
            onSelect={(newEntityTypes) => setEntityTypes(newEntityTypes)}
            sx={{
              height: 48,
              width: inputWidth,
              mb: 5,
              [`& .${outlinedInputClasses.root} .${autocompleteClasses.input}`]:
                {
                  fontSize: 15,
                  pl: 2,
                },
            }}
            value={entityTypes}
          />
          <Question number={3} text="What do you want to output?" />
          <SettingCard>
            <Stack
              direction="row"
              gap={{ xs: 2, lg: 5 }}
              sx={{ flexWrap: { xs: "wrap", lg: "nowrap" } }}
            >
              <Box>
                <SettingCardSectionHeader text="Entities" />
                <Setting header="Create in..." inputId="web-selector">
                  <WebSelector
                    avatarSize={18}
                    inputHeight={30}
                    inputId="web-selector"
                    setSelectedWebOwnedById={(ownedById) => setWebId(ownedById)}
                    selectedWebOwnedById={webId}
                  />
                </Setting>
                <Setting header="Create as..." inputId="draft-option">
                  <RadioGroup
                    aria-labelledby="draft-option"
                    name="radio-buttons-group"
                    onChange={(event) =>
                      setCreateAsDraft(event.target.value === "draft")
                    }
                    value={createAsDraft ? "draft" : "live"}
                  >
                    <FormControlLabel
                      value="draft"
                      control={<Radio sx={{ mr: 1 }} />}
                      label="Draft entities that require review"
                      sx={createRadioItemSx(createAsDraft)}
                    />
                    <FormControlLabel
                      value="live"
                      control={<Radio sx={{ mr: 1 }} />}
                      label="Actual entities directly in the web"
                      sx={createRadioItemSx(!createAsDraft)}
                    />
                  </RadioGroup>
                </Setting>
              </Box>
              <Box>
                <SettingCardSectionHeader text="Deliverables" />
                <Box>
                  <DeliverableSettings
                    settings={deliverablesSettings}
                    setSettings={setDeliverablesSettings}
                  />
                </Box>
              </Box>
            </Stack>
          </SettingCard>
          <Box
            sx={{
              borderTop: ({ palette }) => `1px solid ${palette.gray[30]}`,
              pt: 3.5,
              mt: 4,
            }}
          >
            <Button
              disabled={!submittable}
              onClick={createGoal}
              size="medium"
              type="submit"
            >
              {called ? (
                "Starting..."
              ) : (
                <>
                  Continue
                  <ArrowRightIconRegular sx={{ fontSize: 16, ml: 1 }} />
                </>
              )}
            </Button>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

const NewGoalPage: NextPageWithLayout = () => {
  return <NewGoalPageContent />;
};

NewGoalPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default NewGoalPage;
