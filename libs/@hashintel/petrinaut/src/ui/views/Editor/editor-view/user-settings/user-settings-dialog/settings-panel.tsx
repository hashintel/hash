import { Tabs } from "@ark-ui/react/tabs";

import { css } from "@hashintel/ds-helpers/css";

import { ScrollFade } from "../../../../../components/scroll-fade";
import { useScrollOverflow } from "../../../../../hooks/use-scroll-overflow";

import type { PetrinautSettingsSection } from "../../../../../../react/navigation";
import type { ReactNode, RefObject } from "react";

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
      <ScrollFade
        edge="top"
        visible={canScrollUp}
        animated={animated}
        size={64}
        blur={2}
      />
      <ScrollFade
        edge="bottom"
        visible={canScrollDown}
        animated={animated}
        size={64}
        blur={2}
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
