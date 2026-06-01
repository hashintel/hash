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
  dialogProps: (close: () => void) => React.ComponentProps<typeof Dialog>;
};

const DialogExample = ({ buttonLabel, dialogProps }: ExampleProps) => {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>{buttonLabel}</Button>
      {open ? <Dialog {...dialogProps(close)} onClose={close} /> : null}
    </>
  );
};

const stackStyles = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "3",
  alignItems: "flex-start",
});

export const Examples: Story = () => (
  <div className={stackStyles}>
    <DialogExample
      buttonLabel="Title only"
      dialogProps={() => ({
        title: "Account settings",
        children: sampleBody,
      })}
    />

    <DialogExample
      buttonLabel="Title + icon"
      dialogProps={() => ({
        title: "Settings",
        titleIconName: "gear",
        children: sampleBody,
      })}
    />

    <DialogExample
      buttonLabel="Footer actions"
      dialogProps={(close) => ({
        children: (
          <p>
            Do you want to save your changes before closing? Select close to go
            back.
          </p>
        ),
        footerActions: (
          <>
            <Button variant="subtle" tone="neutral" onClick={close}>
              Close
            </Button>
            <Button variant="solid" tone="brand" onClick={close}>
              Save
            </Button>
          </>
        ),
      })}
    />

    <DialogExample
      buttonLabel="Kitchen sink"
      dialogProps={(close) => ({
        title: "Edit workspace",
        titleIconName: "gear",
        description: "Update the details for your workspace.",
        titleActions: (
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconName="externalLink"
            tooltip="Open docs"
          />
        ),
        children: sampleBody,
        footerActions: (
          <Button variant="solid" tone="brand" onClick={close}>
            Save changes
          </Button>
        ),
        footerSecondaryActions: (
          <Button variant="subtle" tone="error" onClick={close}>
            Delete
          </Button>
        ),
      })}
    />

    <DialogExample
      buttonLabel="Custom header"
      dialogProps={() => ({
        header: (
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
        ),
        children: sampleBody,
      })}
    />

    <DialogExample
      buttonLabel="Custom footer"
      dialogProps={(close) => ({
        title: "Custom footer",
        children: sampleBody,
        footer: (
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
        ),
      })}
    />

    <DialogExample
      buttonLabel="Kitchen sink (no padding)"
      dialogProps={(close) => ({
        title: "Edit workspace",
        titleIconName: "gear",
        description: "Body content controls its own padding.",
        withPadding: false,
        children: (
          <p>
            This body container has zero padding from the dialog, so it spans
            edge-to-edge. The content within decides its own layout.
          </p>
        ),
        footerActions: (
          <Button variant="solid" tone="brand" onClick={close}>
            Save
          </Button>
        ),
        footerSecondaryActions: (
          <Button variant="subtle" tone="neutral" onClick={close}>
            Cancel
          </Button>
        ),
      })}
    />
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

const buildKitchenSink = (
  size: DialogSize,
  close: () => void,
  options?: { loading?: boolean },
): React.ComponentProps<typeof Dialog> => ({
  size,
  loading: options?.loading,
  title: `Kitchen sink (${size})`,
  titleIconName: "gear",
  description: "All the bells and whistles, sized for this width.",
  titleActions: (
    <Button
      variant="ghost"
      tone="neutral"
      size="sm"
      iconName="externalLink"
      tooltip="Open docs"
    />
  ),
  children: size === "fullScreen" ? longBody : sampleBody,
  footerActions: (
    <Button variant="solid" tone="brand" onClick={close}>
      Save changes
    </Button>
  ),
  footerSecondaryActions: (
    <Button variant="subtle" tone="error" onClick={close}>
      Delete
    </Button>
  ),
});

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
          dialogProps={(close) => buildKitchenSink(size, close)}
        />
        <DialogExample
          buttonLabel={`Loading — ${size}`}
          dialogProps={(close) =>
            buildKitchenSink(size, close, { loading: true })
          }
        />
        {size === "xs" ? (
          <>
            <DialogExample
              buttonLabel={`No header — ${size}`}
              dialogProps={() => ({
                size,
                children: sampleBody,
              })}
            />
            <DialogExample
              buttonLabel={`No header, no padding — ${size}`}
              dialogProps={() => ({
                size,
                withPadding: false,
                children: sampleBody,
              })}
            />
          </>
        ) : null}
      </div>
    ))}
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

const buildOverflowKitchenSink = (
  close: () => void,
  options?: { loading?: boolean },
): React.ComponentProps<typeof Dialog> => ({
  loading: options?.loading,
  title: overflowingTitle,
  titleIconName: "gear",
  description: overflowingDescription,
  titleActions: (
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
  ),
  children: overflowingBody,
  footerActions: (
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
  ),
  footerSecondaryActions: (
    <Button variant="subtle" tone="error" onClick={close}>
      Delete this workspace permanently
    </Button>
  ),
});

const buildOverflowCustom = (
  close: () => void,
  options?: { loading?: boolean },
): React.ComponentProps<typeof Dialog> => ({
  loading: options?.loading,
  header: (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "2",
        width: "[100%]",
      })}
    >
      <div className={css({ fontWeight: "semibold", textStyle: "lg" })}>
        A custom header with significant content that should test how arbitrary
        header content wraps and lays out
      </div>
      <div className={css({ color: "fg.muted", textStyle: "sm" })}>
        Plus a fairly long subtitle so we can validate multi-line wrapping
        behaviour within a custom header slot.
      </div>
    </div>
  ),
  children: overflowingBody,
  footer: (
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
  ),
});

const buildOverflowBodyOnly = (options?: {
  loading?: boolean;
}): React.ComponentProps<typeof Dialog> => ({
  loading: options?.loading,
  children: overflowingBody,
});

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
          dialogProps={(close) => buildOverflowKitchenSink(close, { loading })}
        />
        <DialogExample
          buttonLabel={`Custom header + footer${loading ? " — loading" : ""}`}
          dialogProps={(close) => buildOverflowCustom(close, { loading })}
        />
        <DialogExample
          buttonLabel={`No header + footer${loading ? " — loading" : ""}`}
          dialogProps={() => buildOverflowBodyOnly({ loading })}
        />
      </div>
    ))}
  </div>
);

export const ShouldCloseOn: Story = () => (
  <div className={stackStyles}>
    <DialogExample
      buttonLabel="closeButtonAndOverlay (default)"
      dialogProps={(close) => ({
        title: "Close button and overlay",
        titleIconName: "info",
        description:
          "Escape, the close button, and clicking the overlay all close the dialog.",
        shouldCloseOn: "closeButtonAndOverlay",
        children: sampleBody,
        footerActions: (
          <Button variant="solid" tone="brand" onClick={close}>
            Done
          </Button>
        ),
      })}
    />

    <DialogExample
      buttonLabel="closeButton"
      dialogProps={(close) => ({
        title: "Close button only",
        titleIconName: "info",
        description:
          "Escape and the close button close the dialog. Overlay clicks do not.",
        shouldCloseOn: "closeButton",
        children: sampleBody,
        footerActions: (
          <Button variant="solid" tone="brand" onClick={close}>
            Done
          </Button>
        ),
      })}
    />

    <DialogExample
      buttonLabel="none"
      dialogProps={(close) => ({
        title: "No default close",
        titleIconName: "info",
        description:
          "No close button is rendered, and neither escape nor overlay clicks close the dialog.",
        shouldCloseOn: "none",
        children: sampleBody,
        footerActions: (
          <Button variant="solid" tone="brand" onClick={close}>
            Done
          </Button>
        ),
      })}
    />
  </div>
);
