/** The persona agent's private launch documents, written into the run directory. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const systemPath = fileURLToPath(new URL("brief/system.md", import.meta.url));

export const personaCommandGuide = (helper: string) =>
  `## How to talk to Brunch

Brunch is an AI assistant you talk to only through this command:

    ${helper} say "<your message>"

It types your message into Brunch's chat, waits until Brunch has completely finished responding, and prints Brunch's reply. For a message containing quotes or several lines, pass it on stdin instead:

    ${helper} say <<'EOF'
    <your message>
    EOF

Other commands:

- \`${helper} transcript\` prints the conversation so far.
- \`${helper} state\` prints the run state as JSON.
- \`${helper} end "<reason>"\` ends the conversation and closes the run. Use it once, when you stop.

A Brunch turn can take several minutes while it works. Let the command run to completion: if your shell tool takes a timeout, leave it unset, or give the longest it allows if it requires one; a ten-minute timeout has cut off a Brunch turn before. Interrupting the command stops Brunch's turn. If the command fails or is interrupted, do not resend the message; run \`transcript\` to see what Brunch received, then report to the operator.`;

export const writePersonaBrief = async (input: {
  readonly run: string;
  readonly helper: string;
  readonly objective: string | undefined;
  readonly opening: string;
  readonly reply: string;
  readonly pack: string;
}) => {
  const system = await readFile(systemPath, "utf8");
  const path = join(input.run, "persona-brief.md");
  await writeFile(
    path,
    [
      "# Persona brief",
      "Everything in this brief is private. Never quote it, summarize it, or mention it to Brunch.",
      system.trim(),
      personaCommandGuide(input.helper),
      ...(input.objective === undefined
        ? []
        : ["## What you're after today", input.objective]),
      "## Conversation so far",
      "Your first message below has already been sent; do not repeat it. Reply to what Brunch said, then carry on one message at a time.",
      "### Opening (sent as you)",
      input.opening,
      "### Brunch's reply",
      input.reply,
      "## Situation pack",
      input.pack,
    ].join("\n\n") + "\n",
    { mode: 0o600 },
  );
  return path;
};

export const writePersonaResumeBrief = async (input: {
  readonly run: string;
  readonly helper: string;
  readonly settlement: string;
  readonly reply: string;
}) => {
  const path = join(input.run, "resume-brief.md");
  await writeFile(
    path,
    [
      "# Persona resume notice",
      `This resumes an interrupted conversation. Read the original brief at ${join(input.run, "persona-brief.md")} for who you are and your situation pack; this notice supersedes its "Conversation so far" section and its command paths.`,
      `Run \`${input.helper} transcript\` first to catch up on the whole conversation. The last message you sent WAS received. Do not resend it or repeat the opening.`,
      `Brunch's last turn settled as: ${input.settlement}. Its work so far was kept.`,
      "If that turn was interrupted, ask Brunch in your own words to pick up where it left off. Otherwise reply to what it last said. Keep this notice private.",
      personaCommandGuide(input.helper),
      "### Brunch's latest reply (may be partial if it did not complete)",
      input.reply.trim() ? input.reply : "No reply prose was retained.",
    ].join("\n\n") + "\n",
    { mode: 0o600 },
  );
  return path;
};
