import type {
  BrunchAskInput,
  BrunchAskOutput,
} from "@hashintel/brunch-agent-transport-aisdk/client-tools";

export const brunchAskFromComposerText = ({
  text,
}: {
  input: BrunchAskInput;
  text: string;
}): BrunchAskOutput => ({ answer: text });
