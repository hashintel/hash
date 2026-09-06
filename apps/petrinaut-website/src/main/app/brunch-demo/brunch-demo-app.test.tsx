// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PetrinautNavigationController } from "@hashintel/petrinaut/react";

const controllers: PetrinautNavigationController[] = [];

vi.mock("../sentry-feedback-button", () => ({
  useSentryFeedbackAction: () => ({
    key: "sentry-feedback",
    icon: null,
    label: "Feedback",
    tooltip: "Feedback",
  }),
}));

vi.mock("./brunch-actual-mode-route", () => ({
  BrunchActualModeRoute: ({
    navigation,
  }: {
    navigation: PetrinautNavigationController;
  }) => {
    controllers.push(navigation);
    return null;
  },
}));

const { BrunchDemoApp } = await import("./brunch-demo-app");

describe("BrunchDemoApp", () => {
  it("opens the controlled location in Actual mode", () => {
    // A controlled host replaces the navigation provider's initial state,
    // including the Actual-mode default it applies when a stream is
    // available. Opening in Edit mode would point the execution frame at the
    // local simulation instead of the Brunch stream.
    render(
      <BrunchDemoApp
        onSearchChange={() => {}}
        search={{ sse: "https://brunch.example/events" }}
      />,
    );

    expect(controllers.at(-1)!.state.mode).toBe("actual");
  });

  it("still resolves a shared location from the URL", () => {
    render(
      <BrunchDemoApp
        onSearchChange={() => {}}
        search={{
          sse: "https://brunch.example/events",
          scenario: "scenario-1",
          subnet: "subnet-1",
        }}
      />,
    );

    const controller = controllers.at(-1)!;
    expect(controller.state.mode).toBe("actual");
    expect(controller.state.scenarioId).toBe("scenario-1");
    expect(controller.state.subnetId).toBe("subnet-1");
  });
});
