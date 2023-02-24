import {
  useEntitySubgraph,
  useGraphBlockService,
  type BlockComponent,
} from "@blockprotocol/graph/react";
import {
  Button,
  faPlus,
  faTrash,
  FontAwesomeIcon,
  theme,
} from "@hashintel/design-system";
import { Card, Stack, textFieldClasses, ThemeProvider } from "@mui/material";
import Box from "@mui/material/Box";
import { useCallback, useRef, useState } from "react";
import { EditableField } from "./editable-field";
import { Step } from "./step";

interface Step {
  title: string;
  description: string;
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
  const [steps, setSteps] = useState([EMPTY_STEP]);

  const addStep = () => setSteps([...steps, EMPTY_STEP]);

  const removeStep = (index: number) => {
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    setSteps(newSteps);
  };

  const updateStepField = useCallback(
    (index: number, value: string, field: "title" | "description") => {
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

  console.log(steps);

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
            [theme.breakpoints.down("md")]: {
              flexDirection: "column",
            },
          }}
        >
          <Stack gap={3} width={1}>
            <Stack
              sx={{
                gap: 1.5,
              }}
            >
              <EditableField
                value={titleValue}
                onChange={(event) => setTitleValue(event.target.value)}
                // onBlur={(event) => updateTitle(event.target.value)}
                iconSize="21px"
                inputProps={{
                  sx: {
                    fontWeight: 700,
                    fontSize: 21,
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                    color: theme.palette.common.black,
                  },
                }}
                placeholder="Enter a how-to guide name"
                readonly={readonly}
              />
              <EditableField
                value={descriptionValue}
                onChange={(event) => setDescriptionValue(event.target.value)}
                // onBlur={(event) => updateTitle(event.target.value)}
                iconSize="21px"
                inputProps={{
                  sx: {
                    fontWeight: 500,
                    fontSize: 14,
                    lineHeight: 1.3,
                    letterSpacing: "-0.02em",
                    color: theme.palette.gray[90],
                    "&::placeholder": {
                      fontStyle: "italic",
                    },
                  },
                }}
                placeholder="Click here to add a description of the how-to process"
                readonly={readonly}
              />
            </Stack>

            {steps.map(({ title, description }, index) => (
              <Step
                key={index}
                index={index + 1}
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
              />
            ))}

            {!readonly ? (
              <Box>
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
          </Stack>
        </Card>
      </Box>
    </ThemeProvider>
  );
};
