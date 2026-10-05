import { describe, expect, it } from "vitest";

import { describePluginContributions } from "./plugin-contributions";
import { definePluginToken } from "./plugin-token";

const Conversation = definePluginToken<string>("test.conversation");
const Ledger = definePluginToken<string>("test.ledger");

describe("describePluginContributions", () => {
  it("lists what the manifest declares, in a fixed order, with where each part appears", () => {
    expect(
      describePluginContributions(
        {
          id: "test.voice",
          name: "Voice",
          assistant: { extends: "test.brunch" },
          buttons: { mute: { label: "Mute", place: "viewport-controls" } },
          topBarItems: { status: { place: "top-bar-end" } },
          settings: {
            captions: {
              type: "boolean",
              default: true,
              label: "Captions",
              section: "viewport",
            },
          },
          flags: { realtime: { default: false, label: "Realtime" } },
          provides: { ledger: Ledger },
          requires: {
            conversation: Conversation,
            ledger: Ledger.optional(),
          },
        },
        {
          assistantLabelOf: (pluginId) =>
            pluginId === "test.brunch" ? "Brunch" : undefined,
          rendersRoot: true,
        },
      ),
    ).toEqual([
      { kind: "extension", subject: "Brunch assistant" },
      { kind: "button", subject: "Mute", detail: "Viewport controls" },
      { kind: "top-bar-item", subject: "status", detail: "End of the top bar" },
      { kind: "setting", subject: "Captions", detail: "Viewport" },
      { kind: "flag", subject: "Realtime", detail: "Labs" },
      { kind: "provides", subject: "test.ledger" },
      { kind: "requires", subject: "test.conversation" },
      { kind: "requires", subject: "test.ledger", detail: "Optional" },
      { kind: "root", subject: "Inside the editor" },
    ]);
  });

  it("names a provided assistant by its label and an unknown extended one by its id", () => {
    const options = { assistantLabelOf: () => undefined, rendersRoot: false };

    expect(
      describePluginContributions(
        { id: "test.ai", name: "AI", assistant: { label: "Petrinaut" } },
        options,
      ),
    ).toEqual([{ kind: "assistant", subject: "Petrinaut" }]);
    expect(
      describePluginContributions(
        {
          id: "test.extra",
          name: "Extra",
          assistant: { extends: "test.gone" },
        },
        options,
      ),
    ).toEqual([{ kind: "extension", subject: "test.gone assistant" }]);
  });
});
