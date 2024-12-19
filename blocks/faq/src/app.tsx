import type { LinkEntityAndRightEntity } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { EditableField, GetHelpLink } from "@hashintel/block-design-system";
import { Button, faPlus, FontAwesomeIcon } from "@hashintel/design-system";
import { theme } from "@hashintel/design-system/theme";
import {
  Card,
  Collapse,
  Fade,
  Stack,
  Switch,
  ThemeProvider,
  Typography,
} from "@mui/material";
import Box from "@mui/material/Box";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { Question } from "./question";
import type {
  BlockEntity,
  FAQBlockOutgoingLinksByLinkEntityTypeId,
  FrequentlyAskedQuestion,
  FrequentlyAskedQuestionProperties,
} from "./types/generated/block-entity";

type RootEntityKey = keyof BlockEntity["properties"];
type QuestionEntityKey = keyof FrequentlyAskedQuestionProperties;

type LinkType = keyof FAQBlockOutgoingLinksByLinkEntityTypeId;

// Property types
export const titleKey: RootEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/";
export const descriptionKey: RootEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/";
export const sectionsShouldBeNumberedKey: RootEntityKey =
  "https://blockprotocol.org/@hash/types/property-type/sections-should-be-numbered/";
export const answerVisibilityIsConfigurableKey: RootEntityKey =
  "https://blockprotocol.org/@hash/types/property-type/answer-visibility-is-configurable/";
export const questionKey: QuestionEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/question/";
export const answerKey: QuestionEntityKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/answer/";

// Relevant Entity Types
const frequentlyAskedQuestionType =
  "https://blockprotocol.org/@hash/types/entity-type/frequently-asked-question/v/1";

// Link Entity Types
const hasFrequentlyAskedQuestion: LinkType =
  "https://blockprotocol.org/@hash/types/entity-type/has-frequently-asked-question/v/1";

export type QuestionOrAnswer = typeof questionKey | typeof answerKey;
export type EntityType = typeof frequentlyAskedQuestionType;

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
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

  const {
    [titleKey]: title,
    [descriptionKey]: description,
    [sectionsShouldBeNumberedKey]: shouldDisplayQuestionNumbers,
    [answerVisibilityIsConfigurableKey]: shouldDisplayQuestionToggles,
  } = properties;

  const questionLinkedEntities: LinkEntityAndRightEntity[] = useMemo(
    () =>
      linkedEntities.filter(
        ({ linkEntity }) =>
          linkEntity.metadata.entityTypeId === hasFrequentlyAskedQuestion,
      ),
    [linkedEntities],
  );

  const questionEntities: FrequentlyAskedQuestion[] | undefined =
    questionLinkedEntities.map((linkEntity) => linkEntity.rightEntity);

  const [hovered, setHovered] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [descriptionValue, setDescriptionValue] = useState(description);
  const [displayNumbers, setDisplayNumbers] = useState(
    shouldDisplayQuestionNumbers ?? true,
  );
  const [displayToggles, setDisplayToggles] = useState(
    shouldDisplayQuestionToggles ?? true,
  );
  const [questions, setQuestions] = useState<
    {
      id: string;
      properties: FrequentlyAskedQuestionProperties;
      animatingOut?: boolean;
    }[]
  >(
    questionEntities.map((questionEntity) => ({
      id: questionEntity.metadata.recordId.entityId,
      properties: questionEntity.properties,
    })),
  );

  const updateField = async (value: string | boolean, field: RootEntityKey) => {
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

  const createFrequentlyAskedQuestionEntity = useCallback(async () => {
    if (readonly) {
      return;
    }

    const createEntityResponse = await graphModule.createEntity({
      data: {
        entityTypeId: frequentlyAskedQuestionType,
        properties: {},
      },
    });

    const createdEntityId =
      createEntityResponse.data?.metadata.recordId.entityId;

    if (createdEntityId) {
      await graphModule.createEntity({
        data: {
          entityTypeId: hasFrequentlyAskedQuestion,
          properties: {},
          linkData: {
            leftEntityId: entityId,
            rightEntityId: createdEntityId,
          },
        },
      });
    }
  }, [graphModule, entityId, readonly]);

  const addQuestion = useCallback(async () => {
    setQuestions([...questions, { id: uuid(), properties: {} }]);
    await createFrequentlyAskedQuestionEntity();
  }, [questions, createFrequentlyAskedQuestionEntity]);

  const updateQuestionField = async (
    index: number,
    value: string,
    field: QuestionOrAnswer,
  ) => {
    const questionEntity = questionEntities[index];

    if (!questionEntity) {
      return;
    }

    await graphModule.updateEntity({
      data: {
        entityId: questionEntity.metadata.recordId.entityId,
        entityTypeId: frequentlyAskedQuestionType,
        properties: {
          ...questionEntity.properties,
          [field]: value,
        },
      },
    });
  };

  const removeQuestion = (index: number) => {
    setQuestions(
      questions.map((question, questionIndex) => {
        if (index === questionIndex) {
          return { ...question, animatingOut: true };
        }
        return question;
      }),
    );
  };

  useEffect(() => {
    if (!readonly && !questionEntities.length) {
      void addQuestion();
    }
    // We only want to run this once when the block is initiated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schema = useMemo(() => {
    const questionsWithTitle = questionEntities.filter(
      ({ properties: { [questionKey]: schemaQuestion } }) => !!schemaQuestion,
    );

    return JSON.stringify({
      "@context": "http://schema.org",
      "@type": "FAQPage",
      mainEntity: questionsWithTitle.map(
        ({
          properties: {
            [questionKey]: schemaQuestion,
            [answerKey]: schemaAnswer,
          },
        }) => ({
          "@type": "Question",
          name: schemaQuestion,
          acceptedAnswer: {
            "@type": "Answer",
            text: schemaAnswer ?? schemaQuestion,
          },
        }),
      ),
    });
  }, [questionEntities]);

  const shouldDisplayIntro = !!title || !!description || !readonly;

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
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
              <Box
                sx={{
                  display: "flex",
                  columnGap: 3,
                  rowGap: 1,
                  flexWrap: "wrap",
                  mb: 1.5,
                }}
              >
                <GetHelpLink href="https://blockprotocol.org/@hash/blocks/faq" />

                <Box display="flex" flexWrap="wrap" rowGap={1} columnGap={3}>
                  <Box display="flex" gap={1}>
                    <Typography
                      sx={{
                        fontWeight: 500,
                        fontSize: 15,
                        lineHeight: 1,
                        color: ({ palette }) => palette.gray[50],
                      }}
                    >
                      Show numbers?
                    </Typography>
                    <Switch
                      size="small"
                      checked={displayNumbers}
                      onChange={(event) => {
                        setDisplayNumbers(event.target.checked);
                        void updateField(
                          event.target.checked,
                          sectionsShouldBeNumberedKey,
                        );
                      }}
                    />
                  </Box>

                  <Box display="flex" gap={1}>
                    <Typography
                      sx={{
                        fontWeight: 500,
                        fontSize: 15,
                        lineHeight: 1,
                        color: ({ palette }) => palette.gray[50],
                      }}
                    >
                      Show toggles?
                    </Typography>
                    <Switch
                      size="small"
                      checked={displayToggles}
                      onChange={(event) => {
                        setDisplayToggles(event.target.checked);
                        void updateField(
                          event.target.checked,
                          answerVisibilityIsConfigurableKey,
                        );
                      }}
                    />
                  </Box>
                </Box>
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
                    border: ({ palette }) => `1px solid ${palette.gray[20]}`,
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
            {shouldDisplayIntro ? (
              <Stack
                sx={{
                  gap: 1.5,
                }}
              >
                <EditableField
                  value={titleValue}
                  onChange={(event) => {
                    setTitleValue(event.target.value);
                  }}
                  onBlur={(event) => updateField(event.target.value, titleKey)}
                  sx={{
                    fontWeight: 700,
                    fontSize: 21,
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                    color: theme.palette.common.black,
                  }}
                  placeholder="Enter an optional FAQ section title"
                  readonly={readonly}
                />

                <EditableField
                  editIconFontSize={14}
                  value={descriptionValue}
                  onChange={(event) => {
                    setDescriptionValue(event.target.value);
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
                  placeholder="Enter an optional description/introduction"
                  placeholderSx={{
                    fontStyle: "italic",
                  }}
                  readonly={readonly}
                />
              </Stack>
            ) : null}

            <Box>
              {questions.map((question, index) => (
                <Collapse
                  key={question.id}
                  in={!question.animatingOut}
                  onExited={async () => {
                    const newQuestions = [...questions];
                    newQuestions.splice(index, 1);
                    setQuestions(newQuestions);

                    const questionLink =
                      questionLinkedEntities[index]?.linkEntity;

                    if (!questionLink) {
                      return;
                    }

                    await graphModule.deleteEntity({
                      data: {
                        entityId: questionLink.metadata.recordId.entityId,
                      },
                    });
                  }}
                  appear
                >
                  <Box
                    sx={{
                      mb: index === questions.length - 1 ? 0 : 3,
                      transition: ({ transitions }) =>
                        transitions.create("margin-bottom"),
                    }}
                  >
                    <Question
                      index={index + 1}
                      question={question.properties[questionKey]}
                      answer={question.properties[answerKey]}
                      updateField={(value, field) =>
                        updateQuestionField(index, value, field)
                      }
                      onRemove={() => removeQuestion(index)}
                      readonly={readonly}
                      deletable={questionEntities.length > 1}
                      displayNumber={displayNumbers}
                      displayToggle={displayToggles}
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
                  onClick={addQuestion}
                >
                  <FontAwesomeIcon
                    icon={{ icon: faPlus }}
                    sx={{ mr: 1, fontSize: 13 }}
                  />
                  Add a question
                </Button>
              </Box>
            ) : null}
          </Card>
        </Box>
      </ThemeProvider>
    </>
  );
};
