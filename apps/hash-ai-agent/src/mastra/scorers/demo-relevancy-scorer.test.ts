/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-console */
// tests/answerRelevancy.test.ts
import { runEvals } from '@mastra/core/evals';
import { describe, expect, it } from 'vitest';

import { mastra } from '../index'; // import the instance above

describe('relevancy scorer', () => {
  it('scores a simple answer', async () => {
    const scorer = mastra.getScorer('relevancyScorer');
    const target = mastra.getAgent('genericAgent');

    const result = await runEvals({
      data: [
        {
          input: 'What are the health benefits of regular exercise?',
        },
        {
          input: 'What should a healthy breakfast include?',
        },
        {
          input: 'What are the benefits of meditation?',
        },
      ],
      scorers: [scorer],
      target,
      onItemComplete: ({ scorerResults }) => {
        console.log(scorerResults);
        // console.log({
        //   score: scorerResults[scorer.id]?.score,
        //   reason: scorerResults[scorer.id]?.reason,
        // });
      },
    });

    expect(result.scores[scorer.id]).toBeGreaterThan(0.8);
  });
});

/*

const result = await runEvals({
  data: [
    {
      input: 'What are the health benefits of regular exercise?',
    },
    {
      input: 'What should a healthy breakfast include?',
    },
    {
      input: 'What are the benefits of meditation?',
    },
  ],
  scorers: [scorer],
  // target: myAgent,
  onItemComplete: ({ scorerResults }) => {
    console.log({
      score: scorerResults[scorer.id].score,
      reason: scorerResults[scorer.id].reason,
    });
  },
});

*/
