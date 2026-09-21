import {
  createContext,
  use,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../react/state/user-settings-context";
import { FocusControls } from "../worksheet/focus-controls";
import { ScrollFade } from "./scroll-fade";

interface HeaderPosition {
  id: string;
  top: number;
  inactive: boolean;
  upcoming: boolean;
  bottom: number;
  topFade: boolean;
  bottomFade: boolean;
}

const StackContext = createContext<{
  positions: HeaderPosition[];
  jump: (id: string) => void;
} | null>(null);

const stackStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "[0]",
});
const headerStyle = css({
  position: "sticky",
  zIndex: "[3]",
  backgroundColor: "neutral.s00",
  flexShrink: "0",
  "&[data-inactive] > :not([data-scroll-fade])": { opacity: "[0.6]" },
});
const animatedStyle = css({
  "& > *": { transition: "[opacity 160ms ease]" },
  "@media (prefers-reduced-motion: reduce)": {
    "& > *": { transition: "[none]" },
  },
});
const anchorStyle = css({
  height: "[0]",
  flexShrink: "0",
  pointerEvents: "none",
});
const sectionSpacingStyle = css({ marginTop: "3" });
const titleButtonStyle = css({
  color: "[inherit]",
  font: "inherit",
  textAlign: "left",
  border: "none",
  padding: "[0]",
  background: "[transparent]",
  cursor: "pointer",
  borderRadius: "xs",
  "&[tabindex='-1']": { cursor: "default" },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[2px]",
  },
});

const scrollContentTop = (element: HTMLElement) => {
  const paddingTop = Number.parseFloat(getComputedStyle(element).paddingTop);
  return (
    element.getBoundingClientRect().top +
    element.clientTop +
    (Number.isFinite(paddingTop) ? paddingTop : 0)
  );
};

export const StackedSections: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const [positions, setPositions] = useState<HeaderPosition[]>([]);
  const [trailingSpace, setTrailingSpace] = useState(0);
  const { showAnimations } = use(UserSettingsContext);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    let scroller: HTMLElement | null = root;
    while (
      scroller &&
      !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
    ) {
      scroller = scroller.parentElement;
    }
    if (!scroller) {
      return;
    }
    scrollRef.current = scroller;
    let frame = 0;
    const update = () => {
      const headers = Array.from(
        root.querySelectorAll<HTMLElement>("[data-stack-header]"),
      ).filter((header) => header.closest("[data-stacked-sections]") === root);
      let top = -(
        Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0
      );
      // A drawer's containing section may already pin its own header above this stack.
      let parent = root.parentElement;
      while (parent && parent !== scroller) {
        if (parent.hasAttribute("data-section")) {
          const header = parent.querySelector<HTMLElement>(
            ":scope > [data-section-header]",
          );
          if (header) {
            top += header.getBoundingClientRect().height;
          }
        }
        parent = parent.parentElement;
      }
      const scrollTop = scrollContentTop(scroller);
      let active = 0;
      const paddingBottom =
        Number.parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
      const scrollBottom =
        scroller.getBoundingClientRect().top +
        scroller.clientTop +
        scroller.clientHeight;
      const next = headers
        .map((header, index) => {
          const id = header.dataset.stackHeader ?? "";
          const anchor = header.previousElementSibling;
          const position = {
            id,
            top,
            inactive: false,
            upcoming: false,
            bottom: 0,
            topFade: false,
            bottomFade: false,
          };
          if (
            anchor &&
            anchor.getBoundingClientRect().top <= scrollTop + top + 1
          ) {
            active = index;
          }
          top += header.getBoundingClientRect().height;
          return position;
        })
        .map((position, index) => ({ ...position, inactive: index < active }));
      let bottom = 0;
      let firstUpcoming = -1;
      for (let index = next.length - 1; index >= 0; index--) {
        const position = next[index];
        const header = headers[index];
        if (!position || !header) {
          continue;
        }
        position.bottom = bottom - paddingBottom;
        const height = header.getBoundingClientRect().height;
        const anchorTop =
          header.previousElementSibling?.getBoundingClientRect().top ?? 0;
        position.upcoming =
          index > active && anchorTop + height > scrollBottom - bottom + 1;
        if (position.upcoming) {
          firstUpcoming = index;
        }
        bottom += height;
      }
      const activePosition = next[active];
      if (activePosition) {
        const anchorTop =
          headers[active]?.previousElementSibling?.getBoundingClientRect()
            .top ?? 0;
        activePosition.topFade = anchorTop < scrollTop + activePosition.top - 2;
      }
      const upcomingPosition = next[firstUpcoming];
      if (upcomingPosition) {
        upcomingPosition.bottomFade = true;
      }
      const lastPosition = next.at(-1);
      const lastAnchor = headers.at(-1)?.previousElementSibling;
      const tail = root.querySelector<HTMLElement>(
        ":scope > [data-stack-tail]",
      );
      if (lastPosition && lastAnchor && tail && scroller.clientHeight > 0) {
        const currentSpace = Number.parseFloat(tail.style.height) || 0;
        const targetScroll =
          scroller.scrollTop +
          lastAnchor.getBoundingClientRect().top -
          scrollTop -
          lastPosition.top;
        const availableScroll =
          scroller.scrollHeight - scroller.clientHeight - currentSpace;
        setTrailingSpace(
          Math.max(0, Math.ceil(targetScroll - availableScroll)),
        );
      }
      setPositions((previous) =>
        previous.length === next.length &&
        previous.every((position, index) => {
          const candidate = next[index];
          return (
            candidate?.id === position.id &&
            candidate.top === position.top &&
            candidate.inactive === position.inactive &&
            candidate.upcoming === position.upcoming &&
            candidate.bottom === position.bottom &&
            candidate.topFade === position.topFade &&
            candidate.bottomFade === position.bottomFade
          );
        })
          ? previous
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    resize.observe(scroller);
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true });
    scroller.addEventListener("scroll", schedule, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      scroller.removeEventListener("scroll", schedule);
      scrollRef.current = null;
    };
  }, []);

  const jump = (id: string) => {
    const root = rootRef.current;
    const scroller = scrollRef.current;
    const anchor = Array.from(
      root?.querySelectorAll<HTMLElement>("[data-stack-anchor]") ?? [],
    ).find((element) => element.dataset.stackAnchor === id);
    if (!scroller || !anchor) {
      return;
    }
    const top = positions.find((position) => position.id === id)?.top ?? 0;
    scroller.scrollTo({
      top:
        scroller.scrollTop +
        anchor.getBoundingClientRect().top -
        scrollContentTop(scroller) -
        top,
      behavior:
        showAnimations &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "instant",
    });
  };

  return (
    <StackContext value={{ positions, jump }}>
      <div
        ref={rootRef}
        data-stacked-sections
        className={cx(stackStyle, className)}
      >
        {children}
        <div
          data-stack-tail
          aria-hidden="true"
          className={anchorStyle}
          style={{ height: trailingSpace }}
        />
      </div>
    </StackContext>
  );
};

export const StackedSectionHeader: React.FC<{
  className?: string;
  spaceBefore?: boolean;
  children: (
    title: (text: string, className?: string) => React.ReactNode,
  ) => React.ReactNode;
}> = ({ className, spaceBefore, children }) => {
  const id = useId();
  const stack = use(StackContext);
  const position = stack?.positions.find((entry) => entry.id === id);
  const { showAnimations } = use(UserSettingsContext);
  const title = (text: string, titleClassName?: string) =>
    stack ? (
      <FocusControls axis="horizontal">
        <button
          type="button"
          className={cx(titleButtonStyle, titleClassName)}
          tabIndex={position?.inactive || position?.upcoming ? 0 : -1}
          aria-label={`${position?.upcoming ? "Go to" : "Back to"} ${text}`}
          onClick={() => stack.jump(id)}
        >
          {text}
        </button>
      </FocusControls>
    ) : (
      <span className={titleClassName}>{text}</span>
    );
  return (
    <>
      <div
        className={cx(anchorStyle, spaceBefore && sectionSpacingStyle)}
        data-stack-anchor={id}
        aria-hidden="true"
      />
      <div
        className={cx(headerStyle, showAnimations && animatedStyle, className)}
        data-focus-clearance="none"
        data-section-header
        data-stack-header={id}
        data-inactive={position?.inactive || position?.upcoming || undefined}
        data-stack-edge={position?.upcoming ? "bottom" : "top"}
        style={{ top: position?.top ?? 0, bottom: position?.bottom ?? 0 }}
      >
        {children(title)}
        <ScrollFade
          edge="top"
          visible={position?.topFade ?? false}
          animated={showAnimations}
          offset="100%"
          size={20}
          blur={2}
        />
        <ScrollFade
          edge="bottom"
          visible={position?.bottomFade ?? false}
          animated={showAnimations}
          offset="100%"
          size={20}
          blur={2}
        />
      </div>
    </>
  );
};
