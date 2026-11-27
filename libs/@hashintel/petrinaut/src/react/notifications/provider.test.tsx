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
import { use } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { NotificationsContext } from "./context";
import { NotificationsProvider } from "./provider";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
});

test("shows a way out only where a notification needs one", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
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

  const toastFor = async (title: string) =>
    (await screen.findByText(title)).closest("[data-part='root']");

  fireEvent.click(screen.getByRole("button", { name: "Complete" }));
  fireEvent.click(screen.getByRole("button", { name: "Error" }));

  const complete = await toastFor("Simulation complete");
  expect(
    complete?.querySelector("[aria-label='Dismiss notification']"),
  ).toBeNull();
  expect(complete?.querySelector("[aria-label='Copy details']")).toBeNull();

  const failure = await toastFor("Assistant run failed");
  await waitFor(() =>
    expect(
      failure?.querySelector("[aria-label='Dismiss notification']"),
    ).toBeTruthy(),
  );
  const copyDetails = failure?.querySelector("[aria-label='Copy details']");
  expect(copyDetails).toBeInstanceOf(HTMLElement);

  fireEvent.click(copyDetails as HTMLElement);

  expect(writeText).toHaveBeenCalledWith("The complete elicitor failure.");
  await waitFor(() =>
    expect(failure?.querySelector("[aria-label='Copied']")).toBeTruthy(),
  );
});

test("deduplicates a notice and offers its action without stealing focus", async () => {
  const onClick = vi.fn();
  const Trigger = () => {
    const { addNotification } = use(NotificationsContext);
    return (
      <button
        type="button"
        onClick={() => {
          for (let i = 0; i < 3; i++)
            addNotification({
              id: "read-only:test",
              message: "This document is read-only.",
              tone: "neutral",
              durationMs: 4500,
              action: { label: "Make a local copy", onClick },
            });
        }}
      >
        Try editing
      </button>
    );
  };
  render(
    <NotificationsProvider>
      <Trigger />
    </NotificationsProvider>,
  );
  const trigger = screen.getByRole("button", { name: "Try editing" });
  trigger.focus();
  fireEvent.click(trigger);
  const action = await screen.findByRole("button", {
    name: "Make a local copy",
  });
  expect(screen.getAllByText("This document is read-only.")).toHaveLength(1);
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(action);
  expect(onClick).toHaveBeenCalledOnce();
  // The toast leaves after the toaster's remove delay, whose timer fires late
  // while other suites load the machine.
  await waitFor(
    () => expect(screen.queryByText("This document is read-only.")).toBeNull(),
    { timeout: 3000 },
  );
});

test("leaves no notification behind for the next editor", async () => {
  const Notify = () => {
    const { addNotification } = use(NotificationsContext);
    return (
      <button
        type="button"
        onClick={() =>
          addNotification({ message: "From the first editor", tone: "neutral" })
        }
      >
        Notify
      </button>
    );
  };
  const first = render(
    <NotificationsProvider>
      <Notify />
    </NotificationsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Notify" }));
  await screen.findByText("From the first editor");
  first.unmount();

  render(
    <NotificationsProvider>
      <span>Second editor</span>
    </NotificationsProvider>,
  );

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(screen.queryByText("From the first editor")).toBeNull();
});
