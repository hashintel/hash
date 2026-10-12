import { describe, expect, it } from "vitest";

import { pluginService } from "./define-petrinaut-plugin";
import { describePluginContributions } from "./plugin-contributions";

describe("describePluginContributions", () => {
  it("lists what the manifest declares, in a fixed order, with where each part appears", () => {
    expect(
      describePluginContributions({
        id: "test.everything",
        name: "Everything",
        access: { document: "write", experiments: "read" },
        buttons: { mute: { label: "Mute", place: "viewport-controls" } },
        topBarItems: { status: { place: "top-bar-end" } },
        commands: {
          mute: { label: "Mute the assistant", shortcut: "f2" },
          unmute: { label: "Unmute the assistant" },
        },
        settings: {
          captions: {
            type: "boolean",
            default: true,
            label: "Captions",
            section: "labs",
          },
        },
        provides: pluginService<string>(),
        root: true,
      }),
    ).toEqual([
      { kind: "access", subject: "document", detail: "Read and change" },
      { kind: "access", subject: "experiments", detail: "Read" },
      { kind: "button", subject: "Mute", detail: "Viewport controls" },
      { kind: "top-bar-item", subject: "status", detail: "End of the top bar" },
      { kind: "command", subject: "Mute the assistant", detail: "F2" },
      { kind: "command", subject: "Unmute the assistant" },
      { kind: "setting", subject: "Captions", detail: "Labs" },
      { kind: "provides", subject: "test.everything" },
      { kind: "root", subject: "Inside the editor" },
    ]);
  });

  it("lists nothing for a manifest that declares nothing", () => {
    expect(
      describePluginContributions({ id: "test.none", name: "None" }),
    ).toEqual([]);
  });
});
