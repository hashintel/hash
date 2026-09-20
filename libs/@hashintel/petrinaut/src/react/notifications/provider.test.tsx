/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { NotificationsContext } from "./context";
import { NotificationsProvider } from "./provider";
import { notificationsToaster } from "./toaster";

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
  cleanup();
  notificationsToaster.remove();
  for (const restore of propertyRestorers.splice(0).reverse()) {
    restore();
  }
  vi.restoreAllMocks();
});

test("keeps error notifications open while preserving the default for other tones", async () => {
  const createToast = vi.spyOn(notificationsToaster, "create");
  const Trigger = () => {
    const { addNotification } = use(NotificationsContext);

    return (
      <>
        <button
          type="button"
          onClick={() =>
            addNotification({
              detail: "The complete elicitor failure.",
              message: "AI assistant error",
              tone: "error",
            })
          }
        >
          Error
        </button>
        <button
          type="button"
          onClick={() => addNotification({ message: "Saved", tone: "success" })}
        >
          Success
        </button>
      </>
    );
  };

  render(
    <NotificationsProvider>
      <Trigger />
    </NotificationsProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Error" }));
  fireEvent.click(screen.getByRole("button", { name: "Success" }));

  await waitFor(() => expect(createToast).toHaveBeenCalledTimes(2));
  expect(createToast).toHaveBeenNthCalledWith(1, {
    description: "The complete elicitor failure.",
    duration: Infinity,
    id: "notification-0",
    title: "AI assistant error",
    type: "error",
  });
  expect(createToast).toHaveBeenNthCalledWith(2, {
    description: undefined,
    duration: 3000,
    id: "notification-1",
    title: "Saved",
    type: "success",
  });
});

test("shows a way out only where a notification needs one", async () => {
  const Trigger = () => {
    const { addNotification } = use(NotificationsContext);

    return (
      <>
        <button
          type="button"
          onClick={() => addNotification({ message: "Simulation complete" })}
        >
          Complete
        </button>
        <button
          type="button"
          onClick={() =>
            addNotification({
              detail: "The complete elicitor failure.",
              message: "Assistant run failed",
              tone: "error",
            })
          }
        >
          Error
        </button>
      </>
    );
  };

  render(
    <NotificationsProvider>
      <Trigger />
    </NotificationsProvider>,
  );

  // The toaster is a module singleton whose toasts outlive a test, so each
  // notification is read from its own toast rather than from the document,
  // under a title no other test uses.
  const toastFor = async (title: string) =>
    (await screen.findByText(title)).closest("[data-part='root']");

  fireEvent.click(screen.getByRole("button", { name: "Complete" }));
  fireEvent.click(screen.getByRole("button", { name: "Error" }));

  const complete = await toastFor("Simulation complete");
  expect(complete?.hasAttribute("data-detail")).toBe(false);
  expect(
    complete?.querySelector("[aria-label='Close notification']"),
  ).toBeNull();
  expect(complete?.querySelector("[aria-label='Copy details']")).toBeNull();

  const failure = await toastFor("Assistant run failed");
  expect(failure?.hasAttribute("data-detail")).toBe(true);
  await waitFor(() =>
    expect(
      failure?.querySelector("[aria-label='Close notification']"),
    ).toBeTruthy(),
  );
  expect(failure?.querySelector("[aria-label='Copy details']")).toBeTruthy();
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

const renderCopyNotification = async (title: string) => {
  const detail = "The assistant failure details.";
  const Trigger = () => {
    const { addNotification } = use(NotificationsContext);
    return (
      <button
        type="button"
        onClick={() =>
          addNotification({ detail, message: title, tone: "error" })
        }
      >
        Show notification
      </button>
    );
  };

  render(
    <NotificationsProvider>
      <Trigger />
    </NotificationsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show notification" }));
  await screen.findByText(title);

  return {
    copyButton: screen.getByRole("button", { name: "Copy details" }),
    detail,
  };
};

test("falls back to a document copy when the Clipboard API rejects", async () => {
  const { execCommand, writeText } = stubCopyMethods({
    clipboardSucceeds: false,
    documentCopySucceeds: true,
  });
  const { copyButton, detail } = await renderCopyNotification("Copy fallback");

  fireEvent.click(copyButton);

  await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
  expect(writeText).toHaveBeenCalledWith(detail);
});

test("shows Copied after copying notification details", async () => {
  stubCopyMethods({
    clipboardSucceeds: true,
    documentCopySucceeds: false,
  });
  const { copyButton } = await renderCopyNotification("Copy succeeded");

  fireEvent.click(copyButton);

  expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
});

test("shows Copy failed when both copy methods fail", async () => {
  stubCopyMethods({
    clipboardSucceeds: false,
    documentCopySucceeds: false,
  });
  const { copyButton } = await renderCopyNotification("Copy failed");

  fireEvent.click(copyButton);

  expect(
    await screen.findByRole("button", { name: "Copy failed" }),
  ).toBeTruthy();
});
