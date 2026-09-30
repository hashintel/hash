import { z } from "zod";

const quote = z.string().max(800).nullable();
export const voiceBriefExtractionSchema = z.object({
  kind: z.enum(["modelling", "decision"]),
  goal: quote,
  arrivals: quote,
  handling: quote,
  queue: quote,
  decide: quote,
  measure: quote,
  constraints: quote,
  runs: quote,
  ask: quote,
});

export type VoiceBriefFields = Record<string, string>;
export type VoiceLine = { text: string; state: "streaming" | "done" };
export const voiceWrapUpResponseSchema = z.object({ text: z.string() });

/** Only extractive, verbatim evidence can become a modelling value. */
export const prepareVoiceBrief = (
  transcript: string,
  extraction: unknown,
): VoiceBriefFields => {
  const parsed = voiceBriefExtractionSchema
    .partial()
    .required({ kind: true })
    .parse(extraction);
  const names =
    parsed.kind === "modelling"
      ? (["goal", "arrivals", "handling", "queue"] as const)
      : (["decide", "measure", "constraints", "runs", "ask"] as const);
  const fields: VoiceBriefFields = {};
  const open: string[] = [];
  for (const name of names) {
    const evidence = parsed[name]?.trim();
    if (evidence && transcript.includes(evidence)) fields[name] = evidence;
    else {
      fields[name] = "Still open";
      open.push(name);
    }
  }
  if (parsed.kind === "modelling")
    fields.stillOpen = open.join(", ") || "None identified in this turn";
  return fields;
};

export const serializeVoiceBrief = (
  utterance: string,
  fields: VoiceBriefFields,
): string => {
  const excerpts = Object.fromEntries(
    Object.entries(fields).filter(
      ([name, value]) => name !== "stillOpen" && value !== "Still open",
    ),
  );
  return `Spoken user turn. The utterance is the complete finalized transcript; excerpts are optional verbatim selections, not a replacement for the request. Interpret short replies, choices, corrections and permission to use defaults in the prior conversation. Missing excerpts mean only not extracted in this turn; do not reset previously established facts or treat omissions as new questions. Follow the user's request within your policy; keep authorized hypothetical assumptions distinct from operational facts.\n${JSON.stringify({ utterance, excerpts })}`;
};

export const validateVoiceWrapUp = (value: unknown): string => {
  const text = z.string().trim().min(1).max(600).parse(value);
  const sentences = [
    ...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text),
  ];
  if (sentences.length > 2) throw new Error("Wrap-up exceeds two sentences");
  return text;
};
