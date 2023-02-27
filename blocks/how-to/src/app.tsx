import {
  useEntitySubgraph,
  useGraphBlockService,
  type BlockComponent,
} from "@blockprotocol/graph/react";
import {
  Button,
  faPlus,
  FontAwesomeIcon,
  theme,
} from "@hashintel/design-system";
import { Card, Collapse, Stack, ThemeProvider } from "@mui/material";
import Box from "@mui/material/Box";
import { useCallback, useRef, useState } from "react";
import { EditableField } from "./editable-field";
import { Step } from "./step";
import { v4 as uuid } from "uuid";

interface Step {
  id?: string;
  title: string;
  description: string;
  animatingOut?: boolean;
}

const EMPTY_STEP: Step = { title: "", description: "" };

export const App: BlockComponent<true, RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  if (!blockEntitySubgraph) {
    throw new Error("No blockEntitySubgraph provided");
  }

  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRootRef);
  const { rootEntity: blockEntity, linkedEntities } =
    useEntitySubgraph(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId },
      entityTypeId,
    },
    properties,
  } = blockEntity;

  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [steps, setSteps] = useState<Step[]>([{ id: uuid(), ...EMPTY_STEP }]);
  const [introduction, setIntroduction] = useState<Step | null>(null);

  const addStep = () => setSteps([...steps, { id: uuid(), ...EMPTY_STEP }]);

  const removeStep = (index: number) => {
    const newSteps = [...steps];
    updateStepField(index, true, "animatingOut");

    setTimeout(() => {
      newSteps.splice(index, 1);
      setSteps(newSteps);
    }, 300);
  };

  const updateStepField = useCallback(
    (
      index: number,
      value: any,
      field: "title" | "description" | "animatingOut",
    ) => {
      const newSteps = steps.map((step, stepIndex) => {
        if (stepIndex === index) {
          return { ...step, [field]: value };
        }

        return step;
      });

      setSteps(newSteps);
    },
    [steps],
  );

  const removeIntroduction = () => {
    updateIntroductionField(true, "animatingOut");

    setTimeout(() => {
      setIntroduction(null);
    }, 300);
  };

  const updateIntroductionField = useCallback(
    (value: any, field: "title" | "description" | "animatingOut") => {
      if (introduction) {
        setIntroduction({ ...introduction, [field]: value });
      }
    },
    [introduction],
  );

  return (
    <ThemeProvider theme={theme}>
      <Box ref={blockRootRef} sx={{ display: "inline-block", width: 1 }}>
        <Card
          sx={{
            display: "flex",
            border: ({ palette }) => `1px solid ${palette.gray[20]}`,
            borderRadius: 2.5,
            boxShadow: "none",
            paddingY: 3,
            paddingX: 3.75,
            flexDirection: "column",
          }}
        >
          <Stack
            sx={{
              gap: 1.5,
            }}
          >
            <EditableField
              value={titleValue}
              onChange={(event) => setTitleValue(event.target.value)}
              // onBlur={(event) => updateTitle(event.target.value)}
              height="21px"
              sx={{
                fontWeight: 700,
                fontSize: 21,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: theme.palette.common.black,
              }}
              placeholder="Enter a how-to guide name"
              readonly={readonly}
            />
            <EditableField
              value={descriptionValue}
              onChange={(event) => setDescriptionValue(event.target.value)}
              // onBlur={(event) => updateTitle(event.target.value)}
              height="18px"
              sx={{
                fontWeight: 500,
                fontSize: 14,
                lineHeight: 1.3,
                letterSpacing: "-0.02em",
                color: theme.palette.gray[90],
              }}
              placeholder="Click here to add a description of the how-to process"
              placeholderSx={{
                fontStyle: "italic",
              }}
              readonly={readonly}
            />
          </Stack>

          <Collapse in={!readonly && !introduction}>
            <Button
              variant="tertiary"
              size="small"
              sx={{ fontSize: 14, mt: 3 }}
              onClick={() => setIntroduction(EMPTY_STEP)}
            >
              <FontAwesomeIcon
                icon={{ icon: faPlus }}
                sx={{ mr: 1, fontSize: 13 }}
              />
              Add Introduction
            </Button>
          </Collapse>

          <Collapse
            in={introduction !== null && !introduction?.animatingOut}
            appear
          >
            <Box mt={3}>
              <Step
                header="Introduction"
                title={introduction?.title}
                description={introduction?.description}
                updateTitle={(value: string) =>
                  updateIntroductionField(value, "title")
                }
                updateDescription={(value: string) =>
                  updateIntroductionField(value, "description")
                }
                onRemove={() => removeIntroduction()}
                readonly={readonly}
                deleteButtonText="Remove intro"
              />
            </Box>
          </Collapse>

          <Box>
            {steps.map(({ id, title, description, animatingOut }, index) => (
              <Collapse key={id} in={!animatingOut} appear>
                <Box
                  sx={{
                    mt: 3,
                    transition: ({ transitions }) =>
                      transitions.create("margin-top"),
                  }}
                >
                  <Step
                    header={`Step ${index + 1}`}
                    title={title}
                    description={description}
                    updateTitle={(value: string) =>
                      updateStepField(index, value, "title")
                    }
                    updateDescription={(value: string) =>
                      updateStepField(index, value, "description")
                    }
                    onRemove={() => removeStep(index)}
                    readonly={readonly}
                    deletable={steps.length > 1}
                    deleteButtonText="Remove step"
                  />
                </Box>
              </Collapse>
            ))}
          </Box>

          {!readonly ? (
            <Box mt={3}>
              <Button
                variant="tertiary"
                size="small"
                sx={{ fontSize: 14 }}
                onClick={addStep}
              >
                <FontAwesomeIcon
                  icon={{ icon: faPlus }}
                  sx={{ mr: 1, fontSize: 13 }}
                />
                Add a step
              </Button>
            </Box>
          ) : null}
        </Card>
      </Box>
    </ThemeProvider>
  );
};
