import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
/** @vitest-environment jsdom */
import { createRef, use } from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Icon, IconProvider, iconNames } from "@hashintel/ds-components";

import { UserSettingsContext } from "../react/state/user-settings-context";
import { UserSettingsProvider } from "../react/state/user-settings-provider";
import { AiAssistantIcon } from "./components/ai-assistant-icon";
import {
  ExperimentalIcon,
  ExperimentalIconProvider,
  PlaceIcon,
  AddPlaceIcon,
  AddTransitionIcon,
  getExperimentalIconEffects,
  PlayIcon,
} from "./experimental-icons";
import { petriconStudies } from "./petricon";

const SettingsExample = () => {
  const { enableExperimentalIconPack, setEnableExperimentalIconPack } =
    use(UserSettingsContext);
  return (
    <ExperimentalIconProvider enabled={enableExperimentalIconPack}>
      <button
        type="button"
        onClick={() =>
          setEnableExperimentalIconPack(!enableExperimentalIconPack)
        }
      >
        Toggle icon pack
      </button>
      <Icon name="play" alt="Play" />
      <IconProvider icons={{ play: PlayIcon }}>
        <Icon name="barcode" alt="Barcode" />
      </IconProvider>
      <AiAssistantIcon title="Assistant" />
      {createPortal(<Icon name="pause" alt="Pause in portal" />, document.body)}
    </ExperimentalIconProvider>
  );
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("experimental icon preference", () => {
  it("switches immediately, persists across mounts, and restores the defaults", () => {
    localStorage.setItem(
      "petrinaut:user-settings",
      JSON.stringify({ showMinimap: false, enableExperimentalIconPack: false }),
    );
    const { unmount } = render(
      <UserSettingsProvider>
        <SettingsExample />
      </UserSettingsProvider>,
    );
    const originalPlay = screen.getByRole("img", { name: "Play" }).outerHTML;
    const originalBarcode = screen.getByRole("img", {
      name: "Barcode",
    }).outerHTML;
    const originalAssistant = screen.getByRole("img", {
      name: "Assistant",
    }).outerHTML;
    expect(originalPlay).not.toContain("petrinaut-experimental");

    fireEvent.click(screen.getByRole("button", { name: "Toggle icon pack" }));
    expect(
      screen.getByRole("img", { name: "Play" }).getAttribute("data-icon-pack"),
    ).toBe("petrinaut-experimental");
    expect(
      screen.getByRole("img", { name: "Assistant" }).getAttribute("data-icon"),
    ).toBe("agent");
    expect(
      screen
        .getByRole("img", { name: "Pause in portal" })
        .getAttribute("data-icon-pack"),
    ).toBe("petrinaut-experimental");
    expect(screen.getByRole("img", { name: "Barcode" }).outerHTML).toBe(
      originalBarcode,
    );
    expect(
      JSON.parse(localStorage.getItem("petrinaut:user-settings") ?? "{}"),
    ).toMatchObject({
      enableExperimentalIconPack: true,
      showMinimap: false,
    });

    unmount();
    render(
      <UserSettingsProvider>
        <SettingsExample />
      </UserSettingsProvider>,
    );
    expect(
      screen.getByRole("img", { name: "Play" }).getAttribute("data-icon-pack"),
    ).toBe("petrinaut-experimental");
    fireEvent.click(screen.getByRole("button", { name: "Toggle icon pack" }));
    expect(screen.getByRole("img", { name: "Play" }).outerHTML).toBe(
      originalPlay,
    );
    expect(screen.getByRole("img", { name: "Assistant" }).outerHTML).toBe(
      originalAssistant,
    );
  });
});

describe("experimental SVG API", () => {
  it("keeps each flask's liquid clipped to its own stable outline", () => {
    const Flasks = ({ selected }: { selected: boolean }) => (
      <>
        <ExperimentalIcon name="flask" selected={selected} />
        <ExperimentalIcon name="flask" />
      </>
    );
    const { container, rerender } = render(<Flasks selected={false} />);
    const clipIds = Array.from(
      container.querySelectorAll("clipPath"),
      (clip) => clip.id,
    );
    expect(clipIds).toHaveLength(2);
    expect(new Set(clipIds).size).toBe(2);
    for (const flask of container.querySelectorAll('svg[data-icon="flask"]')) {
      expect(
        flask.querySelector("g[clip-path]")?.getAttribute("clip-path"),
      ).toBe(`url(#${flask.querySelector("clipPath")?.id})`);
    }
    rerender(<Flasks selected />);
    expect(
      Array.from(container.querySelectorAll("clipPath"), (clip) => clip.id),
    ).toEqual(clipIds);
  });

  it("replaces every icon available to shared app controls", () => {
    render(
      <ExperimentalIconProvider motion="none">
        {iconNames.map((name) => (
          <Icon key={name} name={name} alt={name} />
        ))}
      </ExperimentalIconProvider>,
    );
    for (const name of iconNames) {
      expect(
        screen.getByRole("img", { name }).getAttribute("data-icon-pack"),
      ).toBe("petrinaut-experimental");
    }
  });

  it("inherits defaults and lets individual icons override them", () => {
    const { container } = render(
      <ExperimentalIconProvider size={20} weight={700} color="red">
        <PlaceIcon aria-label="Place" />
        <PlaceIcon size={16} weight={100} color="blue" variant="filled" />
      </ExperimentalIconProvider>,
    );
    const labelled = screen.getByRole("img", { name: "Place" });
    expect(labelled.getAttribute("width")).toBe("20");
    expect(labelled.getAttribute("stroke-width")).toBe("3");
    expect(labelled.getAttribute("color")).toBe("red");
    expect(labelled.hasAttribute("aria-hidden")).toBe(false);
    const decorative = container.querySelector('svg[aria-hidden="true"]');
    expect(decorative?.getAttribute("width")).toBe("16");
    expect(decorative?.getAttribute("stroke-width")).toBe("1");
    expect(decorative?.getAttribute("color")).toBe("blue");
    expect(decorative?.getAttribute("fill")).toBe("currentColor");
  });

  it.each([
    { parentEnabled: false, enabled: undefined, expected: false },
    { parentEnabled: true, enabled: undefined, expected: true },
    { parentEnabled: false, enabled: true, expected: true },
    { parentEnabled: true, enabled: false, expected: false },
    { parentEnabled: undefined, enabled: undefined, expected: true },
  ])(
    "resolves nested enabled=$enabled with parent enabled=$parentEnabled to $expected",
    ({ parentEnabled, enabled, expected }) => {
      const Sample = ({ parent }: { parent?: boolean }) => (
        <ExperimentalIconProvider enabled={parent} weight={700}>
          <ExperimentalIconProvider enabled={enabled} size={16}>
            <Icon name="play" alt="Play" />
            <AiAssistantIcon title="Assistant" />
          </ExperimentalIconProvider>
        </ExperimentalIconProvider>
      );
      const { rerender } = render(<Sample parent={parentEnabled} />);
      const expectEnabled = (isEnabled: boolean) => {
        for (const name of ["Play", "Assistant"]) {
          expect(
            screen.getByRole("img", { name }).getAttribute("data-icon-pack"),
          ).toBe(isEnabled ? "petrinaut-experimental" : null);
        }
      };
      expectEnabled(expected);
      rerender(<Sample parent={!parentEnabled} />);
      expectEnabled(enabled ?? !parentEnabled);
    },
  );

  it.each([
    [0, 1],
    [800, 3],
    [Number.NaN, 2],
    [Number.POSITIVE_INFINITY, 2],
  ])(
    "keeps weight %s within the supported stroke range",
    (weight, strokeWidth) => {
      const markup = renderToStaticMarkup(
        <ExperimentalIcon name="place" weight={weight} />,
      );
      expect(markup).toContain(`stroke-width="${strokeWidth}"`);
    },
  );
});

describe("experimental icon motion", () => {
  const originalAnimate = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "animate",
  );
  const cancel = vi.fn();
  const animate = vi.fn(
    (_frames: Keyframe[], _options: KeyframeAnimationOptions) =>
      ({ cancel }) as unknown as Animation,
  );
  const mediaListeners = new Set<() => void>();
  let reducedMotion = false;

  beforeEach(() => {
    reducedMotion = false;
    animate.mockClear();
    cancel.mockClear();
    mediaListeners.clear();
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return reducedMotion;
      },
      addEventListener: (_event: string, listener: () => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) =>
        mediaListeners.delete(listener),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (originalAnimate) {
      Object.defineProperty(Element.prototype, "animate", originalAnimate);
    } else {
      Reflect.deleteProperty(Element.prototype, "animate");
    }
  });

  it("replays only when its trigger changes and cancels interrupted effects", () => {
    const { rerender, unmount } = render(
      <AddPlaceIcon effect="bounce" trigger={0} />,
    );
    expect(animate).not.toHaveBeenCalled();
    rerender(<AddPlaceIcon effect="bounce" trigger={1} />);
    const animationCount = animate.mock.calls.length;
    expect(animationCount).toBeGreaterThan(0);
    rerender(
      <AddPlaceIcon effect="bounce" trigger={1} color="red" size={32} />,
    );
    expect(animate).toHaveBeenCalledTimes(animationCount);
    rerender(<AddPlaceIcon effect="bounce" trigger={2} />);
    expect(cancel).toHaveBeenCalledTimes(animationCount);
    expect(animate).toHaveBeenCalledTimes(animationCount * 2);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(animationCount * 2);
  });

  it("combines effects on separate groups and stops a loop", () => {
    const { rerender } = render(
      <AddTransitionIcon effect={["bounce", "pulse"]} active duration={900} />,
    );
    expect(
      animate.mock.calls.some(([frames]) =>
        frames.some((frame) => frame.transform),
      ),
    ).toBe(true);
    expect(
      animate.mock.calls.some(([frames]) =>
        frames.some((frame) => frame.opacity),
      ),
    ).toBe(true);
    expect(
      animate.mock.calls.every(
        ([, options]) =>
          options.duration === 900 && options.iterations === Infinity,
      ),
    ).toBe(true);
    const count = animate.mock.calls.length;
    rerender(
      <AddTransitionIcon
        effect={["bounce", "pulse"]}
        active={false}
        duration={900}
      />,
    );
    expect(cancel).toHaveBeenCalledTimes(count);
    expect(animate).toHaveBeenCalledTimes(count);
  });

  it.each(["clockRotateLeft", "cube"] as const)(
    "keeps the explicit %s action loop running during hover and focus",
    (name) => {
      const requestFrame = vi.fn(() => 1);
      const cancelFrame = vi.fn();
      vi.stubGlobal("requestAnimationFrame", requestFrame);
      vi.stubGlobal("cancelAnimationFrame", cancelFrame);
      const { rerender } = render(
        <button type="button">
          <ExperimentalIcon name={name} effect="action" active />
        </button>,
      );
      const animationCount = animate.mock.calls.length;
      const frameCount = requestFrame.mock.calls.length;
      expect(animationCount + frameCount).toBeGreaterThan(0);
      const button = screen.getByRole("button");
      fireEvent.pointerEnter(button);
      fireEvent.focus(button);
      fireEvent.pointerLeave(button);
      fireEvent.blur(button);
      expect(cancel).not.toHaveBeenCalled();
      expect(cancelFrame).not.toHaveBeenCalled();
      expect(animate).toHaveBeenCalledTimes(animationCount);
      expect(requestFrame).toHaveBeenCalledTimes(frameCount);

      rerender(
        <button type="button">
          <ExperimentalIcon name={name} effect="action" active={false} />
        </button>,
      );
      expect(
        cancel.mock.calls.length + cancelFrame.mock.calls.length,
      ).toBeGreaterThan(0);
      animate.mockClear();
      requestFrame.mockClear();
      fireEvent.pointerEnter(button);
      expect(
        animate.mock.calls.length + requestFrame.mock.calls.length,
      ).toBeGreaterThan(0);
    },
  );

  it("draws the frame and corner badge in order for both variants", () => {
    const { rerender, container } = render(
      <AddPlaceIcon
        effect="draw"
        choreography="sequential"
        duration={900}
        badge="visible"
      />,
    );
    expect(animate).toHaveBeenCalledTimes(3);
    expect(animate.mock.calls.map(([frames]) => frames.at(1)?.offset)).toEqual([
      0,
      1 / 3,
      2 / 3,
    ]);
    expect(
      animate.mock.calls.every(
        ([frames]) =>
          frames.at(0)?.strokeDashoffset === 1 &&
          frames.at(-1)?.strokeDashoffset === 0,
      ),
    ).toBe(true);
    animate.mockClear();
    rerender(
      <AddPlaceIcon
        effect="draw"
        choreography="sequential"
        duration={900}
        variant="filled"
        badge="visible"
        trigger={1}
      />,
    );
    expect(animate).toHaveBeenCalledTimes(3);
    expect(
      container.querySelector('mask [data-icon-draw="reveal"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('rect[fill="currentColor"]')
        ?.getAttribute("mask"),
    ).toContain("reveal");
  });

  it("cancels motion when the system preference changes and keeps the selected state", () => {
    const { container, rerender } = render(
      <AddPlaceIcon effect="rotate" active selected variant="filled" />,
    );
    const count = animate.mock.calls.length;
    expect(count).toBeGreaterThan(0);
    act(() => {
      reducedMotion = true;
      mediaListeners.forEach((listener) => listener());
    });
    expect(cancel).toHaveBeenCalledTimes(count);
    expect(container.querySelector('[data-icon-motion="none"]')).not.toBeNull();
    expect(
      container
        .querySelector('rect[fill="currentColor"]')
        ?.getAttribute("style"),
    ).toContain("transition: none");
    rerender(
      <AddTransitionIcon
        effect="bounce"
        trigger={1}
        motion="none"
        selected
        variant="filled"
      />,
    );
    expect(animate).toHaveBeenCalledTimes(count);
  });

  it("starts the flask surface wave together and removes it when motion is disabled", () => {
    const { container, rerender } = render(<ExperimentalIcon name="flask" />);
    const beginWave = vi.fn();
    const surfaces = container.querySelectorAll("animate");
    expect(surfaces.length).toBeGreaterThan(0);
    for (const surface of surfaces) {
      Object.defineProperty(surface, "beginElement", { value: beginWave });
    }
    const bubbles = container.querySelector('[data-icon-part="bubbles"]');
    expect(bubbles).not.toBeNull();
    const hoverAnimation = new Event("animationstart", { bubbles: true });
    Object.defineProperty(hoverAnimation, "animationName", {
      value: "petrinautIconLiquidWave",
    });
    fireEvent(bubbles!, hoverAnimation);
    expect(beginWave).toHaveBeenCalledTimes(surfaces.length);

    rerender(<ExperimentalIcon name="flask" motion="none" selected />);
    expect(container.querySelector("animate")).toBeNull();
    expect(container.querySelector('[data-selected="true"]')).not.toBeNull();
  });

  it("inherits motion defaults, preserves refs and uses unique masks", () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(
      <ExperimentalIconProvider motion="none" weight={700}>
        <ExperimentalIconProvider size={32}>
          <AddPlaceIcon ref={ref} effect="bounce" aria-label="Add place" />
          <AddPlaceIcon variant="filled" />
        </ExperimentalIconProvider>
      </ExperimentalIconProvider>,
    );
    expect(animate).not.toHaveBeenCalled();
    expect(ref.current).toBe(screen.getByRole("img", { name: "Add place" }));
    expect(ref.current?.getAttribute("stroke-width")).toBe("3");
    const maskIds = Array.from(
      container.querySelectorAll("mask"),
      (mask) => mask.id,
    );
    expect(new Set(maskIds).size).toBe(maskIds.length);
  });

  it.each([100, 420, 600, 700, 900, 2400])(
    "keeps staggered keyframes valid at %s milliseconds",
    (duration) => {
      render(
        <AddPlaceIcon
          effect={["bounce", "pulse", "rotate", "draw"]}
          active
          duration={duration}
        />,
      );
      for (const [frames] of animate.mock.calls) {
        const offsets = frames.map((frame) => frame.offset ?? 0);
        expect(offsets.every((offset) => offset >= 0 && offset <= 1)).toBe(
          true,
        );
        expect(offsets).toEqual(
          offsets.toSorted((left, right) => left - right),
        );
      }
    },
  );

  it("keeps the same SVG frame for the place-to-transition morph", () => {
    const { container, rerender } = render(
      <ExperimentalIcon name="addPlace" />,
    );
    const frame = container.querySelector('[data-icon-draw="frame"]');
    rerender(<ExperimentalIcon name="addTransition" selected />);
    expect(container.querySelector('[data-icon-draw="frame"]')).toBe(frame);
    expect(frame?.getAttribute("rx")).toBe("2");
    expect(getExperimentalIconEffects("addPlace")).toContain("draw");
    expect(getExperimentalIconEffects("settings")).not.toContain("draw");
  });

  it("rewinds the history details on hover and click without rotating the entire icon", () => {
    const { container, unmount } = render(
      <button type="button">
        <ExperimentalIcon name="clockRotateLeft" />
      </button>,
    );
    const button = screen.getByRole("button");
    fireEvent.pointerEnter(button);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(
      animate.mock.calls.some(([frames]) =>
        frames.some((frame) => frame.transform === "rotate(-100deg)"),
      ),
    ).toBe(true);
    fireEvent.click(button);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(animate).toHaveBeenCalledTimes(4);
    expect(
      container.querySelector("[data-icon-feedback]")?.getAttribute("style"),
    ).not.toContain("rotate");
    unmount();
    expect(cancel).toHaveBeenCalledTimes(4);
  });

  it("jumps on click without replacing the runner's independent gait", () => {
    const { container, unmount } = render(
      <button type="button">
        <ExperimentalIcon name="personRunning" />
      </button>,
    );
    const button = screen.getByRole("button");
    const runner = container.querySelector('[data-icon-detail="runner"]');
    expect(runner?.querySelectorAll("[data-runner-part]")).toHaveLength(5);
    expect(container.querySelector('[data-hover="true"]')).not.toBeNull();
    expect(container.querySelector("svg")?.style.overflow).toBe("visible");
    expect(animate).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts.at(-1)).toBe(runner);
    expect(animate.mock.calls.at(-1)).toEqual([
      expect.arrayContaining([
        expect.objectContaining({ transform: "translateY(1px) scaleY(.9)" }),
        expect.objectContaining({ transform: "translateY(-4px) scaleY(1.04)" }),
        expect.objectContaining({ transform: "translateY(.6px) scaleY(.94)" }),
      ]),
      expect.objectContaining({
        iterations: 1,
        fill: "none",
        easing: "linear",
      }),
    ]);

    fireEvent.click(button);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledTimes(2);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it.each(["disabled", "motion", "interaction"])(
    "keeps the runner still with the %s opt-out",
    (optOut) => {
      const { container } = render(
        <button type="button" disabled={optOut === "disabled"}>
          <ExperimentalIcon
            name="personRunning"
            motion={optOut === "motion" ? "none" : "auto"}
            interaction={optOut === "interaction" ? "none" : "auto"}
            hover={optOut === "interaction" ? "none" : "auto"}
          />
        </button>,
      );
      const button = screen.getByRole("button");
      fireEvent.pointerEnter(button);
      fireEvent.focus(button);
      fireEvent.click(button);
      expect(animate).not.toHaveBeenCalled();
      if (optOut !== "disabled") {
        expect(container.querySelector('[data-hover="true"]')).toBeNull();
      }
    },
  );

  it("stops the runner's jump and gait when reduced motion is requested", () => {
    const { container } = render(
      <button type="button">
        <ExperimentalIcon name="personRunning" />
      </button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(animate).toHaveBeenCalledTimes(1);
    act(() => {
      reducedMotion = true;
      mediaListeners.forEach((listener) => listener());
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-hover="true"]')).toBeNull();
    expect(container.querySelector('[data-icon-motion="none"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("suppresses automatic interaction for disabled controls and motion opt-outs", () => {
    const { rerender } = render(
      <button type="button" aria-disabled="true">
        <ExperimentalIcon name="clockRotateLeft" />
      </button>,
    );
    fireEvent.pointerEnter(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(animate).not.toHaveBeenCalled();
    rerender(
      <button type="button">
        <ExperimentalIcon name="clockRotateLeft" motion="none" />
      </button>,
    );
    fireEvent.pointerEnter(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(animate).not.toHaveBeenCalled();
    rerender(
      <button type="button">
        <ExperimentalIcon
          name="clockRotateLeft"
          interaction="none"
          hover="none"
        />
      </button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(animate).not.toHaveBeenCalled();
  });

  it("scrubs both visible parameter knobs and their track masks together on click", () => {
    render(
      <button type="button">
        <ExperimentalIcon name="parameter" />
      </button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(animate).toHaveBeenCalledTimes(4);
    const offsets = animate.mock.calls.map(([frames]) => frames[1]?.transform);
    expect(
      offsets.filter((transform) => transform === "translateX(3px)"),
    ).toHaveLength(2);
    expect(
      offsets.filter((transform) => transform === "translateX(-3px)"),
    ).toHaveLength(2);
  });

  it("offers matching labels and drawable paths for every modeling alternative", () => {
    for (const study of petriconStudies.filter(
      (candidate) => candidate.category === "Modeling",
    )) {
      expect(study.names).toHaveLength(3);
      expect(study.variants).toHaveLength(study.names.length);
      for (const name of study.names) {
        const { container, unmount } = render(
          <ExperimentalIcon name={name} effect="draw" />,
        );
        expect(getExperimentalIconEffects(name)).toContain("draw");
        const paths = container.querySelectorAll("[data-icon-draw]");
        expect(paths.length).toBeGreaterThan(1);
        for (const path of paths)
          expect(path.getAttribute("pathLength")).toBe("1");
        unmount();
      }
    }
  });

  it("hands the cube from hover to click with one frame loop and stops for reduced motion", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const tick = (time: number) =>
      act(() => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(time));
      });
    const Sample = ({
      trigger = 0,
      motion = "auto",
    }: {
      trigger?: number;
      motion?: "auto" | "none";
    }) => (
      <button type="button">
        <ExperimentalIcon
          name="cube"
          effect="action"
          trigger={trigger}
          motion={motion}
        />
      </button>
    );
    const { container, rerender } = render(<Sample />);
    const cube = container.querySelector("[data-icon-cube]");
    fireEvent.pointerEnter(screen.getByRole("button"));
    tick(0);
    tick(100);
    const hoverAngle = Number(cube?.getAttribute("data-cube-angle"));
    expect(hoverAngle).toBeGreaterThan(35);
    expect(hoverAngle).toBeLessThan(55);
    rerender(<Sample trigger={1} />);
    expect(frames.size).toBe(1);
    tick(110);
    tick(250);
    expect(Number(cube?.getAttribute("data-cube-angle"))).toBeGreaterThan(
      hoverAngle,
    );
    expect(cube?.querySelectorAll('[visibility="visible"]')).toHaveLength(9);
    rerender(<Sample trigger={1} motion="none" />);
    expect(frames.size).toBe(0);
    expect(cube?.getAttribute("data-cube-angle")).toBe("35");
  });

  it.each([
    { exit: "pointerLeave", triggered: false },
    { exit: "blur", triggered: false },
    { exit: "pointerLeave", triggered: true },
    { exit: "blur", triggered: true },
  ] as const)(
    "finishes a cube turn after $exit with triggered=$triggered",
    ({ exit, triggered }) => {
      const frames = new Map<number, FrameRequestCallback>();
      let frameId = 0;
      vi.stubGlobal(
        "requestAnimationFrame",
        (callback: FrameRequestCallback) => {
          frames.set(++frameId, callback);
          return frameId;
        },
      );
      vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
      const tick = (time: number) =>
        act(() => {
          const pending = [...frames.values()];
          frames.clear();
          pending.forEach((callback) => callback(time));
        });
      const Sample = ({ trigger = 0 }: { trigger?: number }) => (
        <button type="button">
          <ExperimentalIcon
            name="cube"
            effect={triggered ? "action" : undefined}
            trigger={triggered ? trigger : undefined}
          />
        </button>
      );
      const { container, rerender, unmount } = render(<Sample />);
      const button = screen.getByRole("button");
      const cube = container.querySelector("[data-icon-cube]");
      const enter = exit === "blur" ? "focus" : "pointerEnter";
      fireEvent[enter](button);
      tick(0);
      tick(100);
      const startingAngle = Number(cube?.getAttribute("data-cube-angle"));
      if (triggered) rerender(<Sample trigger={1} />);
      else fireEvent.click(button);
      tick(110);
      tick(120);
      fireEvent[exit](button);
      fireEvent[enter](button);
      fireEvent[exit](button);
      expect(frames.size).toBe(1);
      tick(1100);
      expect(Number(cube?.getAttribute("data-cube-angle"))).toBeCloseTo(
        startingAngle + 90,
      );
      expect(frames.size).toBe(0);

      fireEvent[enter](button);
      tick(1200);
      tick(1500);
      expect(Number(cube?.getAttribute("data-cube-angle"))).toBe(145);
      fireEvent[exit](button);
      tick(1600);
      tick(1900);
      expect(Number(cube?.getAttribute("data-cube-angle"))).toBe(125);
      unmount();
      expect(frames.size).toBe(0);
    },
  );

  it("clamps drawing progress, preserves it with motion disabled, and releases the override", () => {
    const { container, rerender } = render(
      <ExperimentalIcon
        name="differentialEquation"
        drawProgress={0.4}
        motion="none"
      />,
    );
    const path = container.querySelector<SVGPathElement>("[data-icon-draw]");
    expect(path?.style.strokeDashoffset).toBe("0.6");
    rerender(
      <ExperimentalIcon name="differentialEquation" drawProgress={-1} />,
    );
    expect(path?.style.opacity).toBe("0");
    rerender(<ExperimentalIcon name="differentialEquation" drawProgress={2} />);
    expect(path?.style.strokeDashoffset).toBe("0");
    rerender(<ExperimentalIcon name="differentialEquation" />);
    expect(path?.style.strokeDasharray).toBe("");
    expect(path?.style.fillOpacity).toBe("");
  });
});
