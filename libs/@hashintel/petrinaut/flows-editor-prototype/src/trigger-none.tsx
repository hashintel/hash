/**
 * `?triggernone=2`: when nothing can start the flow (Manual off, no schedule, no responsive trigger), Publish asks
 * first in a soft popover under the button, in the DS orange at a muted step, never red. Publishing anyway is allowed:
 * the flow can still be run from Simulate, and triggers can be added later.
 *
 * The action row sits in the text column, left-aligned: the ghost "Publish anyway" label starts on the title's x
 * (the button is pulled left by its own padding and border), then the bordered button. Both buttons are DS `sm`.
 *
 * Team takes (the DS has no anchored warning popover):
 * - `?triggernone=2t`: the Figma DS Toast, warning type (`WmnosvOvi4Blw0HK0jh1mG` 42311:29880) as drawn, placed by the
 *   Popover: 360 wide, 16 padding, radius 12, shadow-lg; 15 px filled exclamation in a 20 px column, 8 px gap; title
 *   Medium 14, description 4 px below, actions 12 px below; outline (code `subtle`) then ghost, 24 px buttons (the
 *   Figma xs height; code `xs` is 21). Button gap 8 px (the
 *   Dialog footer's gap "2") instead of the Toast's 3 px.
 * - `?triggernone=2b`: the code DS Banner (warning, outline) inside the Popover.
 */
import { Banner, Button, Icon, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useEditor } from "./editor-context";
import { openFlowTriggers } from "./flow-triggers";
import { triggerNoneLayout } from "./trigger-flags";

const TITLE = "Nothing can start this flow";
const BODY =
  "Manual runs are off and it has no schedules or responsive triggers.";

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  // 360, the Figma DS Toast width: at 320 the left-aligned row squeezed the buttons' padding.
  width: "[360px]",
  padding: "4",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  boxShadow: "[0 4px 12px rgba(0, 0, 0, 0.08)]",
});

type Props = {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onPublish: () => void;
};

export const NoTriggerWarning = (props: Props) => {
  const { document } = useEditor();
  const editTriggers = () => {
    props.onClose();
    openFlowTriggers(document.name);
  };
  return (
    <Popover
      triggerRef={props.triggerRef}
      position="bottom-end"
      gapX={0}
      gapY={8}
      onClose={props.onClose}
    >
      {triggerNoneLayout === "toast" ? (
        <ToastLayout {...props} onEdit={editTriggers} />
      ) : triggerNoneLayout === "banner" ? (
        <BannerLayout {...props} onEdit={editTriggers} />
      ) : (
        <div
          role="dialog"
          aria-label={TITLE}
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
                minWidth: "0",
              })}
            >
              <span
                data-tn="title"
                className={css({
                  textStyle: "sm",
                  fontWeight: "medium",
                  color: "neutral.fg.heading",
                })}
              >
                {TITLE}
              </span>
              <span
                data-tn="body"
                className={css({
                  textStyle: "sm",
                  color: "neutral.fg.muted",
                  textWrap: "balance",
                })}
              >
                {BODY}
              </span>
              <span
                className={css({
                  display: "flex",
                  gap: "2",
                  marginTop: "2",
                  whiteSpace: "nowrap",
                  "& > button": { flexShrink: "0" },
                })}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  tone="neutral"
                  // The ghost has no visible edge, so its label is its edge: pull it left by its padding and border.
                  className={css({
                    marginLeft: "[calc(-1 * (var(--spacing-2) + 1px))]",
                  })}
                  onClick={props.onPublish}
                >
                  Publish anyway
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  tone="neutral"
                  iconName="arrowUpRight"
                  iconPosition="right"
                  onClick={editTriggers}
                >
                  Edit flow triggers
                </Button>
              </span>
            </span>
          </span>
        </div>
      )}
    </Popover>
  );
};

/** The Figma DS filled exclamation-circle (Toast warning icon), 15 px. */
const ExclamationCircleSolid = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
    <path
      fill="currentColor"
      d="M7.5.39a7.11 7.11 0 1 0 0 14.22A7.11 7.11 0 0 0 7.5.39Zm-.67 3.94a.67.67 0 0 1 1.34 0v3.68a.67.67 0 0 1-1.34 0V4.33Zm.67 7.1a.89.89 0 1 1 0-1.78.89.89 0 0 1 0 1.78Z"
    />
  </svg>
);

/** Figma DS Button xs is 24 px high; the code DS `xs` is 21 px, so the Toast take sets the Figma height. */
const figmaXs = css({ height: "[24px]" });

const ToastLayout = ({
  onPublish,
  onClose,
  onEdit,
}: Props & { onEdit: () => void }) => (
  <div
    role="dialog"
    aria-label={TITLE}
    data-trigger-none-publish
    className={css({
      position: "relative",
      display: "flex",
      alignItems: "flex-start",
      gap: "2",
      width: "[360px]",
      padding: "4",
      backgroundColor: "neutral.bgSolid.min",
      borderWidth: "thin",
      borderStyle: "solid",
      borderColor: "neutral.bd.subtle",
      borderRadius: "xl",
      boxShadow: "lg",
    })}
  >
    <span
      className={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: "0",
        width: "[20px]",
        height: "[14px]",
        color: "orange.s90",
      })}
    >
      <ExclamationCircleSolid />
    </span>
    <span
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "3",
        flex: "1",
        minWidth: "0",
        paddingRight: "5",
      })}
    >
      <span className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
        <span
          data-tn="title"
          className={css({
            fontSize: "[14px]",
            lineHeight: "[14px]",
            fontWeight: "medium",
            // Figma content-emphasis.
            color: "neutral.s120",
          })}
        >
          {TITLE}
        </span>
        <span
          data-tn="body"
          className={css({
            fontSize: "[14px]",
            lineHeight: "[20px]",
            // Figma content-default at 90 %.
            color: "neutral.s115",
            opacity: "[0.9]",
          })}
        >
          {BODY}
        </span>
      </span>
      <span
        className={css({ display: "flex", gap: "2", whiteSpace: "nowrap" })}
      >
        <Button
          size="xs"
          variant="subtle"
          tone="neutral"
          iconName="arrowUpRight"
          iconPosition="right"
          className={figmaXs}
          onClick={onEdit}
        >
          Edit flow triggers
        </Button>
        <Button
          size="xs"
          variant="ghost"
          tone="neutral"
          className={figmaXs}
          onClick={onPublish}
        >
          Publish anyway
        </Button>
      </span>
    </span>
    <span
      className={css({ position: "absolute", top: "[5px]", right: "[7px]" })}
    >
      <Button
        size="xxs"
        variant="ghost"
        tone="neutral"
        iconName="close"
        aria-label="Close"
        className={css({
          width: "[20px]",
          height: "[20px]",
          paddingX: "0",
          color: "neutral.fg.body",
        })}
        onClick={onClose}
      />
    </span>
  </div>
);

const BannerLayout = ({
  onPublish,
  onEdit,
}: Props & { onEdit: () => void }) => (
  <div
    data-trigger-none-publish
    role="dialog"
    aria-label={TITLE}
    className={css({
      width: "[360px]",
      borderRadius: "xl",
      backgroundColor: "neutral.bgSolid.min",
      boxShadow: "lg",
    })}
  >
    <Banner tone="warning" variant="outline">
      <Banner.Title as="h3">{TITLE}</Banner.Title>
      <Banner.Description>{BODY}</Banner.Description>
      <Banner.Actions>
        <Banner.ActionButton
          tone="neutral"
          iconName="arrowUpRight"
          iconPosition="right"
          onClick={onEdit}
        >
          Edit flow triggers
        </Banner.ActionButton>
        <Banner.ActionButton variant="ghost" tone="neutral" onClick={onPublish}>
          Publish anyway
        </Banner.ActionButton>
      </Banner.Actions>
    </Banner>
  </div>
);
