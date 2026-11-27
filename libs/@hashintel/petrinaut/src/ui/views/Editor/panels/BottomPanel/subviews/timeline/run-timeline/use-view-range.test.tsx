/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it } from "vitest";

import { EventPlaybackContext } from "../../../../../../../../react/event-playback/context";
import { KeptState } from "../../../../../../../shared/kept-state";
import { useTimelineViewRange } from "./use-view-range";

afterEach(cleanup);

const Timeline = () => {
  const { range, zoomed, setRange } = useTimelineViewRange();
  return (
    <button type="button" onClick={() => setRange({ min: 2, max: 4 })}>
      {zoomed ? "Zoomed" : "Fitted"} from {range.min} to {range.max}
    </button>
  );
};

/** A run with ten seconds computed, under a panel that shows its Timeline or is closed. */
const Panel = ({ isOpen }: { isOpen: boolean }) => (
  <EventPlaybackContext
    value={{ ...use(EventPlaybackContext), coveredTime: 10 }}
  >
    <KeptState>{isOpen && <Timeline />}</KeptState>
  </EventPlaybackContext>
);

it("keeps the zoom while the Timeline is unmounted", () => {
  const view = render(<Panel isOpen />);
  expect(screen.getByRole("button").textContent).toBe("Fitted from 0 to 10");
  fireEvent.click(screen.getByRole("button"));

  view.rerender(<Panel isOpen={false} />);
  view.rerender(<Panel isOpen />);

  expect(screen.getByRole("button").textContent).toBe("Zoomed from 2 to 4");
});
