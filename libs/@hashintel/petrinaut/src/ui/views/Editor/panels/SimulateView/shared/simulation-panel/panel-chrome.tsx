import { use, type ReactNode } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { simulationHeaderStyle } from "../simulation-header";
import { PanelContext } from "./panel-context";
import { SimulationPanelControls } from "./panel-controls";
import { SimulationPanelTitle } from "./panel-title";

export const PanelHeader = ({ description }: { description?: ReactNode }) => {
  const { title } = use(PanelContext);
  return (
    <header
      className={cx(
        simulationHeaderStyle({ withDescription: !!description }),
        css({
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingX: "5",
          paddingY: "3",
          borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
        }),
      )}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "3",
          minWidth: "[0]",
        })}
      >
        <h2
          className={css({
            margin: "[0]",
            flex: "[1]",
            minWidth: "[0]",
            fontSize: "sm",
            fontWeight: "semibold",
            color: "neutral.s120",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          <SimulationPanelTitle title={title} />
        </h2>
        <SimulationPanelControls />
      </div>
      {description ? (
        <p
          className={css({
            marginTop: "2",
            marginBottom: "[0]",
            fontSize: "sm",
            color: "neutral.s90",
          })}
        >
          {description}
        </p>
      ) : null}
    </header>
  );
};

export const PanelBody = ({
  children,
  className,
  withPadding = true,
  scrollable = true,
}: {
  children: ReactNode;
  className?: string;
  withPadding?: boolean;
  scrollable?: boolean;
}) => (
  <div
    className={cx(
      css({
        flex: "[1]",
        minHeight: "[0]",
        overflowY: scrollable ? "auto" : "hidden",
        overscrollBehavior: "contain",
        padding: withPadding ? "5" : "[0]",
      }),
      className,
    )}
  >
    {children}
  </div>
);

export const PanelFooter = ({
  actions,
  secondaryActions,
}: {
  actions: ReactNode;
  secondaryActions?: ReactNode;
}) => (
  <footer
    className={css({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "3",
      flexShrink: "0",
      paddingX: "5",
      paddingY: "3",
      borderTop: "[1px solid {colors.neutral.bd.subtle}]",
    })}
  >
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "2",
        minWidth: "[0]",
      })}
    >
      {secondaryActions}
    </div>
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "2",
        minWidth: "[0]",
      })}
    >
      {actions}
    </div>
  </footer>
);
