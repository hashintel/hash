import { Icon } from "@hashintel/ds-components";

import { createBrunchPlugin } from "./definition";
import { BrunchWorkpiecePane } from "./ledger/brunch-workpiece-pane";
import { BrunchChat } from "./plugin/brunch-chat";
import { useBrunchSession } from "./plugin/use-brunch-session";

import type { PluginHook } from "@hashintel/petrinaut/ui";

const useBrunchPlugin: PluginHook<typeof createBrunchPlugin> = (api) => {
  const { chat, ledger, conversation } = useBrunchSession(api);

  return {
    assistant: {
      // `chat` and `ledger` are `null` while another assistant is shown.
      view: chat === null ? null : <BrunchChat api={api} {...chat} />,
      tabs:
        ledger === null
          ? []
          : [
              {
                id: "ledger",
                label: "Ledger",
                mark: <Icon name="bars" size="xs" />,
                activityIdentities: ledger.activityIdentities,
                content: (
                  <BrunchWorkpiecePane
                    messages={ledger.messages}
                    binding={ledger.binding}
                  />
                ),
              },
            ],
    },
    provides: { conversation },
  };
};

/** HASH's process agent as an assistant, with the Ledger of what it did. */
export const brunchPlugin = createBrunchPlugin(useBrunchPlugin);
