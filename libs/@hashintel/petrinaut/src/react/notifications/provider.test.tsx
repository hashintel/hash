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
