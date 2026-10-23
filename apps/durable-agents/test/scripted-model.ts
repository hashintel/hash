/**
 * A key-free model for tests: pi-ai's own faux provider, scripted response by
 * response. `@local/pi-faux-providers` targets pi-ai 1.2.0, whose `Provider`
 * does not fit pi-ai 1.4.0's `Models` (its `TranscriptContext` brand differs).
 */
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxProvider,
  type FauxResponseStep,
} from "@earendil-works/pi-ai/providers/faux";

import type { ModelRef } from "@earendil-works/pi-durable";

export {
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

/** `Models` whose only provider answers with `responses`, in order, one per request. */
export const scriptedModel = (responses: FauxResponseStep[]) => {
  const faux = fauxProvider();
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const model: ModelRef = {
    provider: faux.provider.id,
    modelId: faux.getModel().id,
  };
  return { models, model, state: faux.state };
};
