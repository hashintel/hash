/** @vitest-environment jsdom */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { usePluginViews } from "../plugins/plugins-provider";
import { renderPlugins } from "../plugins/plugins-test-harness";
import { codeViewPlugin } from "./code-view-plugin";
import { standardComponentsPlugin } from "./standard-components-plugin";

afterEach(cleanup);

const ViewsReadout = () => {
  const views = usePluginViews();
  return (
    <ul>
      {views.map((view) => (
        <li key={view.id} data-testid="view">
          {view.id}:{view.label}
        </li>
      ))}
    </ul>
  );
};

describe("the built-in plugins", () => {
  it("offer a Code view located as hash.code-view:code", () => {
    renderPlugins([codeViewPlugin, standardComponentsPlugin], <ViewsReadout />);

    expect(
      screen.getAllByTestId("view").map((item) => item.textContent),
    ).toEqual(["hash.code-view:code:Code"]);
  });

  it("declare the standard library on the manifest, readable without running the plugin", () => {
    expect(standardComponentsPlugin.manifest.componentLibrary.name).toBe(
      "Standard components",
    );
    expect(standardComponentsPlugin.manifest.id).toBe(
      "hash.standard-components",
    );
  });
});
