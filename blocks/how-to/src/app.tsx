import type { LinkEntityAndRightEntity } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { EditableField, GetHelpLink } from "@hashintel/block-design-system";
import { Button, faPlus, FontAwesomeIcon } from "@hashintel/design-system";
import { theme } from "@hashintel/design-system/theme";
import { Card, Collapse, Fade, Stack, ThemeProvider } from "@mui/material";
import Box from "@mui/material/Box";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SizeMe } from "react-sizeme";
import { v4 as uuid } from "uuid";

import { Step } from "./step";
import type {
  BlockEntity,
  HasHowToBlockIntroduction,
  HowToBlockIntroduction,
  HowToBlockOutgoingLinkAndTarget,
  HowToBlockOutgoingLinksByLinkEntityTypeId,
  HowToBlockStep,
  HowToBlockStepProperties,
} from "./types/generated/block-entity";

type BlockEntityKey = keyof BlockEntity["properties"];
type LinkType = keyof HowToBlockOutgoingLinksByLinkEntityTypeId;

// Property types
export const titleKey: BlockEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/";
export const descriptionKey: BlockEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/";

// Relevant Entity Types
const howToBlockStepType =
  "https://blockprotocol.org/@hash/types/entity-type/how-to-block-step/v/2";
const howToBlockIntroductionType =
  "https://blockprotocol.org/@hash/types/entity-type/how-to-block-introduction/v/2";

// Link Entity Types
const hasHowToBlockStep: LinkType =
  "https://blockprotocol.org/@hash/types/entity-type/has-how-to-block-step/v/1";
const hasHowToBlockIntroduction: LinkType =
  "https://blockprotocol.org/@hash/types/entity-type/has-how-to-block-introduction/v/1";

export type TitleOrDescription = typeof titleKey | typeof descriptionKey;
export type EntityType =
  | typeof howToBlockIntroductionType
  | typeof howToBlockStepType;

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRootRef);
  const { rootEntity: blockEntity, linkedEntities } = useEntitySubgraph<
    BlockEntity,
    HowToBlockOutgoingLinkAndTarget[]
  >(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId },
      entityTypeId,
    },
    properties,
  } = blockEntity;

  const { [titleKey]: title, [descriptionKey]: description } = properties;

  const introLinkedEntity:
    | HowToBlockOutgoingLinksByLinkEntityTypeId["https://blockprotocol.org/@hash/types/entity-type/has-how-to-block-introduction/v/1"]
    | undefined = useMemo(
    () =>
      linkedEntities.find(
        ({ linkEntity }) =>
          linkEntity.metadata.entityTypeId === hasHowToBlockIntroduction,
      ),
    [linkedEntities],
  );

  const introEntity: HowToBlockIntroduction | undefined =
    introLinkedEntity?.rightEntity;
  const introLinkEntity: HasHowToBlockIntroduction | undefined =
    introLinkedEntity?.linkEntity;

  const stepLinkedEntities: LinkEntityAndRightEntity[] = useMemo(
    () =>
      linkedEntities.filter(
        ({ linkEntity }) =>
          linkEntity.metadata.entityTypeId === hasHowToBlockStep,
      ),
    [linkedEntities],
  );

  const stepEntities: HowToBlockStep[] | undefined = stepLinkedEntities.map(
    (linkEntity) => linkEntity.rightEntity,
  );

  const [hovered, setHovered] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [descriptionValue, setDescriptionValue] = useState(description);
  const [steps, setSteps] = useState<
    {
      id: string;
      properties: HowToBlockStepProperties;
      animatingOut?: boolean;
    }[]
  >(
    stepEntities.map((stepEntity) => ({
      id: stepEntity.metadata.recordId.entityId,
      properties: stepEntity.properties,
    })),
  );
  const [introButtonAnimatingOut, setIntroButtonAnimatingOut] = useState(false);
  const [introAnimatingOut, setIntroAnimatingOut] = useState(false);

  const updateField = async (value: string, field: TitleOrDescription) => {
    await graphModule.updateEntity({
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

  const createHowToEntity = useCallback(
    async (entityType: EntityType, linkType: LinkType) => {
      if (readonly) {
        return;
      }

      const createEntityResponse = await graphModule.createEntity({
        data: {
          entityTypeId: entityType,
          properties: {},
        },
      });

      const createdEntityId =
        createEntityResponse.data?.metadata.recordId.entityId;

      if (createdEntityId) {
        await graphModule.createEntity({
          data: {
            entityTypeId: linkType,
            properties: {},
            linkData: {
              leftEntityId: entityId,
              rightEntityId: createdEntityId,
            },
          },
        });
      }
    },
    [graphModule, entityId, readonly],
  );

  const createIntroduction = async () => {
    setIntroButtonAnimatingOut(true);
    await createHowToEntity(
      howToBlockIntroductionType,
      hasHowToBlockIntroduction,
    );
  };

  const updateIntroductionField = async (
    value: string | boolean,
    field: TitleOrDescription,
  ) => {
    if (introEntity) {
      await graphModule.updateEntity({
        data: {
          entityId: introEntity.metadata.recordId.entityId,
          entityTypeId: howToBlockIntroductionType,
          properties: {
            ...introEntity.properties,
            [field]: value,
          },
        },
      });
    }
  };

  const removeIntroduction = async () => {
    setIntroAnimatingOut(true);

    if (introLinkEntity) {
      await graphModule.deleteEntity({
        data: {
          entityId: introLinkEntity.metadata.recordId.entityId,
        },
      });
    }
  };

  const addStep = useCallback(async () => {
    setSteps([...steps, { id: uuid(), properties: {} }]);
    await createHowToEntity(howToBlockStepType, hasHowToBlockStep);
  }, [steps, createHowToEntity]);

  const updateStepField = async (
    index: number,
    value: string,
    field: TitleOrDescription,
  ) => {
    const stepEntity = stepEntities[index];

    if (!stepEntity) {
      return;
    }

    await graphModule.updateEntity({
      data: {
        entityId: stepEntity.metadata.recordId.entityId,
        entityTypeId: howToBlockStepType,
        properties: {
          ...stepEntity.properties,
          [field]: value,
        },
      },
    });
  };

  const removeStep = (index: number) => {
    setSteps(
      steps.map((step, stepIndex) => {
        if (index === stepIndex) {
          return { ...step, animatingOut: true };
        }
        return step;
      }),
    );
  };

  useEffect(() => {
    if (!stepEntities.length) {
      void addStep();
    }
    // We only want to run this once when the block is initiated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schema = useMemo(() => {
    const stepsWithTitle = stepEntities.filter(
      ({ properties: { [titleKey]: schemaTitle } }) => !!schemaTitle,
    );

    return JSON.stringify({
      "@context": "http://schema.org",
      "@type": "HowTo",
      name: title,
      // Must have at least 2 steps for it to be valid
      ...(stepsWithTitle.length > 1
        ? {
            step: stepsWithTitle.map(
              ({
                properties: {
                  [titleKey]: schemaTitle,
                  [descriptionKey]: schemaDescription,
                },
              }) => ({
                "@type": "HowToStep",
                name: schemaTitle,
                text: schemaDescription ?? schemaTitle,
              }),
            ),
          }
        : {}),
    });
  }, [title, stepEntities]);

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: schema }}
      />
      <ThemeProvider theme={theme}>
        <SizeMe>
          {({ size }) => {
            const isMobile = (size.width ?? 0) < 800;

            return (
              <Box
                ref={blockRootRef}
                sx={{ display: "inline-block", width: 1 }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
              >
                {!readonly ? (
                  <Fade in={hovered}>
                    <Box
                      sx={{
                        display: "flex",
                        columnGap: 3,
                        flexWrap: "wrap",
                        mb: 1.5,
                      }}
                    >
                      <GetHelpLink href="https://blockprotocol.org/@hash/blocks/how-to" />
                    </Box>
                  </Fade>
                ) : null}

                <Card
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    ...(!readonly
                      ? {
                          border: ({ palette }) =>
                            `1px solid ${palette.gray[20]}`,
                          borderRadius: 2.5,
                          boxShadow: "none",
                          paddingY: 3,
                          paddingX: 3.75,
                        }
                      : {
                          background: "none",
                          boxShadow: "none",
                        }),
                  }}
                >
                  {title || description || !readonly ? (
                    <Stack
                      sx={{
                        gap: 1.5,
                      }}
                    >
                      <EditableField
                        value={titleValue}
                        onChange={(event) => {
                          if (!readonly) {
                            setTitleValue(event.target.value);
                          }
                        }}
                        onBlur={(event) =>
                          updateField(event.target.value, titleKey)
                        }
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
                        editIconFontSize={14}
                        value={descriptionValue}
                        onChange={(event) => {
                          if (!readonly) {
                            setDescriptionValue(event.target.value);
                          }
                        }}
                        onBlur={(event) => {
                          void updateField(event.target.value, descriptionKey);
                        }}
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
                  ) : null}

                  {(introEntity ?? !readonly) ? (
                    <Box>
                      <Collapse
                        in={!readonly && !introEntity && !introAnimatingOut}
                        onExited={() => setIntroButtonAnimatingOut(false)}
                      >
                        <Button
                          variant="tertiary"
                          size="small"
                          sx={{ fontSize: 14 }}
                          onClick={() => createIntroduction()}
                          disabled={introButtonAnimatingOut}
                        >
                          <FontAwesomeIcon
                            icon={{ icon: faPlus }}
                            sx={{ mr: 1, fontSize: 13 }}
                          />
                          Add Introduction
                        </Button>
                      </Collapse>

                      <Collapse
                        in={!!introEntity && !introButtonAnimatingOut}
                        onExited={() => setIntroAnimatingOut(false)}
                        appear
                      >
                        <Step
                          header="Introduction"
                          title={introEntity?.properties[titleKey] ?? ""}
                          titlePlaceholder="Requirements, Ingredients, Pre-requisites, etc."
                          description={
                            introEntity?.properties[descriptionKey] ?? ""
                          }
                          descriptionPlaceholder="Enter a list of things that might be helpful for people to know before they begin."
                          updateField={updateIntroductionField}
                          onRemove={() => removeIntroduction()}
                          readonly={readonly}
                          deleteButtonText="Remove intro"
                        />
                      </Collapse>
                    </Box>
                  ) : null}

                  <Box>
                    {steps.map((step, index) => (
                      <Collapse
                        key={step.id}
                        in={!step.animatingOut}
                        onExited={async () => {
                          const newSteps = [...steps];
                          newSteps.splice(index, 1);
                          setSteps(newSteps);

                          const stepLink =
                            stepLinkedEntities[index]?.linkEntity;

                          if (!stepLink) {
                            return;
                          }

                          await graphModule.deleteEntity({
                            data: {
                              entityId: stepLink.metadata.recordId.entityId,
                            },
                          });
                        }}
                        appear
                      >
                        <Box
                          sx={{
                            mb: index === steps.length - 1 ? 0 : 3,
                            transition: ({ transitions }) =>
                              transitions.create("margin-bottom"),
                          }}
                        >
                          <Step
                            header={`Step ${index + 1}`}
                            headerSx={{
                              fontSize: 12,
                              textTransform: "uppercase",
                            }}
                            title={step.properties[titleKey]}
                            titlePlaceholder="Step name goes here"
                            description={step.properties[descriptionKey]}
                            descriptionPlaceholder={
                              isMobile
                                ? "Additional instructions here"
                                : "Detailed instructions associated with the step can be added here. Click to start typing."
                            }
                            updateField={(value, field) =>
                              updateStepField(index, value, field)
                            }
                            onRemove={() => removeStep(index)}
                            readonly={readonly}
                            deletable={stepEntities.length > 1}
                            deleteButtonText="Remove step"
                          />
                        </Box>
                      </Collapse>
                    ))}
                  </Box>

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
                </Card>
              </Box>
            );
          }}
        </SizeMe>
      </ThemeProvider>
    </>
  );
};
