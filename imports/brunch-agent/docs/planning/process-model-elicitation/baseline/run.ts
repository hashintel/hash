// Baseline-control interview runner (FE-1361).
//
// Runs one condition of the two-condition experiment: an interviewer model is asked to
// "interview me, then produce the model" against a simulated domain expert defined by
// situation-pack.md. Condition 1 sends no interviewer system prompt (bare Claude);
// condition 2 sends v0-prompt.md (the seven-category elicitation surface as guidance).
//
// Usage: ANTHROPIC_API_KEY=... bun run.ts <1|2> [--resume|--continue-final]
//   --resume          continue an interrupted run from its checkpoint
//   --continue-final  ask the interviewer to finish a final delivery that was cut off at
//                     max_tokens, and rewrite the artifacts with the merged message
//
// Outputs, under transcripts/:
//   condition-<n>.md        readable transcript with run metadata
//   condition-<n>.raw.json  full message arrays + per-call token usage (also the checkpoint)
//   condition-<n>-model.txt largest fenced code block of the final message, if any

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const INTERVIEWER_MODEL = 'claude-opus-5';
const EXPERT_MODEL = 'claude-sonnet-5';
const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';

// Interviewer turns, not exchanges. ReqElicitGym budgets 20; we force a wrap-up at 20 and
// hard-stop at 24 in case the model keeps talking instead of delivering.
const FORCE_WRAP_AT = 20;
const HARD_STOP_AT = 24;
// The scripted impatience probe (LLMREI: interviewers end too readily on impatience cues).
// Appended to the expert's reply on this exchange, identically in both conditions.
const IMPATIENCE_AT = 8;
const IMPATIENCE_LINE =
  "(Sorry — I've just seen the time, I have the floor huddle in ten minutes. How much more do you need?)";
const FORCED_WRAP_MESSAGE =
  'I really do have to stop here. Please produce the model now with everything you have.';
const CONTINUE_MESSAGE =
  'You were cut off mid-document. Continue exactly from where you stopped — no preamble, no repetition.';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
}

interface ApiResponse {
  content: Array<{ type: string; text?: string }>;
  usage: Usage;
  model: string;
  stop_reason: string;
}

interface CallRecord {
  agent: 'interviewer' | 'expert' | 'classifier';
  model: string;
  usage: Usage;
}

interface CallResult {
  text: string;
  truncated: boolean;
}

interface RawCheckpoint {
  startedAt: string;
  condition: string;
  stopReason: string;
  interviewerTurns: number;
  calls: CallRecord[];
  interviewerMessages: ChatMessage[];
}

const apiKey = process.env['ANTHROPIC_API_KEY'];
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set');
  process.exit(1);
}

function usage(): never {
  console.error('usage: bun run.ts <1|2> [--resume|--continue-final]');
  process.exit(1);
}

const conditionArg = process.argv[2];
const mode = process.argv[3] ?? 'fresh';
if (conditionArg !== '1' && conditionArg !== '2') usage();
if (!['fresh', '--resume', '--continue-final'].includes(mode)) usage();
const condition: '1' | '2' = conditionArg;

const baseDir = fileURLToPath(new URL('.', import.meta.url));
const transcriptDir = `${baseDir}transcripts`;
const rawPath = `${transcriptDir}/condition-${condition}.raw.json`;
const calls: CallRecord[] = [];

async function callClaude(
  agent: CallRecord['agent'],
  model: string,
  system: string | undefined,
  messages: ChatMessage[],
  maxTokens: number,
  options: { allowThinking?: boolean } = {},
): Promise<CallResult> {
  // The interviewer keeps the model's default (adaptive) thinking — that is part of "vanilla
  // Claude". The expert and classifier have it disabled: a thinking block that consumes the
  // whole token budget yields an empty text message, which the API then rejects on re-send.
  let tokenBudget = maxTokens;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey as string,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: tokenBudget,
        ...(options.allowThinking ? {} : { thinking: { type: 'disabled' } }),
        ...(system ? { system } : {}),
        messages,
      }),
    });
    if (response.status === 429 || response.status >= 500) {
      const waitMs = attempt * 15_000;
      console.error(`  ${agent}: HTTP ${response.status}, retrying in ${waitMs / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (!response.ok) {
      throw new Error(`${agent}: HTTP ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as ApiResponse;
    calls.push({ agent, model: data.model, usage: data.usage });
    const text = data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('\n');
    if (text.trim() === '') {
      // Adaptive thinking can consume the entire budget before any text is emitted.
      tokenBudget *= 2;
      console.error(
        `  ${agent}: empty text (blocks: ${data.content.map((block) => block.type).join(',')}), ` +
          `retrying with max_tokens=${tokenBudget}`,
      );
      continue;
    }
    return { text, truncated: data.stop_reason === 'max_tokens' };
  }
  throw new Error(`${agent}: exhausted retries`);
}

// The interviewer's final delivery can exceed one response budget; stitch continuations into
// a single message so the transcript holds the complete deliverable.
async function callInterviewer(
  system: string | undefined,
  messages: ChatMessage[],
): Promise<string> {
  let result = await callClaude('interviewer', INTERVIEWER_MODEL, system, messages, 16_000, {
    allowThinking: true,
  });
  let text = result.text;
  for (let piece = 1; result.truncated && piece <= 4; piece++) {
    console.error(`  interviewer: truncated, requesting continuation ${piece}`);
    result = await callClaude(
      'interviewer',
      INTERVIEWER_MODEL,
      system,
      [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: CONTINUE_MESSAGE },
      ],
      16_000,
      { allowThinking: true },
    );
    text += `\n${result.text}`;
  }
  return text;
}

async function loadSection(file: string): Promise<string> {
  const raw = await Bun.file(baseDir + file).text();
  const separatorIndex = raw.indexOf('\n---\n');
  return separatorIndex === -1 ? raw.trim() : raw.slice(separatorIndex + 5).trim();
}

async function isFinalModel(message: string): Promise<boolean> {
  const verdict = await callClaude(
    'classifier',
    CLASSIFIER_MODEL,
    'You label messages from an AI assistant that was asked to interview a user and then ' +
      'produce a process model. Answer with exactly YES or NO.',
    [
      {
        role: 'user',
        content:
          'Does the following message contain the final model deliverable (a complete model ' +
          'artifact such as a JSON document or a full structured model specification), as ' +
          'opposed to only questions, discussion, or interim summaries?\n\n<message>\n' +
          message +
          '\n</message>',
      },
    ],
    16,
  );
  return verdict.text.trim().toUpperCase().startsWith('YES');
}

function largestCodeBlock(message: string): string | undefined {
  const blocks = [...message.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((match) => match[1] ?? '');
  blocks.sort((a, b) => b.length - a.length);
  return blocks[0];
}

const openingMessage = await loadSection('opening-message.md');
const v0Prompt = condition === '2' ? await loadSection('v0-prompt.md') : undefined;
const situationPack = await Bun.file(baseDir + 'situation-pack.md').text();
await mkdir(transcriptDir, { recursive: true });

let interviewerMessages: ChatMessage[] = [{ role: 'user', content: openingMessage }];
const expertMessages: ChatMessage[] = [];
let stopReason = 'hard-stop';
let interviewerTurns = 0;
let startedAt = new Date().toISOString();

if (mode !== 'fresh') {
  const checkpoint = (await Bun.file(rawPath).json()) as RawCheckpoint;
  interviewerMessages = checkpoint.interviewerMessages;
  calls.push(...checkpoint.calls);
  interviewerTurns = interviewerMessages.filter((message) => message.role === 'assistant').length;
  startedAt = checkpoint.startedAt;
  stopReason = checkpoint.stopReason;
}

function writeCheckpoint(reason: string): Promise<number> {
  const checkpoint: RawCheckpoint = {
    startedAt,
    condition,
    stopReason: reason,
    interviewerTurns,
    calls,
    interviewerMessages,
  };
  return Bun.write(rawPath, JSON.stringify(checkpoint, null, 2));
}

async function writeArtifacts(): Promise<void> {
  const totals = calls.reduce(
    (accumulator, call) => {
      accumulator.input += call.usage.input_tokens;
      accumulator.output += call.usage.output_tokens;
      return accumulator;
    },
    { input: 0, output: 0 },
  );

  const header = [
    `# Baseline control — condition ${condition} (${condition === '1' ? 'bare' : 'v0 prompt'})`,
    '',
    `- Run started: ${startedAt}`,
    `- Interviewer: ${INTERVIEWER_MODEL}${
      condition === '2' ? ' + v0-prompt.md' : ' (no system prompt)'
    }`,
    `- Simulated expert: ${EXPERT_MODEL} + situation-pack.md`,
    `- Interviewer turns: ${interviewerTurns} (impatience probe at ${IMPATIENCE_AT}, forced wrap at ${FORCE_WRAP_AT})`,
    `- Stop reason: ${stopReason}`,
    `- Tokens: ${totals.input} in / ${totals.output} out across ${calls.length} calls`,
    '',
    '---',
    '',
  ].join('\n');

  const body = interviewerMessages
    .map((message, index) => {
      const speaker =
        message.role === 'assistant'
          ? '**Interviewer**'
          : index === 0
            ? '**Opening message**'
            : '**Expert (Marta)**';
      return `${speaker}:\n\n${message.content}`;
    })
    .join('\n\n---\n\n');

  await Bun.write(`${transcriptDir}/condition-${condition}.md`, header + body + '\n');
  await writeCheckpoint(stopReason);

  const finalMessage = interviewerMessages.at(-1);
  const modelBlock =
    finalMessage?.role === 'assistant' ? largestCodeBlock(finalMessage.content) : undefined;
  if (modelBlock) {
    await Bun.write(`${transcriptDir}/condition-${condition}-model.txt`, modelBlock);
  }

  console.error(
    `done: ${stopReason} after ${interviewerTurns} interviewer turns; ` +
      `${totals.input} in / ${totals.output} out`,
  );
}

if (mode === '--continue-final') {
  const final = interviewerMessages.at(-1);
  if (final?.role !== 'assistant') {
    console.error('checkpoint does not end with an interviewer message; nothing to continue');
    process.exit(1);
  }
  const priorMessages = interviewerMessages.slice(0, -1);
  const continued = await callInterviewer(v0Prompt, [
    ...priorMessages,
    final,
    { role: 'user', content: CONTINUE_MESSAGE },
  ]);
  final.content += `\n${continued}`;
  await writeArtifacts();
  process.exit(0);
}

if (mode === '--resume') {
  // Checkpoints are written after complete exchanges only, but tolerate a trailing
  // assistant message by regenerating that turn.
  stopReason = 'hard-stop';
  const last = interviewerMessages.at(-1);
  if (last?.role === 'assistant') interviewerMessages.pop();
  for (const message of interviewerMessages.slice(1)) {
    expertMessages.push({
      role: message.role === 'assistant' ? 'user' : 'assistant',
      content: message.content,
    });
  }
  interviewerTurns = interviewerMessages.filter((message) => message.role === 'assistant').length;
  console.error(`resuming condition ${condition} at interviewer turn ${interviewerTurns + 1}`);
}

while (interviewerTurns < HARD_STOP_AT) {
  interviewerTurns++;
  console.error(`turn ${interviewerTurns} (interviewer)`);
  const interviewerText = await callInterviewer(v0Prompt, interviewerMessages);
  interviewerMessages.push({ role: 'assistant', content: interviewerText });
  expertMessages.push({ role: 'user', content: interviewerText });

  if (await isFinalModel(interviewerText)) {
    stopReason = interviewerTurns > FORCE_WRAP_AT ? 'delivered-after-forced-wrap' : 'delivered';
    break;
  }

  let expertText: string;
  if (interviewerTurns >= FORCE_WRAP_AT) {
    expertText = FORCED_WRAP_MESSAGE;
  } else {
    console.error(`turn ${interviewerTurns} (expert)`);
    const expertResult = await callClaude(
      'expert',
      EXPERT_MODEL,
      situationPack,
      expertMessages,
      1_500,
    );
    expertText = expertResult.text;
    if (interviewerTurns === IMPATIENCE_AT) {
      expertText = `${expertText}\n\n${IMPATIENCE_LINE}`;
    }
  }
  interviewerMessages.push({ role: 'user', content: expertText });
  expertMessages.push({ role: 'assistant', content: expertText });
  await writeCheckpoint('in-progress');
}

await writeArtifacts();
