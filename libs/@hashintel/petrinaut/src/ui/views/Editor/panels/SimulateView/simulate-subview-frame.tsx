import { css } from "@hashintel/ds-helpers/css";

import { Stack } from "../../../../components/stack";

import type { ReactNode } from "react";

const mainContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "[0]",
  height: "full",
  backgroundColor: "neutral.s00",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: "[52px]",
  paddingLeft: "[18px]",
  paddingRight: "[20px]",
  paddingY: "[12px]",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s40",
  flexShrink: 0,
});

const headerTitleStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});

const contentStyle = css({
  flex: "1",
  display: "flex",
  flexDirection: "column",
  minHeight: "[0]",
  overflowY: "auto",
  backgroundColor: "neutral.s00",
});

type SimulateSubviewFrameProps = {
  action: ReactNode;
  children: ReactNode;
  title: string;
};

export const SimulateSubviewFrame = ({
  action,
  children,
  title,
}: SimulateSubviewFrameProps) => (
  <Stack className={mainContainerStyle}>
    <div className={headerStyle}>
      <span className={headerTitleStyle}>{title}</span>
      {action}
    </div>

    <div className={contentStyle}>{children}</div>
  </Stack>
);
