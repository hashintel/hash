// eslint-disable-next-line no-restricted-imports -- This compile-only consumer must exercise the package's declared self-reference.
import {
  createFlueHistoryReader,
  createLocalCaptureStore,
  // @ts-expect-error Generalized typed elicitation is deliberately not public.
  useElicitation,
} from "@hashintel/brunch-agent-binding-flue";

void [createFlueHistoryReader, createLocalCaptureStore, useElicitation];
