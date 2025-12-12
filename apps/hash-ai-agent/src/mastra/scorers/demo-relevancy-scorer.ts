import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/prebuilt';

export const relevancyScorer = createAnswerRelevancyScorer({ model: 'openrouter/openai/gpt-oss-120b' });
