/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { CopyDetailsButton } from "./copy-details-button";

const propertyRestorers: Array<() => void> = [];

const stubProperty = (
  target: object,
  property: PropertyKey,
  value: unknown,
) => {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  propertyRestorers.push(() => {
    if (original) {
      Object.defineProperty(target, property, original);
    } else {
      Reflect.deleteProperty(target, property);
    }
  });
};

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  for (const restore of propertyRestorers.splice(0).reverse()) {
    restore();
  }
  vi.restoreAllMocks();
});

const stubCopyMethods = ({
  clipboardSucceeds,
  documentCopySucceeds,
}: {
  clipboardSucceeds: boolean;
  documentCopySucceeds: boolean;
}) => {
  const writeText = clipboardSucceeds
    ? vi.fn().mockResolvedValue(undefined)
    : vi
        .fn()
        .mockRejectedValue(new DOMException("Clipboard permission denied"));
  const execCommand = vi.fn().mockReturnValue(documentCopySucceeds);

  stubProperty(navigator, "clipboard", { writeText });
  stubProperty(document, "execCommand", execCommand);
  return { execCommand, writeText };
};

const detail = "The assistant failure details.";

const renderCopyButton = () => {
  render(<CopyDetailsButton className="" detail={detail} />);
  return screen.getByRole("button", { name: "Copy details" });
};

test("falls back to a document copy when the Clipboard API rejects", async () => {
  const { execCommand, writeText } = stubCopyMethods({
    clipboardSucceeds: false,
    documentCopySucceeds: true,
  });
  const copyButton = renderCopyButton();
  copyButton.focus();

  fireEvent.click(copyButton);

  await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
  expect(writeText).toHaveBeenCalledWith(detail);
  expect(document.activeElement).toBe(copyButton);
});

test("shows Copied after copying notification details", async () => {
  stubCopyMethods({
    clipboardSucceeds: true,
    documentCopySucceeds: false,
  });
  const copyButton = renderCopyButton();

  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(copyButton);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByRole("button", { name: "Copy details" })).toBeTruthy();
});

test("restarts Copied feedback after another copy", async () => {
  stubCopyMethods({
    clipboardSucceeds: true,
    documentCopySucceeds: false,
  });
  const copyButton = renderCopyButton();

  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(copyButton);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copied" }));
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(500);
  });

  expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(screen.getByRole("button", { name: "Copy details" })).toBeTruthy();
});

test("shows Copy failed when both copy methods fail", async () => {
  stubCopyMethods({
    clipboardSucceeds: false,
    documentCopySucceeds: false,
  });
  const copyButton = renderCopyButton();

  fireEvent.click(copyButton);

  expect(
    await screen.findByRole("button", { name: "Copy failed" }),
  ).toBeTruthy();
});

test("shows Copy failed when preparing the document fallback throws", async () => {
  stubCopyMethods({
    clipboardSucceeds: false,
    documentCopySucceeds: true,
  });
  vi.spyOn(HTMLTextAreaElement.prototype, "select").mockImplementation(() => {
    throw new Error("Selection failed");
  });
  const copyButton = renderCopyButton();

  fireEvent.click(copyButton);

  expect(
    await screen.findByRole("button", { name: "Copy failed" }),
  ).toBeTruthy();
});
