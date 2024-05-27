import { useApolloClient, useMutation } from "@apollo/client";
import {
  ArrowRightIconRegular,
  BullseyeLightIcon,
  TextField,
} from "@hashintel/design-system";
import type { GoalFlowTriggerInput } from "@local/hash-isomorphic-utils/flows/example-flow-definitions";
import { goalFlowDefinition } from "@local/hash-isomorphic-utils/flows/example-flow-definitions";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
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
import { useState } from "react";

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

const OutputColumn = ({
  children,
  header,
  inputId,
}: PropsWithChildren<{ header: string; inputId: string }>) => (
  <Stack>
    <Typography
      component="label"
      htmlFor={inputId}
      sx={{ fontSize: 14, fontWeight: 500, mb: 1.5 }}
    >
      {header}
    </Typography>
    {children}
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
  const [webId, setWebId] = useState<OwnedById>(
    authenticatedUser.accountId as OwnedById,
  );
  const [createAsDraft, setCreateAsDraft] = useState(true);

  const apolloClient = useApolloClient();
  const getOwner = useGetOwnerForEntity();
  const { push } = useRouter();

  const [startFlow] = useMutation<
    StartFlowMutation,
    StartFlowMutationVariables
  >(startFlowMutation);

  const createGoal = async (event: FormEvent) => {
    event.preventDefault();

    const triggerOutputs = [
      {
        outputName: "Create as draft" satisfies GoalFlowTriggerInput,
        payload: {
          kind: "Boolean",
          value: createAsDraft,
        },
      } satisfies StepOutput,
      {
        outputName: "Research guidance" satisfies GoalFlowTriggerInput,
        payload: {
          kind: "Text",
          value: goal,
        },
      } satisfies StepOutput,
      {
        outputName: "Entity Types" satisfies GoalFlowTriggerInput,
        payload: {
          kind: "VersionedUrl",
          value: entityTypes.map((entityType) => entityType.schema.$id),
        },
      } satisfies StepOutput,
    ];

    const { data } = await startFlow({
      variables: {
        flowDefinition: goalFlowDefinition,
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
      include: ["getFlowRuns"],
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
      <Container component="form">
        <Box
          sx={({ palette }) => ({
            background: palette.common.white,
            borderRadius: 2,
            border: `1px solid ${palette.gray[30]}`,
            maxWidth: 700,
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
          <Question number={3} text="What should happen to the outputs?" />
          <Stack direction="row" gap={5} mt={2}>
            <OutputColumn header="Create in..." inputId="web-selector">
              <WebSelector
                avatarSize={18}
                inputHeight={30}
                inputId="web-selector"
                setSelectedWebOwnedById={(ownedById) => setWebId(ownedById)}
                selectedWebOwnedById={webId}
              />
            </OutputColumn>
            <OutputColumn header="Create as..." inputId="draft-option">
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
            </OutputColumn>
          </Stack>

          <Box
            sx={{
              borderTop: ({ palette }) => `1px solid ${palette.gray[30]}`,
              pt: 4,
              mt: 4,
              width: 440,
            }}
          >
            <Button
              disabled={!goal.trim()}
              onClick={createGoal}
              size="medium"
              type="submit"
            >
              Continue <ArrowRightIconRegular sx={{ fontSize: 16, ml: 1 }} />
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
