/**
 * @vitest-environment jsdom
 *
 * Stacking is the one thing about a Section that jsdom can still hold to
 * account: it computes no layout, but the classes Panda emits carry the
 * tiers, and the tiers are what the nesting bug was about.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Section, SectionList } from "./section";

afterEach(cleanup);

describe("Section", () => {
  it("keeps a focused section below every sticky header", () => {
    render(
      <SectionList>
        <Section title="Host" collapsible defaultOpen>
          <Section title="Nested" collapsible defaultOpen>
            <button type="button">Cell</button>
          </Section>
        </Section>
      </SectionList>,
    );

    const nestedTrigger = screen.getByRole("button", {
      name: "Toggle Nested section",
    });
    const nestedHeader = nestedTrigger.closest<HTMLElement>(
      '[class*="pos_sticky"]',
    )!;
    const nestedRoot = nestedHeader.parentElement!;

    // Sections nest — a drawer section hosts the ad-hoc form, which brings
    // its own — so a focused section that outranked a header painted its
    // title and rows straight through the header pinned above it.
    const focusWithinTier = /\[&:focus-within\]:z_\[(\d+)\]/.exec(
      nestedRoot.className,
    );
    const headerTier = /(?:^|\s)z_\[(\d+)\]/.exec(nestedHeader.className);
    expect(focusWithinTier?.[1]).toBeDefined();
    expect(headerTier?.[1]).toBeDefined();
    expect(Number(focusWithinTier![1])).toBeLessThan(Number(headerTier![1]));

    // ...while still winning against a section that is not focused.
    const restingTier = /(?:^|\s)z_\[(\d+)\]/.exec(nestedRoot.className);
    expect(Number(restingTier![1])).toBeLessThan(Number(focusWithinTier![1]));
  });
});
