import { useApolloClient, useMutation } from "@apollo/client";
import type { EntityTypeWithMetadata, WebId } from "@blockprotocol/type-system";
import {
  ArrowRightRegularIcon,
  BullseyeLightIcon,
  TextField,
} from "@hashintel/design-system";
import type { AiFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import {
  goalFlowDefinition,
  goalFlowDefinitionWithReportAndSpreadsheetDeliverable,
  goalFlowDefinitionWithReportDeliverable,
  goalFlowDefinitionWithSpreadsheetDeliverable,
  type GoalFlowTriggerInput,
} from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type { GoogleSheetTriggerInput } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions/google-sheets";
import type { ReportTriggerInput } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions/markdown-report";
import type {
  FlowDataSources,
  FlowDefinition,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import { getFlowRunsQuery } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";
import type { SvgIconProps, SxProps, Theme } from "@mui/material";
import {
  autocompleteClasses,
  Box,
  Container,
  FormControlLabel,
  outlinedInputClasses,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import type { FormEvent, FunctionComponent, PropsWithChildren } from "react";
import { useMemo, useState } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import {
  FlowType,
  type StartFlowMutation,
  type StartFlowMutationVariables,
} from "../../graphql/api-types.gen";
import { startFlowMutation } from "../../graphql/queries/knowledge/flow.queries";
import { FilesRegularIcon } from "../../shared/icons/files-regular-icon";
import { GlobeRegularIcon } from "../../shared/icons/globe-regular-icon";
import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { Button } from "../../shared/ui/button";
import { WorkersHeader } from "../../shared/workers-header";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { EntityTypeSelector } from "../shared/entity-type-selector";
import { WebSelector } from "../shared/web-selector";
import type { DeliverableSettingsState } from "./new.page/deliverable-settings";
import { DeliverableSettings } from "./new.page/deliverable-settings";
import type { FileSettingsState } from "./new.page/file-settings";
import { FileSettings } from "./new.page/file-settings";
import {
  defaultBrowserPluginDomains,
  InternetSettings,
} from "./new.page/internet-settings";

const Question = ({
  children,
  description,
  number,
  text,
}: PropsWithChildren<{
  description: string;
  number: number;
  text: string;
}>) => (
  <Box mb={4}>
    <Box sx={{ mb: 1.8 }}>
      <Typography sx={{ fontSize: 17, fontWeight: 600 }}>
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
      <Typography component="p" variant="smallTextParagraphs" mt={0.8}>
        {description}
      </Typography>
    </Box>
    {children}
  </Box>
);

const Setting = ({
  children,
  header,
  inputId,
}: PropsWithChildren<{ header?: string; inputId?: string }>) => (
  <Box mb={2.5}>
    {header && (
      <Typography
        component="label"
        htmlFor={inputId}
        sx={{ display: "block", fontSize: 14, fontWeight: 500, mb: 1 }}
      >
        {header}
      </Typography>
    )}
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
    <Stack
      direction="row"
      gap={{ xs: 2, lg: 5 }}
      sx={{ flexWrap: { xs: "wrap", lg: "nowrap" } }}
    >
      {children}
    </Stack>
  </Box>
);

const SettingCardSectionHeader = ({
  Icon,
  text,
}: {
  Icon?: FunctionComponent<SvgIconProps>;
  text: string;
}) => (
  <Stack direction="row" alignItems="center" mb={2}>
    {Icon && (
      <Icon
        sx={{ color: ({ palette }) => palette.gray[50], fontSize: 12, mr: 0.9 }}
      />
    )}
    <Typography
      component="h4"
      sx={{ color: ({ palette }) => palette.gray[50] }}
      variant="smallCaps"
    >
      {text}
    </Typography>
  </Stack>
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
  const [webId, setWebId] = useState<WebId>(
    authenticatedUser.accountId as WebId,
  );
  const [createAsDraft, setCreateAsDraft] = useState(true);
  const [internetSettings, setInternetSettings] = useState<
    FlowDataSources["internetAccess"]
  >({
    enabled: true,
    browserPlugin: {
      domains: defaultBrowserPluginDomains,
      enabled: true,
    },
  });
  const [fileSettings, setFileSettings] = useState<FileSettingsState>({
    fileEntities: [],
  });
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

    if (deliverablesSettings.document && !deliverablesSettings.document.brief) {
      return false;
    }

    if (
      deliverablesSettings.spreadsheet &&
      (!deliverablesSettings.spreadsheet.googleSheet ||
        !deliverablesSettings.spreadsheet.googleAccountId)
    ) {
      return false;
    }

    if (!internetSettings.enabled && !fileSettings.fileEntities.length) {
      return false;
    }

    return true;
  }, [
    called,
    deliverablesSettings.document,
    deliverablesSettings.spreadsheet,
    entityTypes.length,
    fileSettings,
    internetSettings,
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

    let flowDefinition: FlowDefinition<AiFlowActionDefinitionId> =
      goalFlowDefinition;
    if (deliverablesSettings.document && deliverablesSettings.spreadsheet) {
      if (
        !deliverablesSettings.document.brief ||
        !deliverablesSettings.spreadsheet.googleSheet ||
        !deliverablesSettings.spreadsheet.googleAccountId
      ) {
        return;
      }
      triggerOutputs.push(
        {
          outputName: "Report specification" satisfies ReportTriggerInput,
          payload: {
            kind: "Text",
            value: `Produce a Markdown-formatted report on the following: ${deliverablesSettings.document.brief}`,
          },
        },
        {
          outputName: "Google Sheet" satisfies GoogleSheetTriggerInput,
          payload: {
            kind: "GoogleSheet",
            value: deliverablesSettings.spreadsheet.googleSheet,
          },
        },
        {
          outputName: "Google Account" satisfies GoogleSheetTriggerInput,
          payload: {
            kind: "GoogleAccountId",
            value: deliverablesSettings.spreadsheet.googleAccountId,
          },
        },
      );
      flowDefinition = goalFlowDefinitionWithReportAndSpreadsheetDeliverable;
    } else if (deliverablesSettings.document) {
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
      triggerOutputs.push(
        {
          outputName: "Google Sheet" satisfies GoogleSheetTriggerInput,
          payload: {
            kind: "GoogleSheet",
            value: deliverablesSettings.spreadsheet.googleSheet,
          },
        },
        {
          outputName: "Google Account" satisfies GoogleSheetTriggerInput,
          payload: {
            kind: "GoogleAccountId",
            value: deliverablesSettings.spreadsheet.googleAccountId,
          },
        },
      );
      flowDefinition = goalFlowDefinitionWithSpreadsheetDeliverable;
    }

    const { data } = await startFlow({
      variables: {
        dataSources: {
          files: {
            fileEntityIds: fileSettings.fileEntities.map(
              (entity) => entity.metadata.recordId.entityId,
            ),
          },
          internetAccess: internetSettings,
        },
        flowDefinition,
        flowType: FlowType.Ai,
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

    const { shortname } = getOwner({ webId });

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
        hideDivider
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
            mb: 6,
          })}
        >
          <Question
            description="Information uploaded and created while performing this task will be added to this web"
            number={1}
            text="Choose a web"
          >
            <WebSelector
              avatarSize={18}
              inputHeight={30}
              inputId="web-selector"
              selectedWebId={webId}
              setSelectedWebId={(selectedWebId) => setWebId(selectedWebId)}
            />
          </Question>
          <Question
            description="Your web will be populated with entities matching your research goal"
            number={2}
            text="What do you want to research?"
          >
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
                width: inputWidth,
              }}
              value={goal}
            />
          </Question>
          <Question
            description="The research task will look for entities that match these types."
            number={3}
            text="What types of entities are you looking for?"
          >
            <Box mb={1}>
              <EntityTypeSelector
                autoFocus={false}
                disableCreate
                inputHeight={52}
                multiple
                onSelect={(newEntityTypes) => setEntityTypes(newEntityTypes)}
                sx={{
                  height: 52,
                  width: inputWidth,
                  [`& .${outlinedInputClasses.root} .${autocompleteClasses.input}`]:
                    {
                      fontSize: 15,
                      pl: 2,
                    },
                }}
                value={entityTypes}
              />
            </Box>
          </Question>
          <Question
            description="Entities will be created from the information sources you provide access to."
            number={4}
            text="What sources do you want to use?"
          >
            <SettingCard>
              <Box>
                <SettingCardSectionHeader
                  Icon={GlobeRegularIcon}
                  text="Internet"
                />
                <InternetSettings
                  settings={internetSettings}
                  setSettings={setInternetSettings}
                />
              </Box>
              <Box flexGrow={1}>
                <SettingCardSectionHeader
                  Icon={FilesRegularIcon}
                  text="Files"
                />
                <FileSettings
                  settings={fileSettings}
                  setSettings={setFileSettings}
                  webId={webId}
                />
              </Box>
            </SettingCard>
          </Question>
          <Question
            description="Select how outputs of this research goal should be created."
            number={5}
            text="What do you want to output?"
          >
            <SettingCard>
              <Box>
                <SettingCardSectionHeader text="Entities" />
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
            </SettingCard>
          </Question>
          <Box
            sx={{
              borderTop: ({ palette }) => `1px solid ${palette.gray[30]}`,
              pt: 4,
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
                  <ArrowRightRegularIcon sx={{ fontSize: 16, ml: 1 }} />
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
