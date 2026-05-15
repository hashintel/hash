import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";
import { useLocalStorage } from "@mantine/hooks";

const rootLocalStorageKey = "petrinaut-ai-messages";

type AiMessagesByNetId = Record<string, PetrinautAiMessage[]>;

export const useLocalStorageAiMessages = () => {
  const [aiMessagesByNetId, setAiMessagesByNetId] =
    useLocalStorage<AiMessagesByNetId>({
      key: rootLocalStorageKey,
      defaultValue: {},
      getInitialValueInEffect: false,
    });

  return { aiMessagesByNetId, setAiMessagesByNetId };
};
