import {
  useEntitySubgraph,
  useGraphBlockModule,
  type BlockComponent,
} from "@blockprotocol/graph/react";
import {
  Button,
  faPlus,
  FontAwesomeIcon,
  theme,
} from "@hashintel/design-system";
import {
  Card,
  Collapse,
  Fade,
  Link,
  Stack,
  ThemeProvider,
} from "@mui/material";
import Box from "@mui/material/Box";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditableField } from "./editable-field";
import { Step } from "./step";
import { HowToStep, IntroductionLink, RootEntity } from "./types";
import { LinkEntityAndRightEntity } from "@blockprotocol/graph/.";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";

export const titleKey =
  "http://localhost:3000/@lbett/types/property-type/title/";
export const descriptionKey =
  "http://localhost:3000/@lbett/types/property-type/description/";

const howToStepType =
  "http://localhost:3000/@lbett/types/entity-type/howto-step/v/3";
const introductionLinkType =
  "http://localhost:3000/@lbett/types/entity-type/introduction-link/v/1";
const stepLinkType =
  "http://localhost:3000/@lbett/types/entity-type/step-link/v/1";

export type TitleOrDescription = typeof titleKey | typeof descriptionKey;
export type Link = typeof introductionLinkType | typeof stepLinkType;

export interface Step {
  id?: string;
  title: string;
  description: string;
  animatingOut?: boolean;
}

const EMPTY_STEP: Step = { title: "", description: "" };

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  if (!blockEntitySubgraph) {
    throw new Error("No blockEntitySubgraph provided");
  }
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);
  const { rootEntity: blockEntity, linkedEntities } =
    useEntitySubgraph(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId },
      entityTypeId,
    },
    properties,
  } = blockEntity;

  const { [titleKey]: title, [descriptionKey]: description } = properties;

  const introLinkedEntity: LinkEntityAndRightEntity = useMemo(
    () =>
      linkedEntities.find(
        ({ linkEntity }) =>
          linkEntity?.metadata.entityTypeId === introductionLinkType,
      ),
    [linkedEntities],
  )!;

  const introEntity: HowToStep | undefined = introLinkedEntity?.rightEntity;
  const introLinkEntity: IntroductionLink | undefined =
    introLinkedEntity?.linkEntity;

  const stepLinkedEntities: LinkEntityAndRightEntity[] = useMemo(
    () =>
      linkedEntities.filter(
        ({ linkEntity }) => linkEntity?.metadata.entityTypeId === stepLinkType,
      ),
    [linkedEntities],
  )!;

  const stepEntities: HowToStep[] | undefined = stepLinkedEntities?.map(
    (linkEntity) => linkEntity.rightEntity,
  );

  const [hovered, setHovered] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [descriptionValue, setDescriptionValue] = useState(description);
  const [introduction, setIntroduction] = useState<Step | null>(
    introEntity
      ? {
          title: introEntity.properties[titleKey] ?? "",
          description: introEntity.properties[descriptionKey] ?? "",
        }
      : null,
  );
  const [steps, setSteps] = useState<Step[]>(
    stepEntities.length
      ? stepEntities.map((stepEntity) => ({
          id: stepEntity.metadata.recordId.entityId,
          title: stepEntity.properties[titleKey] ?? "",
          description: stepEntity.properties[descriptionKey] ?? "",
        }))
      : [],
  );

  const updateField = async (value: string, field: TitleOrDescription) => {
    await graphModule?.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {
          ...properties,
          [field]: value,
        },
      },
    });
  };

  const createStepEntity = async (
    linkType: Link,
    cb: (createdEntityId: string) => void,
  ) => {
    if (readonly) {
      return;
    }

    const createEntityResponse = await graphModule?.createEntity({
      data: {
        entityTypeId: howToStepType,
        properties: {},
      },
    });

    const createdEntityId =
      createEntityResponse?.data?.metadata.recordId.entityId;

    if (createdEntityId) {
      await graphModule?.createEntity({
        data: {
          entityTypeId: linkType,
          properties: {},
          linkData: {
            leftEntityId: entityId,
            rightEntityId: createdEntityId,
          },
        },
      });

      cb(createdEntityId);
    }
  };

  const createIntroduction = () =>
    createStepEntity(introductionLinkType, (introductionEntityId) => {
      setIntroduction({ id: introductionEntityId, ...EMPTY_STEP });
    });

  const setIntroductionField = (value: string | boolean, field: keyof Step) => {
    if (introduction) {
      setIntroduction({ ...introduction, [field]: value });
    }
  };

  const updateIntroductionField = async (
    value: string | boolean,
    field: TitleOrDescription,
  ) => {
    if (introduction) {
      setIntroductionField(value, field === titleKey ? "title" : "description");
    }

    await graphModule?.updateEntity({
      data: {
        entityId: introEntity.metadata.recordId.entityId,
        entityTypeId: howToStepType,
        properties: {
          ...introEntity.properties,
          [field]: value,
        },
      },
    });
  };

  const removeIntroduction = () => {
    setIntroductionField(true, "animatingOut");

    setTimeout(async () => {
      setIntroduction(null);

      await graphModule?.deleteEntity({
        data: {
          entityId: introLinkEntity.metadata.recordId.entityId,
        },
      });
    }, 300);
  };

  const addStep = () =>
    createStepEntity(stepLinkType, (stepEntityId) => {
      setSteps([...steps, { id: stepEntityId, ...EMPTY_STEP }]);
    });

  const setStepField = (
    index: number,
    value: string | boolean,
    field: keyof Step,
  ) => {
    const newSteps = steps.map((step, stepIndex) => {
      if (stepIndex === index) {
        return { ...step, [field]: value };
      }

      return step;
    });

    setSteps(newSteps);
  };

  const updateStepField = async (
    index: number,
    value: string,
    field: TitleOrDescription,
  ) => {
    const linkedStep = stepEntities.find(
      (stepEntity) =>
        stepEntity.metadata.recordId.entityId === steps[index]?.id,
    );

    if (!linkedStep) {
      return;
    }

    setStepField(index, value, field === titleKey ? "title" : "description");

    await graphModule?.updateEntity({
      data: {
        entityId: linkedStep.metadata.recordId.entityId,
        entityTypeId: howToStepType,
        properties: {
          ...linkedStep.properties,
          [field]: value,
        },
      },
    });
  };

  const removeStep = (index: number) => {
    const stepLink = stepLinkedEntities.find(
      (linkedEntity) =>
        linkedEntity.rightEntity.metadata.recordId.entityId ===
        steps[index]?.id,
    )?.linkEntity;

    if (!stepLink) {
      return;
    }

    const newSteps = [...steps];
    setStepField(index, true, "animatingOut");

    setTimeout(async () => {
      newSteps.splice(index, 1);
      setSteps(newSteps);

      await graphModule?.deleteEntity({
        data: {
          entityId: stepLink.metadata.recordId.entityId,
        },
      });
    }, 300);
  };

  useEffect(() => {
    if (!stepEntities.length) {
      addStep();
    }
  }, []);

  const schema = JSON.stringify({
    "@context": "http://schema.org",
    "@type": "HowTo",
    name: title,
    ...(steps.length
      ? {
          step: steps.map((step) => ({
            "@type": "HowToStep",
            name: step.title,
            text: step.description,
          })),
        }
      : {}),
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: schema }}
      />
      <ThemeProvider theme={theme}>
        <Box
          ref={blockRootRef}
          sx={{ display: "inline-block", width: 1 }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {!readonly ? (
            <Fade in={hovered}>
              <Box sx={{ display: "flex", columnGap: 3, flexWrap: "wrap" }}>
                <Link
                  href="https://blockprotocol.org/@hash/how-to"
                  target="_blank"
                  variant="regularTextLabels"
                  sx={({ palette }) => ({
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                    fontSize: 15,
                    lineHeight: 1,
                    letterSpacing: -0.02,
                    marginBottom: 1.5,
                    whiteSpace: "nowrap",
                    color: palette.gray[50],
                    fill: palette.gray[40],
                    ":hover": {
                      color: palette.gray[60],
                      fill: palette.gray[50],
                    },
                  })}
                >
                  Get help{" "}
                  <FontAwesomeIcon
                    icon={faQuestionCircle}
                    sx={{ fontSize: 16, ml: 1, fill: "inherit" }}
                  />
                </Link>
              </Box>
            </Fade>
          ) : null}

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
                onBlur={(event) => updateField(event.target.value, titleKey)}
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
                onBlur={(event) =>
                  updateField(event.target.value, descriptionKey)
                }
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
                onClick={() => createIntroduction()}
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
                  setField={setIntroductionField}
                  updateField={updateIntroductionField}
                  onRemove={() => removeIntroduction()}
                  readonly={readonly}
                  deleteButtonText="Remove intro"
                />
              </Box>
            </Collapse>

            <Box>
              {steps.map((step, index) => (
                <Collapse key={step.id} in={!step.animatingOut} appear>
                  <Box
                    sx={{
                      mt: 3,
                      transition: ({ transitions }) =>
                        transitions.create("margin-top"),
                    }}
                  >
                    <Step
                      header={`Step ${index + 1}`}
                      title={step.title}
                      description={step.description}
                      setField={(value, field) =>
                        setStepField(index, value, field)
                      }
                      updateField={(value, field) =>
                        updateStepField(index, value, field)
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
    </>
  );
};
