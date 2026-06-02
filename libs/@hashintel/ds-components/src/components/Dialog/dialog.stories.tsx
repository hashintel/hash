import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../Button/button";
import { Icon } from "../Icon/icon";
import { Dialog, type DialogSize } from "./dialog";

import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/Dialog",
} satisfies StoryDefault;

const sampleBody = (
  <p>
    The body of the dialog can contain any content you like — forms,
    descriptions, lists, or rich text. It scrolls independently of the header
    and footer.
  </p>
);

const longBody = (
  <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
    {Array.from({ length: 6 }).map((_, index) => (
      // eslint-disable-next-line react/no-array-index-key
      <p key={index}>
        Paragraph {index + 1}. Lorem ipsum dolor sit amet, consectetur
        adipiscing elit. Donec efficitur, nisl sed eleifend dictum, ipsum nisi
        rhoncus odio, et fringilla justo lectus ac neque.
      </p>
    ))}
  </div>
);

type ExampleProps = {
  buttonLabel: string;
  renderDialog: (close: () => void) => React.ReactElement;
};

const DialogExample = ({ buttonLabel, renderDialog }: ExampleProps) => {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>{buttonLabel}</Button>
      {open ? renderDialog(close) : null}
    </>
  );
};

const stackStyles = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "3",
  alignItems: "flex-start",
});

type DialogVariant = "partitionedFooter" | "plain";

const buildExampleEntries = (variant: DialogVariant): ExampleProps[] => [
  {
    buttonLabel: "Title only",
    renderDialog: (close) => (
      <Dialog variant={variant} onClose={close}>
        <Dialog.Header title="Account settings" />
        <Dialog.Body>{sampleBody}</Dialog.Body>
      </Dialog>
    ),
  },
  {
    buttonLabel: "Title + icon",
    renderDialog: (close) => (
      <Dialog variant={variant} onClose={close}>
        <Dialog.Header title="Settings" iconName="gear" />
        <Dialog.Body>{sampleBody}</Dialog.Body>
      </Dialog>
    ),
  },
  {
    buttonLabel: "Description only",
    renderDialog: (close) => (
      <Dialog variant={variant} onClose={close}>
        <Dialog.Header description="A description without a title, written long enough that it wraps onto a second line so we can check how the header lays out when only the subtext is present." />
        <Dialog.Body>{sampleBody}</Dialog.Body>
      </Dialog>
    ),
  },
  {
    buttonLabel: "Footer actions",
    renderDialog: (close) => (
      <Dialog variant={variant} onClose={close}>
        <Dialog.Body>
          <p>
            Do you want to save your changes before closing? Select close to go
            back.
          </p>
        </Dialog.Body>
        <Dialog.Footer
          actions={
            <>
              <Button variant="subtle" tone="neutral" onClick={close}>
                Close
              </Button>
              <Button variant="solid" tone="brand" onClick={close}>
                Save
              </Button>
            </>
          }
        />
      </Dialog>
    ),
  },
  {
    buttonLabel: "Kitchen sink",
    renderDialog: (close) => (
      <Dialog variant={variant} onClose={close}>
        <Dialog.Header
          title="Edit workspace"
          iconName="gear"
          description="Update the details for your workspace."
          actions={
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              iconName="externalLink"
              tooltip="Open docs"
            />
          }
        />
        <Dialog.Body>{sampleBody}</Dialog.Body>
        <Dialog.Footer
          actions={
            <Button variant="solid" tone="brand" onClick={close}>
              Save changes
            </Button>
          }
          secondaryActions={
            <Button variant="subtle" tone="error" onClick={close}>
              Delete
            </Button>
          }
        />
      </Dialog>
    ),
  },
  {
    buttonLabel: "Custom header",
    renderDialog: (close) => (
      <Dialog variant={variant} onClose={close}>
        <Dialog.Header>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "3",
              width: "[100%]",
            })}
          >
            <div
              className={css({
                width: "10",
                height: "10",
                borderRadius: "full",
                background: "blue.s90",
                color: "fg.onSolid",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Icon name="sparkles" size="md" />
            </div>
            <div>
              <div className={css({ fontWeight: "semibold", textStyle: "lg" })}>
                Custom header layout
              </div>
              <div className={css({ color: "fg.muted", textStyle: "sm" })}>
                Built from arbitrary content.
              </div>
            </div>
          </div>
        </Dialog.Header>
        <Dialog.Body>{sampleBody}</Dialog.Body>
      </Dialog>
    ),
  },
  {
    buttonLabel: "Custom footer",
    renderDialog: (close) => (
      <Dialog variant={variant} onClose={close}>
        <Dialog.Header title="Custom footer" />
        <Dialog.Body>{sampleBody}</Dialog.Body>
        <Dialog.Footer>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "3",
              width: "[100%]",
            })}
          >
            <Icon
              name="info"
              size="sm"
              className={css({ color: "fg.muted" })}
            />
            <span className={css({ color: "fg.muted", textStyle: "sm" })}>
              All changes are saved automatically.
            </span>
            <Button
              className={css({ marginLeft: "auto" })}
              variant="solid"
              tone="neutral"
              onClick={close}
            >
              Done
            </Button>
          </div>
        </Dialog.Footer>
      </Dialog>
    ),
  },
  {
    buttonLabel: "Kitchen sink (no padding)",
    renderDialog: (close) => (
      <Dialog variant={variant} onClose={close}>
        <Dialog.Header
          title="Edit workspace"
          iconName="gear"
          description="Body content controls its own padding."
        />
        <Dialog.Body withPadding={false}>
          <p>
            This body container has zero padding from the dialog, so it spans
            edge-to-edge. The content within decides its own layout.
          </p>
        </Dialog.Body>
        <Dialog.Footer
          actions={
            <Button variant="solid" tone="brand" onClick={close}>
              Save
            </Button>
          }
          secondaryActions={
            <Button variant="subtle" tone="neutral" onClick={close}>
              Cancel
            </Button>
          }
        />
      </Dialog>
    ),
  },
];

export const Examples: Story = () => (
  <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
    {(["partitionedFooter", "plain"] as const).map((variant) => (
      <div
        key={variant}
        className={css({
          display: "flex",
          gap: "3",
          alignItems: "center",
          flexWrap: "wrap",
        })}
      >
        <div className={css({ minWidth: "[8rem]", fontWeight: "medium" })}>
          {variant}
        </div>
        {buildExampleEntries(variant).map((entry) => (
          <DialogExample
            key={entry.buttonLabel}
            buttonLabel={entry.buttonLabel}
            renderDialog={entry.renderDialog}
          />
        ))}
      </div>
    ))}
  </div>
);

const sizes = [
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "fullScreen",
] as const satisfies readonly DialogSize[];

const renderKitchenSink = (
  size: DialogSize,
  close: () => void,
  options?: { loading?: boolean },
) => (
  <Dialog size={size} loading={options?.loading} onClose={close}>
    <Dialog.Header
      title={`Kitchen sink (${size})`}
      iconName="gear"
      description="All the bells and whistles, sized for this width."
      actions={
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          iconName="externalLink"
          tooltip="Open docs"
        />
      }
    />
    <Dialog.Body>{size === "fullScreen" ? longBody : sampleBody}</Dialog.Body>
    <Dialog.Footer
      actions={
        <Button variant="solid" tone="brand" onClick={close}>
          Save changes
        </Button>
      }
      secondaryActions={
        <Button variant="subtle" tone="error" onClick={close}>
          Delete
        </Button>
      }
    />
  </Dialog>
);

export const Sizes: Story = () => (
  <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
    {sizes.map((size) => (
      <div
        key={size}
        className={css({
          display: "flex",
          gap: "3",
          alignItems: "center",
          flexWrap: "wrap",
        })}
      >
        <div className={css({ minWidth: "[6rem]", fontWeight: "medium" })}>
          {size}
        </div>
        <DialogExample
          buttonLabel={`Kitchen sink — ${size}`}
          renderDialog={(close) => renderKitchenSink(size, close)}
        />
        <DialogExample
          buttonLabel={`Loading — ${size}`}
          renderDialog={(close) =>
            renderKitchenSink(size, close, { loading: true })
          }
        />
        {size === "xs" ? (
          <>
            <DialogExample
              buttonLabel={`No header — ${size}`}
              renderDialog={(close) => (
                <Dialog size={size} onClose={close}>
                  <Dialog.Body>{sampleBody}</Dialog.Body>
                </Dialog>
              )}
            />
            <DialogExample
              buttonLabel={`No header, no padding — ${size}`}
              renderDialog={(close) => (
                <Dialog size={size} onClose={close}>
                  <Dialog.Body withPadding={false}>{sampleBody}</Dialog.Body>
                </Dialog>
              )}
            />
          </>
        ) : null}
      </div>
    ))}
    <div
      className={css({
        display: "flex",
        gap: "3",
        alignItems: "center",
        flexWrap: "wrap",
      })}
    >
      <div className={css({ minWidth: "[6rem]", fontWeight: "medium" })}>
        custom
      </div>
      <DialogExample
        buttonLabel="Custom width (480px)"
        renderDialog={(close) => (
          <Dialog className={css({ maxWidth: "[480px]" })} onClose={close}>
            <Dialog.Header
              title="Custom width (480px)"
              description="maxWidth is overridden via className."
            />
            <Dialog.Body>{sampleBody}</Dialog.Body>
            <Dialog.Footer
              actions={
                <Button variant="solid" tone="brand" onClick={close}>
                  Save changes
                </Button>
              }
            />
          </Dialog>
        )}
      />
    </div>
  </div>
);

const overflowingTitle =
  "A really, really long title that probably wraps onto multiple lines and helps verify how the header handles wrapped text without breaking the layout";

const overflowingDescription =
  "And the description gets a similarly verbose treatment so we can verify the header subtext also handles wrapping across multiple lines, especially when paired with a long title and a row of title actions.";

const overflowingBody = (
  <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
    {Array.from({ length: 20 }).map((_, index) => (
      // eslint-disable-next-line react/no-array-index-key
      <p key={index}>
        Paragraph {index + 1}. Lorem ipsum dolor sit amet, consectetur
        adipiscing elit. Donec efficitur, nisl sed eleifend dictum, ipsum nisi
        rhoncus odio, et fringilla justo lectus ac neque.
      </p>
    ))}
  </div>
);

const renderOverflowKitchenSink = (
  close: () => void,
  options?: { loading?: boolean },
) => (
  <Dialog loading={options?.loading} onClose={close}>
    <Dialog.Header
      title={overflowingTitle}
      iconName="gear"
      description={overflowingDescription}
      actions={
        <>
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconName="externalLink"
            tooltip="Open docs"
          />
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconName="info"
            tooltip="More info"
          />
        </>
      }
    />
    <Dialog.Body>{overflowingBody}</Dialog.Body>
    <Dialog.Footer
      actions={
        <>
          <Button variant="solid" tone="brand" onClick={close}>
            Save these long-form changes for later review
          </Button>
          <Button variant="solid" tone="brand" onClick={close}>
            Done
          </Button>
          <Button variant="solid" tone="brand" onClick={close}>
            Done
          </Button>
        </>
      }
      secondaryActions={
        <Button variant="subtle" tone="error" onClick={close}>
          Delete this workspace permanently
        </Button>
      }
    />
  </Dialog>
);

const renderOverflowCustom = (
  close: () => void,
  options?: { loading?: boolean },
) => (
  <Dialog loading={options?.loading} onClose={close}>
    <Dialog.Header>
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "2",
          width: "[100%]",
        })}
      >
        <div className={css({ fontWeight: "semibold", textStyle: "lg" })}>
          A custom header with significant content that should test how
          arbitrary header content wraps and lays out
        </div>
        <div className={css({ color: "fg.muted", textStyle: "sm" })}>
          Plus a fairly long subtitle so we can validate multi-line wrapping
          behaviour within a custom header slot.
        </div>
      </div>
    </Dialog.Header>
    <Dialog.Body>{overflowingBody}</Dialog.Body>
    <Dialog.Footer>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "3",
          width: "[100%]",
          flexWrap: "wrap",
        })}
      >
        <span className={css({ color: "fg.muted", textStyle: "sm" })}>
          A custom footer with a long status message to test wrapping behaviour
          and layout adjustments under content pressure.
        </span>
        <Button
          className={css({ marginLeft: "auto" })}
          variant="solid"
          tone="neutral"
          onClick={close}
        >
          Done
        </Button>
      </div>
    </Dialog.Footer>
  </Dialog>
);

const renderOverflowBodyOnly = (
  close: () => void,
  options?: { loading?: boolean },
) => (
  <Dialog loading={options?.loading} onClose={close}>
    <Dialog.Body>{overflowingBody}</Dialog.Body>
  </Dialog>
);

export const Overflow: Story = () => (
  <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
    {([false, true] as const).map((loading) => (
      <div
        key={String(loading)}
        className={css({
          display: "flex",
          gap: "3",
          alignItems: "center",
          flexWrap: "wrap",
        })}
      >
        <div className={css({ minWidth: "[6rem]", fontWeight: "medium" })}>
          {loading ? "loading" : "default"}
        </div>
        <DialogExample
          buttonLabel={`Kitchen sink${loading ? " — loading" : ""}`}
          renderDialog={(close) =>
            renderOverflowKitchenSink(close, { loading })
          }
        />
        <DialogExample
          buttonLabel={`Custom header + footer${loading ? " — loading" : ""}`}
          renderDialog={(close) => renderOverflowCustom(close, { loading })}
        />
        <DialogExample
          buttonLabel={`No header + footer${loading ? " — loading" : ""}`}
          renderDialog={(close) => renderOverflowBodyOnly(close, { loading })}
        />
      </div>
    ))}
  </div>
);

const StackedDialogs = () => {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  const [third, setThird] = useState(false);
  const [fourth, setFourth] = useState(false);

  return (
    <>
      <Button onClick={() => setFirst(true)}>Open stacked dialogs</Button>
      {first ? (
        <Dialog size="md" onClose={() => setFirst(false)}>
          <Dialog.Header
            title="First dialog"
            iconName="gear"
            description="Open the next dialog to stack another on top."
          />
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button
                variant="solid"
                tone="brand"
                onClick={() => setSecond(true)}
              >
                Open second dialog
              </Button>
            }
          />
        </Dialog>
      ) : null}
      {second ? (
        <Dialog size="md" onClose={() => setSecond(false)}>
          <Dialog.Header
            title="Second dialog"
            iconName="gear"
            description="Open the next dialog to stack a small dialog on top."
          />
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button
                variant="solid"
                tone="brand"
                onClick={() => setThird(true)}
              >
                Open small dialog
              </Button>
            }
          />
        </Dialog>
      ) : null}
      {third ? (
        <Dialog size="sm" onClose={() => setThird(false)}>
          <Dialog.Header
            title="Small dialog"
            iconName="info"
            description="Open another small dialog on top of this one."
          />
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button
                variant="solid"
                tone="brand"
                onClick={() => setFourth(true)}
              >
                Open another small dialog
              </Button>
            }
          />
        </Dialog>
      ) : null}
      {fourth ? (
        <Dialog size="sm" onClose={() => setFourth(false)}>
          <Dialog.Header
            title="Another small dialog"
            iconName="info"
            description="This is the top of the stack."
          />
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button
                variant="solid"
                tone="brand"
                onClick={() => setFourth(false)}
              >
                Done
              </Button>
            }
          />
        </Dialog>
      ) : null}
    </>
  );
};

export const Stacked: Story = () => <StackedDialogs />;

export const ShouldCloseOn: Story = () => (
  <div className={stackStyles}>
    <DialogExample
      buttonLabel="closeButtonAndOverlay (default)"
      renderDialog={(close) => (
        <Dialog shouldCloseOn="closeButtonAndOverlay" onClose={close}>
          <Dialog.Header
            title="Close button and overlay"
            iconName="info"
            description="Escape, the close button, and clicking the overlay all close the dialog."
          />
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={close}>
                Done
              </Button>
            }
          />
        </Dialog>
      )}
    />

    <DialogExample
      buttonLabel="closeButton"
      renderDialog={(close) => (
        <Dialog shouldCloseOn="closeButton" onClose={close}>
          <Dialog.Header
            title="Close button only"
            iconName="info"
            description="Escape and the close button close the dialog. Overlay clicks do not."
          />
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={close}>
                Done
              </Button>
            }
          />
        </Dialog>
      )}
    />

    <DialogExample
      buttonLabel="none"
      renderDialog={(close) => (
        <Dialog shouldCloseOn="none" onClose={close}>
          <Dialog.Header
            title="No default close"
            iconName="info"
            description="No close button is rendered, and neither escape nor overlay clicks close the dialog."
          />
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={close}>
                Done
              </Button>
            }
          />
        </Dialog>
      )}
    />

    <DialogExample
      buttonLabel="none + no header"
      renderDialog={(close) => (
        <Dialog shouldCloseOn="none" onClose={close}>
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={close}>
                Done
              </Button>
            }
          />
        </Dialog>
      )}
    />
  </div>
);
