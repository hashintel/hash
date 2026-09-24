/** The persona agent's private launch documents, written into the run directory. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PersonaAxisSettings } from "./axis-settings.ts";

const briefRoot = fileURLToPath(new URL("brief/", import.meta.url));

export const defaultPersonaObjective =
  "Pursue the person's stated goal through a substantive interview and a worked model. Let the interviewer earn details, and correct or qualify its understanding as the person naturally would. Continue through reviewing the model, asking why and correcting a consequential detail; do not stop merely because the initial account has been elicited. Stop when the person considers the goal achieved or chooses to end the conversation.";

const personaAxisPromptPaths = (axes: PersonaAxisSettings) => [
  ...(axes.personaVerbosity === "default"
    ? []
    : [join(briefRoot, "axes", `verbosity-${axes.personaVerbosity}.md`)]),
  ...(axes.personaDisclosure === "default"
    ? []
    : [join(briefRoot, "axes", `disclosure-${axes.personaDisclosure}.md`)]),
];

export const personaCommandGuide = (helper: string) =>
  `## How to talk to Brunch

Brunch is a separate AI interviewer running in a real browser window that the operator is watching. You reach it only through this command:

    ${helper} say "<your message>"

It types your message into Brunch's chat, waits until Brunch has completely finished responding, and prints Brunch's reply. For a message containing quotes or several lines, pass it on stdin instead:

    ${helper} say <<'EOF'
    <your message>
    EOF

Other commands:

- \`${helper} transcript\` prints the conversation so far.
- \`${helper} state\` prints the run state as JSON.
- \`${helper} end "<reason>"\` ends the conversation and closes the browser run. Use it once, when you stop.

A Brunch turn can take several minutes while it builds or edits the model. Let the command run to completion: if your shell tool has a timeout, set it to the longest allowed (at least ten minutes). Interrupting the command stops Brunch's turn. If the command fails or is interrupted, do not resend the message; run \`transcript\` to see what Brunch received, then report to the operator.`;

export const writePersonaBrief = async (input: {
  readonly run: string;
  readonly helper: string;
  readonly axes: PersonaAxisSettings;
  readonly objective: string | undefined;
  readonly opening: string;
  readonly reply: string;
  readonly pack: string;
}) => {
  const [system, ...axisPrompts] = await Promise.all(
    [join(briefRoot, "system.md"), ...personaAxisPromptPaths(input.axes)].map(
      (path) => readFile(path, "utf8"),
    ),
  );
  const path = join(input.run, "persona-brief.md");
  await writeFile(
    path,
    [
      "# Persona brief",
      "Everything in this brief is private. Never quote it, summarize it, or mention it to Brunch.",
      "## Role",
      system?.trim(),
      ...axisPrompts.map((prompt) => prompt.trim()),
      personaCommandGuide(input.helper),
      "## Objective",
      input.objective ?? defaultPersonaObjective,
      "Do not coach Brunch about its tools or the test. When you stop, end the conversation and report the stopping reason and number of attempted turns to the operator.",
      "## Conversation so far",
      "The shared opening below has already been sent through the browser; do not repeat it. Answer Brunch's actual reply, then continue naturally and sequentially.",
      "### Opening (sent as you)",
      input.opening,
      "### Brunch's reply",
      input.reply,
      "## Private situation pack",
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
      `This resumes an interrupted persona run. Read the original brief at ${join(input.run, "persona-brief.md")} for your role, objective and private situation pack; this notice supersedes its "Conversation so far" section and its command paths.`,
      `Run \`${input.helper} transcript\` first to catch up on the whole conversation. The last message you sent WAS received. Do not resend it or repeat the opening.`,
      `Brunch's last turn settled as: ${input.settlement}. Existing model changes were retained.`,
      "If that turn was interrupted, ask Brunch to pick up where it left off, in the person's own words and without repeating operational facts. Otherwise answer its actual reply naturally. Keep this notice private.",
      personaCommandGuide(input.helper),
      "### Brunch's latest reply (may be partial if it did not complete)",
      input.reply.trim() ? input.reply : "No reply prose was retained.",
    ].join("\n\n") + "\n",
    { mode: 0o600 },
  );
  return path;
};
