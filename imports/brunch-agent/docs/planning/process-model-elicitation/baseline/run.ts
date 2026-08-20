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
//   condition-<n>-model.txt the final delivery message, verbatim (delivered runs only)

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

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
  // Present only when the API ended this model-generated message at its token limit.
  // Older checkpoints and human-authored messages legitimately omit it.
  truncated?: true;
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  // Absent in checkpoints written before the SDK migration; treated as 0.
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
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
  calls: CallRecord[];
  interviewerMessages: ChatMessage[];
}

const apiKey = process.env['ANTHROPIC_API_KEY'];
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set');
  process.exit(1);
}

// The SDK owns transport robustness the hand-rolled fetch client got wrong:
// network-level failures (TCP reset, DNS blip) are retried rather than
// crashing the run hours in, backoff honours retry-after, and the typed
// usage carries the cache-token fields the hand-typed response omitted.
// The timeout is explicit because without one the SDK refuses non-streaming
// requests whose max_tokens imply more than 10 minutes — which the
// empty-text retry's doubled budget does, so the retry path would crash
// instead of retrying.
const anthropic = new Anthropic({ apiKey, maxRetries: 5, timeout: 30 * 60 * 1000 });

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
  // Transport-level retries (429/5xx/network, retry-after) live in the SDK; this loop only
  // handles the empty-text case, which is a budget problem rather than a transport one.
  let tokenBudget = maxTokens;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: tokenBudget,
      ...(options.allowThinking ? {} : { thinking: { type: 'disabled' as const } }),
      ...(system ? { system } : {}),
      messages,
    });
    calls.push({
      agent,
      model: response.model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      },
    });
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    if (text.trim() === '') {
      // Adaptive thinking can consume the entire budget before any text is emitted.
      tokenBudget *= 2;
      console.error(
        `  ${agent}: empty text (blocks: ${response.content.map((block) => block.type).join(',')}), ` +
          `retrying with max_tokens=${tokenBudget}`,
      );
      continue;
    }
    return { text, truncated: response.stop_reason === 'max_tokens' };
  }
  throw new Error(`${agent}: exhausted retries`);
}

// The interviewer's final delivery can exceed one response budget; stitch continuations into
// a single message so the transcript holds the complete deliverable. The truncation flag of
// the *last* piece survives the stitching: a message still cut off after the piece cap must
// be reported as incomplete, not silently written as if it were whole.
async function callInterviewer(
  system: string | undefined,
  messages: ChatMessage[],
): Promise<CallResult> {
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
    // No separator at the seam: the cut usually lands mid-line or mid-token
    // and the model is instructed to continue exactly from where it stopped,
    // so an injected newline would corrupt the merged document.
    text += result.text;
  }
  return { text, truncated: result.truncated };
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

const openingMessage = await loadSection('opening-message.md');
const v0Prompt = condition === '2' ? await loadSection('v0-prompt.md') : undefined;
const situationPack = await Bun.file(baseDir + 'situation-pack.md').text();
await mkdir(transcriptDir, { recursive: true });

let interviewerMessages: ChatMessage[] = [{ role: 'user', content: openingMessage }];
let stopReason = 'hard-stop';

// The expert sees the same conversation from the other side: everything after
// the opening message, roles flipped. Derived on demand rather than kept as a
// parallel array every push had to maintain and resume had to rebuild.
function expertView(): ChatMessage[] {
  return interviewerMessages.slice(1).map((message) => ({
    role: message.role === 'assistant' ? ('user' as const) : ('assistant' as const),
    content: message.content,
  }));
}
let interviewerTurns = 0;
let startedAt = new Date().toISOString();

if (mode === 'fresh' && (await Bun.file(rawPath).exists())) {
  // The checkpoint is also the run's only record; an unguarded fresh run
  // overwrites hours of paid transcript on its first in-progress write.
  console.error(
    `${rawPath} already exists — a fresh run would overwrite it. ` +
      'Use --resume (or --continue-final), or move the transcripts for this condition aside first.',
  );
  process.exit(1);
}

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
    calls,
    interviewerMessages,
  };
  return Bun.write(rawPath, JSON.stringify(checkpoint, null, 2));
}

async function writeArtifacts(): Promise<void> {
  // input_tokens excludes cache reads and writes, so summing it alone
  // undercounts what the run actually paid for. Count all three.
  const totals = calls.reduce(
    (accumulator, call) => {
      accumulator.input += call.usage.input_tokens;
      accumulator.cacheWrite += call.usage.cache_creation_input_tokens ?? 0;
      accumulator.cacheRead += call.usage.cache_read_input_tokens ?? 0;
      accumulator.output += call.usage.output_tokens;
      return accumulator;
    },
    { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
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
    `- Tokens: ${totals.input} in (+${totals.cacheWrite} cache write, +${totals.cacheRead} cache read) / ${totals.output} out across ${calls.length} calls`,
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

  // The model artifact is the interviewer's final delivery message, verbatim.
  // Extracting "the model" out of it (the old largest-fenced-block heuristic)
  // depended on the delivery's formatting whims — one run fenced its whole
  // model, the other delivered structured markdown with small illustrative
  // fences, and the heuristic shipped a 517-byte fragment as that run's
  // artifact. The delivery document is self-describing; readers compare the
  // two conditions' documents directly.
  const finalMessage = interviewerMessages.at(-1);
  if (stopReason.startsWith('delivered') && finalMessage?.role === 'assistant') {
    await Bun.write(`${transcriptDir}/condition-${condition}-model.txt`, finalMessage.content);
  } else if (stopReason.startsWith('delivered')) {
    // The transcript header claims a delivery, so a missing artifact must be
    // loud — hours of paid run otherwise end with the main deliverable
    // silently absent.
    console.error(
      `⚠ stop reason is '${stopReason}' but the transcript does not end with an interviewer ` +
        `message — condition-${condition}-model.txt was NOT written`,
    );
  }

  console.error(
    `done: ${stopReason} after ${interviewerTurns} interviewer turns; ` +
      `${totals.input} in (+${totals.cacheWrite} cache write, +${totals.cacheRead} cache read) / ` +
      `${totals.output} out`,
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
  // Same rule as the stitching loop: no separator at a truncation seam.
  final.content += continued.text;
  if (continued.truncated) {
    console.error('⚠ still truncated after this continuation — run --continue-final again');
  } else if (stopReason.endsWith('-incomplete')) {
    stopReason = stopReason.slice(0, -'-incomplete'.length);
  }
  await writeArtifacts();
  process.exit(0);
}

if (mode === '--resume') {
  // A delivered checkpoint must never resume: doing so would pop and regenerate the paid
  // final delivery, then overwrite the transcript. Check the durable reason rather than the
  // trailing role because a capped non-final interviewer turn also ends with an assistant.
  if (stopReason.startsWith('delivered')) {
    console.error(
      `condition ${condition} already ended '${stopReason}' — resuming would regenerate and ` +
        'overwrite its final delivery. Use --continue-final to finish a truncated delivery, ' +
        'or move the transcripts aside to rerun from scratch.',
    );
    process.exit(1);
  }
  if (stopReason === 'expert-truncated') {
    const partialExpertReply = interviewerMessages.at(-1);
    if (partialExpertReply?.role !== 'user' || !partialExpertReply.truncated) {
      console.error(
        "checkpoint says 'expert-truncated' but does not end with a truncated expert reply",
      );
      process.exit(1);
    }
    // The partial text remains in the stopped checkpoint as evidence, but must never be fed
    // to the interviewer as a complete answer. Resume removes it and retries the expert call
    // against the same preceding interviewer question.
    interviewerMessages.pop();
    console.error(`regenerating truncated expert reply at interviewer turn ${interviewerTurns}`);
    const expertResult = await callClaude(
      'expert',
      EXPERT_MODEL,
      situationPack,
      expertView(),
      1_500,
    );
    let expertText = expertResult.text;
    if (interviewerTurns === IMPATIENCE_AT) {
      expertText = `${expertText}\n\n${IMPATIENCE_LINE}`;
    }
    interviewerMessages.push({
      role: 'user',
      content: expertText,
      ...(expertResult.truncated ? { truncated: true as const } : {}),
    });
    if (expertResult.truncated) {
      console.error(
        '⚠ the regenerated expert reply is still truncated — checkpointed the partial reply ' +
          'without sending it to the interviewer; rerun with --resume to try again',
      );
      await writeArtifacts();
      process.exit(0);
    }
    await writeCheckpoint('in-progress');
  }
  // Checkpoints are written after complete exchanges only, but tolerate a trailing
  // assistant message by regenerating that turn.
  stopReason = 'hard-stop';
  const last = interviewerMessages.at(-1);
  if (last?.role === 'assistant') interviewerMessages.pop();
  interviewerTurns = interviewerMessages.filter((message) => message.role === 'assistant').length;
  console.error(`resuming condition ${condition} at interviewer turn ${interviewerTurns + 1}`);
}

while (interviewerTurns < HARD_STOP_AT) {
  interviewerTurns++;
  console.error(`turn ${interviewerTurns} (interviewer)`);
  const interviewer = await callInterviewer(v0Prompt, interviewerMessages);
  interviewerMessages.push({
    role: 'assistant',
    content: interviewer.text,
    ...(interviewer.truncated ? { truncated: true as const } : {}),
  });

  if (await isFinalModel(interviewer.text)) {
    stopReason = interviewerTurns > FORCE_WRAP_AT ? 'delivered-after-forced-wrap' : 'delivered';
    if (interviewer.truncated) {
      stopReason += '-incomplete';
      console.error(
        '⚠ the final delivery is still truncated after stitching — ' +
          'rerun with --continue-final to finish it',
      );
    }
    break;
  }

  if (interviewer.truncated) {
    stopReason = 'interviewer-truncated';
    console.error(
      '⚠ the non-final interviewer reply is truncated after the continuation cap — ' +
        'checkpointed it without sending the partial question to the expert; rerun with ' +
        '--resume to regenerate the interviewer turn',
    );
    break;
  }

  let expertText: string;
  let expertTruncated = false;
  if (interviewerTurns >= FORCE_WRAP_AT) {
    expertText = FORCED_WRAP_MESSAGE;
  } else {
    console.error(`turn ${interviewerTurns} (expert)`);
    const expertResult = await callClaude(
      'expert',
      EXPERT_MODEL,
      situationPack,
      expertView(),
      1_500,
    );
    expertText = expertResult.text;
    expertTruncated = expertResult.truncated;
    if (interviewerTurns === IMPATIENCE_AT) {
      expertText = `${expertText}\n\n${IMPATIENCE_LINE}`;
    }
  }
  interviewerMessages.push({
    role: 'user',
    content: expertText,
    ...(expertTruncated ? { truncated: true as const } : {}),
  });
  if (expertTruncated) {
    stopReason = 'expert-truncated';
    console.error(
      '⚠ the expert reply is truncated — checkpointed the partial reply without sending it ' +
        'to the interviewer; rerun with --resume to regenerate it',
    );
    break;
  }
  await writeCheckpoint('in-progress');
}

await writeArtifacts();
