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

afterEach(() => {
  cleanup();
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
