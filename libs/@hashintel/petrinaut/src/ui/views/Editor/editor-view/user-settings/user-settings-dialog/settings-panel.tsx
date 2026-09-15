import { Tabs } from "@ark-ui/react/tabs";

import { css } from "@hashintel/ds-helpers/css";

import { useScrollOverflow } from "../../../../../hooks/use-scroll-overflow";

import type { PetrinautSettingsSection } from "../../../../../../react/navigation";
import type { ReactNode, RefObject } from "react";

const edgeFadeStyle = css({
  position: "absolute",
  insetInline: "0",
  height: "16",
  pointerEvents: "none",
  zIndex: "[1]",
  "&[data-edge='top']": { top: "0" },
  "&[data-edge='bottom']": { bottom: "0", transform: "[rotate(180deg)]" },
  "& > span, &::after": {
    position: "absolute",
    insetInline: "0",
    opacity: "0",
  },
  "& > span": {
    top: "0",
    maskImage: "[linear-gradient(to bottom, black, transparent)]",
  },
  _after: {
    content: '""',
    top: "[-1px]",
    height: "[calc(100% + 1px)]",
    background:
      "[linear-gradient(to bottom, {colors.neutral.s00} 1px, transparent)]",
  },
  "&[data-visible] > span, &[data-visible]::after": { opacity: "1" },
  "&[data-animated] > span, &[data-animated]::after": {
    transition: "[opacity 120ms ease]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
});

const edgeBlurStyles = [
  css({
    height: "16",
    backdropFilter: "[blur(0.5px)]",
  }),
  css({
    height: "12",
    backdropFilter: "[blur(1px)]",
  }),
  css({
    height: "8",
    backdropFilter: "[blur(2px)]",
  }),
];

const ScrollEdgeFade = ({
  edge,
  visible,
  animated,
}: {
  edge: "top" | "bottom";
  visible: boolean;
  animated: boolean;
}) => (
  <div
    aria-hidden="true"
    className={edgeFadeStyle}
    data-edge={edge}
    data-visible={visible || undefined}
    data-animated={animated || undefined}
  >
    {edgeBlurStyles.map((className) => (
      <span key={className} className={className} />
    ))}
  </div>
);

const scrollAreaStyle = css({
  position: "relative",
  flex: "[1 1 0]",
  minHeight: "0",
});

const contentStyle = css({
  position: "relative",
  height: "full",
  minWidth: "0",
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
  paddingX: "5",
  paddingBottom: "5",
  outline: "none",
  "&[hidden]": { display: "none" },
  "@media (max-width: 600px)": { paddingX: "3", paddingBottom: "3" },
});

const SettingsScrollBody = ({
  section,
  animated,
  children,
}: {
  section: PetrinautSettingsSection;
  animated: boolean;
  children: ReactNode;
}) => {
  const { scrollRef, canScrollUp, canScrollDown, onScroll } =
    useScrollOverflow();

  return (
    <div className={scrollAreaStyle}>
      <Tabs.Content
        ref={scrollRef}
        value={section}
        hidden={false}
        className={contentStyle}
        onScroll={onScroll}
      >
        <div>{children}</div>
      </Tabs.Content>
      <ScrollEdgeFade edge="top" visible={canScrollUp} animated={animated} />
      <ScrollEdgeFade
        edge="bottom"
        visible={canScrollDown}
        animated={animated}
      />
    </div>
  );
};

export const SettingsPanel = ({
  section,
  headingRef,
  heading,
  animated,
  children,
}: {
  section: PetrinautSettingsSection;
  headingRef: RefObject<HTMLElement | null>;
  heading: ReactNode;
  animated: boolean;
  children: ReactNode;
}) => (
  <div
    className={css({
      gridArea: "[1 / 2]",
      display: "flex",
      flexDirection: "column",
      minWidth: "0",
      minHeight: "0",
      cursor: "auto",
    })}
  >
    <header
      ref={headingRef}
      className={css({
        flexShrink: "0",
        paddingX: "5",
        paddingTop: "5",
        cursor: "grab",
        touchAction: "none",
        _active: { cursor: "grabbing" },
        "@media (max-width: 600px)": { paddingX: "3", paddingTop: "3" },
      })}
    >
      {heading}
    </header>
    <SettingsScrollBody key={section} section={section} animated={animated}>
      {children}
    </SettingsScrollBody>
  </div>
);
