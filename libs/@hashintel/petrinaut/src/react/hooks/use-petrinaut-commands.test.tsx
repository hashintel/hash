/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  CLIPBOARD_FORMAT_VERSION,
  type ClipboardPayload,
} from "@hashintel/petrinaut-core";

import {
  NotificationsContext,
  type AddNotificationInput,
} from "../notifications/context";
import { createWrapper, emptySdcpn } from "./editor-test-harness";
import { usePetrinautCommands } from "./use-petrinaut-commands";

import type { ReactNode } from "react";

const samplePastePayload: ClipboardPayload = {
  format: "petrinaut-sdcpn",
  version: CLIPBOARD_FORMAT_VERSION,
  documentId: null,
  data: {
    places: [
      {
        id: "p1",
        name: "Pasted",
        colorId: null,
        dynamicsEnabled: false,
        x: 10,
        y: 10,
      },
    ],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  },
};

describe("usePetrinautCommands", () => {
  test("gives the same commands while nothing they read changes", () => {
    const { Wrapper } = createWrapper();
    const { result, rerender } = renderHook(usePetrinautCommands, {
      wrapper: Wrapper,
    });
    const commands = result.current;

    rerender();

    expect(result.current).toBe(commands);
  });

  describe("when not readonly", () => {
    test("applyClipboardPaste pastes new items and reports IDs", () => {
      const { Wrapper, instance } = createWrapper();
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      let output: ReturnType<typeof result.current.applyClipboardPaste>;
      act(() => {
        output = result.current.applyClipboardPaste({
          payload: samplePastePayload,
        });
      });

      expect(output!.newItemIds.some((item) => item.type === "place")).toBe(
        true,
      );
      expect(instance.definition.get().places).toHaveLength(1);
    });

    test("applyAutoLayout returns commitCount=0 on an empty net", async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      const { commitCount } = await result.current.applyAutoLayout();
      expect(commitCount).toBe(0);
    });
  });

  describe("in an editor that only composes", () => {
    test("applyClipboardPaste says why it pastes nothing", () => {
      const addNotification = vi.fn((_notice: AddNotificationInput) => "");
      const { Wrapper, instance } = createWrapper({
        rules: { edit: "compose" },
      });
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <NotificationsContext value={{ addNotification }}>
            <Wrapper>{children}</Wrapper>
          </NotificationsContext>
        ),
      });

      let output: ReturnType<typeof result.current.applyClipboardPaste>;
      act(() => {
        output = result.current.applyClipboardPaste({
          payload: samplePastePayload,
        });
      });

      expect(output!).toEqual({ newItemIds: [] });
      expect(instance.definition.get().places).toHaveLength(0);
      expect(addNotification.mock.calls[0]?.[0].message).toContain(
        "nothing can be pasted into it",
      );
    });
  });

  describe("readonly enforcement", () => {
    test("applyClipboardPaste is a no-op when host readonly is true", () => {
      const { Wrapper, instance } = createWrapper({ readonly: true });
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      let output: ReturnType<typeof result.current.applyClipboardPaste>;
      act(() => {
        output = result.current.applyClipboardPaste({
          payload: samplePastePayload,
        });
      });

      expect(output!.newItemIds).toEqual([]);
      expect(instance.definition.get().places).toHaveLength(0);
    });

    test("applyClipboardPaste is a no-op when globalMode is simulate", () => {
      const { Wrapper, instance } = createWrapper({ globalMode: "simulate" });
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      let output: ReturnType<typeof result.current.applyClipboardPaste>;
      act(() => {
        output = result.current.applyClipboardPaste({
          payload: samplePastePayload,
        });
      });

      expect(output!.newItemIds).toEqual([]);
      expect(instance.definition.get().places).toHaveLength(0);
    });

    test("applyAutoLayout returns commitCount=0 when readonly", async () => {
      const { Wrapper } = createWrapper({
        readonly: true,
        sdcpn: {
          ...emptySdcpn,
          places: [
            {
              id: "p1",
              name: "P",
              colorId: null,
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
          ],
        },
      });
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      const { commitCount } = await result.current.applyAutoLayout();
      expect(commitCount).toBe(0);
    });
  });
});
