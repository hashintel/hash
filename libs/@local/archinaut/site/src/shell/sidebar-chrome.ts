/**
 * The sidebar's chrome, driven on the document: collapse toggle, resize
 * handle by pointer and keyboard, the marks on labels that do not fit, the
 * fade bands' scroll progress where CSS cannot drive them, and the flag that
 * lets group animations start once the first layout has painted. These act
 * on layout and on `localStorage`, which React does not own, so they install
 * once and tear down together.
 */

import { writeStored } from "../shared/storage";

const clampWidth = (edge: number): number =>
  Math.round(Math.min(Math.max(edge, 224), 480));

/** Installs everything and returns the teardown. */
export const installSidebarChrome = (): (() => void) => {
  const root = document.documentElement;
  const toggle = document.querySelector<HTMLButtonElement>(
    ".pnd-sidebar-toggle",
  );
  const handle = document.querySelector<HTMLElement>(".pnd-sidebar-resize");
  const pane = document.querySelector<HTMLElement>(".sidebar-pane");
  const content = document.querySelector<HTMLElement>(".sidebar-content");
  const teardown: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void => {
    target.addEventListener(type, listener, options);
    teardown.push(() => target.removeEventListener(type, listener, options));
  };

  if (toggle !== null) {
    toggle.setAttribute(
      "aria-expanded",
      String(root.dataset.pndSidebar !== "collapsed"),
    );
    listen(toggle, "click", () => {
      const collapse = root.dataset.pndSidebar !== "collapsed";
      if (collapse) {
        root.dataset.pndSidebar = "collapsed";
      } else {
        delete root.dataset.pndSidebar;
      }
      toggle.setAttribute("aria-expanded", String(!collapse));
      writeStored("pnd:sidebar", collapse ? "collapsed" : "expanded");
    });
  }

  if (handle !== null) {
    const applyWidth = (width: number): void => {
      root.style.setProperty("--pnd-sidebar-open-width", `${width}px`);
    };
    const currentEdge = (): number => handle.getBoundingClientRect().left + 3;
    const setResizing = (active: boolean): void => {
      if (active) {
        root.dataset.pndResizing = "";
      } else {
        delete root.dataset.pndResizing;
      }
    };
    listen(handle, "pointerdown", (event) => {
      handle.setPointerCapture(event.pointerId);
      setResizing(true);
      let width = clampWidth(currentEdge());
      let frame = 0;
      const onMove = (move: PointerEvent): void => {
        width = clampWidth(move.clientX);
        // One write per frame: a pointer reports several moves per frame and
        // every write invalidates layout for the pane and the content column.
        frame ||= requestAnimationFrame(() => {
          frame = 0;
          applyWidth(width);
        });
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener(
        "lostpointercapture",
        () => {
          handle.removeEventListener("pointermove", onMove);
          cancelAnimationFrame(frame);
          applyWidth(width);
          setResizing(false);
          writeStored("pnd:sidebar-width", `${width}px`);
        },
        { once: true },
      );
    });
    let keyedWidth: number | null = null;
    listen(handle, "keydown", (event) => {
      const step =
        event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0;
      if (step === 0) {
        return;
      }
      event.preventDefault();
      setResizing(true);
      keyedWidth = clampWidth(currentEdge() + step);
      applyWidth(keyedWidth);
    });
    const endKeyGesture = (): void => {
      setResizing(false);
      if (keyedWidth !== null) {
        writeStored("pnd:sidebar-width", `${keyedWidth}px`);
        keyedWidth = null;
      }
    };
    listen(handle, "keyup", endKeyGesture);
    listen(handle, "blur", endKeyGesture);
  }

  if (content !== null) {
    // A gradient cannot ask whether the text fits, so the labels that do not
    // are marked here and the fade keys off the mark.
    const markClipped = (): void => {
      for (const label of content.querySelectorAll(
        "a > span, .group-label > span",
      )) {
        label.toggleAttribute(
          "data-pnd-clipped",
          label.scrollWidth > label.clientWidth + 1,
        );
      }
    };
    markClipped();
    const observer = new ResizeObserver(markClipped);
    observer.observe(content);
    teardown.push(() => observer.disconnect());
    listen(content, "toggle", markClipped, { capture: true });
  }

  const fadeRamp =
    parseFloat(getComputedStyle(root).getPropertyValue("--pnd-fade-ramp")) ||
    20;
  const cssDrivesFades =
    CSS.supports("animation-timeline: scroll()") &&
    CSS.supports("timeline-scope: --pnd-nav-scroll");
  if (!cssDrivesFades) {
    // Firefox cannot resolve the bands from layout, so their progress is
    // written from scroll listeners instead.
    const track = (
      source: EventTarget,
      readings: Record<string, () => number>,
    ): (() => void) => {
      let frame = 0;
      const write = (): void => {
        frame = 0;
        for (const [property, distance] of Object.entries(readings)) {
          root.style.setProperty(
            property,
            String(Math.min(distance() / fadeRamp, 1)),
          );
        }
      };
      const schedule = (): void => {
        frame ||= requestAnimationFrame(write);
      };
      write();
      source.addEventListener("scroll", schedule, { passive: true });
      teardown.push(() => source.removeEventListener("scroll", schedule));
      return schedule;
    };
    if (pane !== null) {
      const refresh = track(pane, {
        "--pnd-nav-progress": () => pane.scrollTop,
        "--pnd-nav-end-progress": () =>
          pane.scrollHeight - pane.scrollTop - pane.clientHeight,
      });
      if (content !== null) {
        const observer = new ResizeObserver(refresh);
        observer.observe(content);
        teardown.push(() => observer.disconnect());
      }
    }
    track(window, { "--pnd-content-progress": () => window.scrollY });
  }

  // Two frames, so the first layout has painted before `chrome.css` starts
  // transitioning group contents.
  const frame = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.dataset.pndReady = "";
    });
  });
  teardown.push(() => cancelAnimationFrame(frame));

  return () => {
    for (const undo of teardown) {
      undo();
    }
  };
};
