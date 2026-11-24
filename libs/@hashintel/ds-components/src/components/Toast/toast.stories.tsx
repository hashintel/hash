import { useCallback, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { PortalContainerContext } from "../../util/portal-container-context";
import { Button } from "../Button/button";
import { Toast, type ToastProps } from "./toast";
import { toastTones, toastVariants } from "./toast.recipe";
import { Toaster } from "./toaster";

import type { Position } from "../Tooltip/base-tooltip";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Toast",
  component: Toast,
} satisfies Meta;

export default meta;

type Story = StoryObj;

const demoActions = (
  <>
    <Toast.Action>View</Toast.Action>
    <Toast.Action>Undo</Toast.Action>
  </>
);

const maxWidthDemoBody =
  "Version 3 of the Person type is now live. Entities created from earlier versions keep their properties until you upgrade them.";

const manyActions = (
  <>
    <Toast.Action>Retry</Toast.Action>
    <Toast.Action>Skip</Toast.Action>
    <Toast.Action>View log</Toast.Action>
    <Toast.Action>Details</Toast.Action>
    <Toast.Action>Dismiss</Toast.Action>
  </>
);

type KitchenSinkToastProps = Omit<Partial<ToastProps>, "children"> & {
  title?: string;
  body?: string;
  actions?: React.ReactNode;
};

/** The full toast — icon, title, body, and an action row. */
const KitchenSinkToast = ({
  title = "Entity type published",
  body = "Version 3 of the Person type is now live.",
  tone = "neutral",
  actions = demoActions,
  ...toastProps
}: KitchenSinkToastProps) => (
  <Toast tone={tone} {...toastProps}>
    <Toast.Title title={title} />
    <Toast.Body>{body}</Toast.Body>
    <Toast.Actions actions={actions} />
  </Toast>
);

/* ------------------------------------------------------------------ */
/* Default: every composition, rendered directly into the page layout  */
/* ------------------------------------------------------------------ */

/**
 * Neutralizes the toast region's viewport-anchored chrome so a cell's toast
 * renders in the page flow: the region portals into this cell (via
 * `PortalContainerContext`) and the inline `position: fixed` / `absolute`
 * placement styles zag writes are overridden. The ghost divs exist for
 * pointer-exit tracking in real regions and would cover the page here.
 */
const inlineToastRegion = css({
  "& [data-scope=toast][data-part=shell]": {
    position: "[static !important]",
    transform: "[none !important]",
    overflow: "[visible !important]",
  },
  "& [data-scope=toast][data-part=shell]::after": {
    display: "[none !important]",
  },
  "& [data-scope=toast][data-part=group]": {
    position: "[static !important]",
    alignItems: "[flex-start !important]",
  },
  "& [data-scope=toast][data-part=root]": {
    position: "[static !important]",
  },
  "& [data-scope=toast] [data-ghost]": {
    display: "[none !important]",
  },
});

/** A self-contained inline Toaster: one gallery cell per toast. */
const InlineToast = ({ children }: { children: React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainer(node);
  }, []);

  return (
    <div ref={attachContainer} className={inlineToastRegion}>
      {container ? (
        <PortalContainerContext.Provider value={containerRef}>
          <Toaster>{children}</Toaster>
        </PortalContainerContext.Provider>
      ) : null}
    </div>
  );
};

const gallery = css({
  display: "flex",
  flexDirection: "column",
  gap: "[32px]",
});

const sectionHeading = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.body",
  marginBottom: "[12px]",
});

const cellRow = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: "[16px]",
});

const variantColumn = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
  flex: "[0 1 360px]",
  minWidth: "0",
});

const exampleLabel = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.muted",
  marginBottom: "1.5",
  textTransform: "capitalize",
});

const Example = ({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className={exampleLabel}>{name}</div>
    <InlineToast>{children}</InlineToast>
  </div>
);

// Edge-to-edge custom content for the `withPadding={false}` example.
const customStripe = css({
  height: "[56px]",
  borderTopRadius: "[calc(token(radii.xl) - 1px)]",
  background:
    "[linear-gradient(135deg, var(--colors-blue-s90), var(--colors-purple-s90))]",
});

const customBody = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  padding: "[12px]",
});

const customTitle = css({
  fontWeight: "semibold",
  color: "fg.heading",
});

const customDescription = css({
  color: "fg.muted",
});

const titlePart = (
  <Toast.Title
    title="Entity type published"
    icon={{ iconName: "circleCheck" }}
  />
);
const bodyPart = (
  <Toast.Body>Version 3 of the Person type is now live.</Toast.Body>
);
const actionsPart = <Toast.Actions actions={demoActions} />;

/**
 * Every composition, rendered directly into the page: the title/body/actions
 * combinations, the full toast for each tone × variant, and `withPadding`
 * disabled. All toasts are persistent, so the story is stable for visual
 * snapshots.
 */
export const Default: Story = {
  render: () => (
    <div className={gallery}>
      <section>
        <div className={sectionHeading}>Content combinations</div>
        <div className={cellRow}>
          <Example name="Title (no icon)">
            <Toast duration={Infinity}>
              <Toast.Title title="Entity type published" icon={false} />
            </Toast>
          </Example>
          <Example name="Title + icon">
            <Toast duration={Infinity}>{titlePart}</Toast>
          </Example>
          <Example name="Title + loading">
            <Toast duration={Infinity}>
              <Toast.Title title="Uploading entity types…" loading />
            </Toast>
          </Example>
          <Example name="Body">
            <Toast duration={Infinity}>{bodyPart}</Toast>
          </Example>
          <Example name="Title + body">
            <Toast duration={Infinity}>
              {titlePart}
              {bodyPart}
            </Toast>
          </Example>
          <Example name="Title + actions">
            <Toast duration={Infinity}>
              {titlePart}
              {actionsPart}
            </Toast>
          </Example>
          <Example name="Body + actions">
            <Toast duration={Infinity}>
              {bodyPart}
              {actionsPart}
            </Toast>
          </Example>
          <Example name="Title + body + actions">
            <Toast duration={Infinity}>
              {titlePart}
              {bodyPart}
              {actionsPart}
            </Toast>
          </Example>
        </div>
      </section>

      <section>
        <div className={sectionHeading}>Tone × variant</div>
        <div className={cellRow}>
          {toastVariants.map((variant) => (
            <div key={variant} className={variantColumn}>
              <div className={sectionHeading}>{variant}</div>
              {toastTones.map((tone) => (
                <Example key={tone} name={tone}>
                  <KitchenSinkToast
                    tone={tone}
                    variant={variant}
                    duration={Infinity}
                  />
                </Example>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className={sectionHeading}>Without padding</div>
        <div className={cellRow}>
          <Example name="Custom children">
            <Toast withPadding={false} shouldCloseOn="none" duration={Infinity}>
              {({ close }) => (
                <div>
                  <div className={customStripe} />
                  <div className={customBody}>
                    <div className={customTitle}>Fresh coat of paint</div>
                    <div className={customDescription}>
                      Fully custom children — the toast only provides the card.
                    </div>
                    <Button size="xs" variant="subtle" onClick={close}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </Toast>
          </Example>
        </div>
      </section>

      <section>
        <div className={sectionHeading}>Custom max width</div>
        <div className={cellRow}>
          <Example name="Wide (up to 480px)">
            <KitchenSinkToast
              body={maxWidthDemoBody}
              className={css({ "--toast-max-width": "[480px]" })}
              duration={Infinity}
            />
          </Example>
          <Example name="Narrow (up to 240px)">
            <KitchenSinkToast
              body={maxWidthDemoBody}
              className={css({ "--toast-max-width": "[240px]" })}
              duration={Infinity}
            />
          </Example>
        </div>
      </section>

      <section>
        <div className={sectionHeading}>Layout</div>
        <div className={cellRow}>
          <Example name="Auto">
            <Toast duration={Infinity}>
              <Toast.Title title="This document is read-only." />
              <Toast.Actions
                actions={<Toast.Action>Make a local copy</Toast.Action>}
              />
            </Toast>
          </Example>
          <Example name="Single line">
            <Toast layout="singleLine" duration={Infinity}>
              <Toast.Title title="This document is read-only." />
              <Toast.Actions
                actions={<Toast.Action>Make a local copy</Toast.Action>}
              />
            </Toast>
          </Example>
          <Example name="Single line, title + body + actions">
            <KitchenSinkToast layout="singleLine" duration={Infinity} />
          </Example>
          <Example name="Single line, long title">
            <Toast layout="singleLine" duration={Infinity}>
              <Toast.Title title="Deployment preview_build_artifact_bundle_7f3c9d2e unavailable" />
              <Toast.Actions
                actions={
                  <>
                    <Toast.Action>Retry</Toast.Action>
                    <Toast.Action>View log</Toast.Action>
                  </>
                }
              />
            </Toast>
          </Example>
        </div>
      </section>

      <section>
        <div className={sectionHeading}>Overflowing</div>
        <div className={cellRow}>
          <Example name="Title + body + actions">
            <Toast tone="error" duration={Infinity}>
              <Toast.Title title="Import failed for EmploymentContractAmendmentSynchronizationConfiguration" />
              <Toast.Body>
                The property
                ORGANIZATION_MEMBERSHIP_ROLE_ASSIGNMENT_CONSTRAINT_VIOLATION
                exceeded the allowed nesting depth.
              </Toast.Body>
              <Toast.Actions actions={manyActions} />
            </Toast>
          </Example>
          <Example name="Title + actions">
            <Toast duration={Infinity}>
              <Toast.Title title="Deployment preview_build_artifact_bundle_7f3c9d2e8a1b4f6c_linux_arm64 unavailable" />
              <Toast.Actions actions={manyActions} />
            </Toast>
          </Example>
        </div>
      </section>
    </div>
  ),
};

/* ------------------------------------------------------------------ */
/* Interactive: buttons that create a toast                            */
/* ------------------------------------------------------------------ */

const positions = [
  "top-start",
  "top",
  "top-end",
  "bottom-start",
  "bottom",
  "bottom-end",
] as const satisfies readonly Position[];

const buttonColumn = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
});

const buttonRow = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
});

const rowLabel = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.muted",
  width: "[72px]",
});

type QueuedToast = {
  key: number;
  title: string;
  body: string;
  actions?: React.ReactNode;
  /** Renders a placeholder of this size in place of the title and body. */
  size?: { width: number; height: number };
  options: Partial<Pick<ToastProps, "position" | "shouldCloseOn" | "duration">>;
};

// Raises the width cap so the wider random sizes fit.
const widerToastCap = css({
  "--toast-max-width": "[600px]",
});

const sizePlaceholder = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  maxWidth: "full",
  borderWidth: "1px",
  borderStyle: "dashed",
  borderColor: "colorPalette.bd.solid",
  borderRadius: "md",
  textStyle: "sm",
  color: "var(--toast-text-color)",
  fontVariantNumeric: "tabular-nums",
});

const randomBetween = (min: number, max: number) =>
  min + Math.round((Math.random() * (max - min)) / 4) * 4;

const InteractiveDemo = () => {
  const [queued, setQueued] = useState<QueuedToast[]>([]);
  const nextKeyRef = useRef(0);

  const fire = (toast: Omit<QueuedToast, "key">) => {
    nextKeyRef.current += 1;
    // Captured eagerly: the updater runs later, when batched fires would all
    // read the same final ref value.
    const key = nextKeyRef.current;
    setQueued((previous) => [...previous, { ...toast, key }]);
  };

  const removeToast = (key: number) => {
    setQueued((previous) => previous.filter((toast) => toast.key !== key));
  };

  return (
    <div className={buttonColumn}>
      <div className={buttonRow}>
        <span className={rowLabel}>Position</span>
        {positions.map((position) => (
          <Button
            key={position}
            size="xs"
            onClick={() =>
              fire({
                title: `Placed ${position}`,
                body: "Toasts sharing a position share a stack.",
                options: { position },
              })
            }
          >
            {position}
          </Button>
        ))}
      </div>
      <div className={buttonRow}>
        <span className={rowLabel}>Closes on</span>
        <Button
          size="xs"
          onClick={() =>
            fire({
              title: "Closes on its close button",
              body: "Escape dismisses it too while focused.",
              options: { shouldCloseOn: "closeButton" },
            })
          }
        >
          closeButton
        </Button>
        <Button
          size="xs"
          onClick={() =>
            fire({
              title: "No close button",
              body: "Escape does nothing; gone after its 5s duration.",
              options: { shouldCloseOn: "none" },
            })
          }
        >
          none
        </Button>
      </div>
      <div className={buttonRow}>
        <span className={rowLabel}>Actions</span>
        <Button
          size="xs"
          onClick={() =>
            fire({
              title: "Draft archived",
              body: "Undo closes the toast; Details leaves it open.",
              actions: (
                <>
                  <Toast.Action closeToast>Undo</Toast.Action>
                  <Toast.Action>Details</Toast.Action>
                </>
              ),
              options: { duration: Infinity },
            })
          }
        >
          closeToast
        </Button>
        <Button
          size="xs"
          onClick={() =>
            fire({
              title: "Draft archived",
              body: "Undo pends for 1.5s, then closes; Fail pends and stays. Pending holds off the 5s expiry.",
              actions: (
                <>
                  <Toast.Action
                    closeToast
                    onClick={() =>
                      new Promise((resolve) => {
                        setTimeout(resolve, 1500);
                      })
                    }
                  >
                    Undo
                  </Toast.Action>
                  <Toast.Action
                    closeToast
                    onClick={() =>
                      new Promise((_resolve, reject) => {
                        setTimeout(reject, 1500);
                      })
                    }
                  >
                    Fail
                  </Toast.Action>
                </>
              ),
              options: { duration: 5000 },
            })
          }
        >
          async closeToast
        </Button>
      </div>
      <div className={buttonRow}>
        <span className={rowLabel}>Size</span>
        <Button
          size="xs"
          onClick={() =>
            fire({
              title: "",
              body: "",
              size: {
                width: randomBetween(40, 520),
                height: randomBetween(24, 200),
              },
              options: { duration: 10000 },
            })
          }
        >
          Random size
        </Button>
      </div>
      <div className={buttonRow}>
        <span className={rowLabel}>Duration</span>
        <Button
          size="xs"
          onClick={() =>
            fire({
              title: "Lives for 10 seconds",
              body: "Hovering the stack pauses the timer.",
              options: { duration: 10000 },
            })
          }
        >
          10 seconds
        </Button>
        <Button
          size="xs"
          onClick={() =>
            fire({
              title: "Stays until dismissed",
              body: "Click the close button to dismiss it.",
              options: { duration: Infinity },
            })
          }
        >
          Infinite
        </Button>
      </div>
      {queued.map(
        ({
          key,
          title: toastTitle,
          body: toastBody,
          actions,
          size,
          options,
        }) => {
          const onStatusChange: ToastProps["onStatusChange"] = ({ status }) => {
            if (status === "exit") {
              removeToast(key);
            }
          };
          return size ? (
            <Toast
              key={key}
              tone="brand"
              className={widerToastCap}
              {...options}
              onStatusChange={onStatusChange}
            >
              <div className={sizePlaceholder} style={size}>
                {size.width} × {size.height}
              </div>
            </Toast>
          ) : (
            <KitchenSinkToast
              key={key}
              tone="brand"
              title={toastTitle}
              body={toastBody}
              actions={actions}
              {...options}
              onStatusChange={onStatusChange}
            />
          );
        },
      )}
    </div>
  );
};

/**
 * The lifecycle options, each fired from a button into the real
 * viewport-anchored regions: placement, dismissal affordances, duration, and
 * stacking toasts of random sizes.
 */
export const Interactive: Story = {
  render: () => (
    <Toaster>
      <InteractiveDemo />
    </Toaster>
  ),
};
