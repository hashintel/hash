/**
 * `?triggernone=2`: when nothing can start the flow (Manual off, no schedule, no responsive trigger), Publish asks
 * first in a soft popover under the button, in the DS orange at a muted step, never red. Publishing anyway is allowed:
 * the flow can still be run from Simulate, and triggers can be added later.
 */
import { Button, Icon, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useEditor } from "./editor-context";
import { openFlowTriggers } from "./flow-triggers";

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "[320px]",
  padding: "4",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  boxShadow: "[0 4px 12px rgba(0, 0, 0, 0.08)]",
});

export const NoTriggerWarning = ({
  triggerRef,
  onClose,
  onPublish,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onPublish: () => void;
}) => {
  const { document } = useEditor();
  return (
    <Popover
      triggerRef={triggerRef}
      position="bottom-end"
      gapX={0}
      gapY={8}
      onClose={onClose}
    >
      <div
        role="dialog"
        aria-label="Nothing can start this flow"
        className={cardStyle}
        data-trigger-none-publish
      >
        <span className={css({ display: "flex", gap: "2" })}>
          <span
            className={css({
              display: "inline-flex",
              paddingTop: "[2px]",
              color: "orange.fg.muted",
            })}
          >
            <Icon name="warning" size="sm" />
          </span>
          <span
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "1",
            })}
          >
            <span
              className={css({
                textStyle: "sm",
                fontWeight: "medium",
                color: "neutral.fg.heading",
              })}
            >
              Nothing can start this flow
            </span>
            <span
              className={css({ textStyle: "sm", color: "neutral.fg.muted" })}
            >
              Manual runs are off and it has no schedules or responsive
              triggers.
            </span>
          </span>
        </span>
        <span
          className={css({
            display: "flex",
            justifyContent: "flex-end",
            gap: "2",
            whiteSpace: "nowrap",
          })}
        >
          <Button size="sm" variant="ghost" tone="neutral" onClick={onPublish}>
            Publish anyway
          </Button>
          <Button
            size="sm"
            variant="subtle"
            tone="neutral"
            iconName="arrowUpRight"
            iconPosition="right"
            onClick={() => {
              onClose();
              openFlowTriggers(document.name);
            }}
          >
            Edit flow triggers
          </Button>
        </span>
      </div>
    </Popover>
  );
};
