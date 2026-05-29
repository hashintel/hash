import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../Button/button";
import { Icon } from "../Icon/icon";
import { Dialog, type DialogProps, type DialogSize } from "./dialog";

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
  dialogProps: (close: () => void) => DialogProps;
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
        title: "Save changes",
        children: <p>Do you want to save your changes before closing?</p>,
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
        actions: (
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
          <div
            className={css({
              background: "neutral.a20",
              padding: "6",
              width: "[100%]",
            })}
          >
            <p>
              This body container has zero padding from the dialog, so it spans
              edge-to-edge. The content within decides its own layout.
            </p>
          </div>
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
): DialogProps => ({
  size,
  loading: options?.loading,
  title: `Kitchen sink (${size})`,
  titleIconName: "gear",
  description: "All the bells and whistles, sized for this width.",
  actions: (
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
      </div>
    ))}
  </div>
);

export const DisableDefaultClose: Story = () => (
  <DialogExample
    buttonLabel="Open dialog (no default close)"
    dialogProps={(close) => ({
      title: "No default close button",
      titleIconName: "info",
      description:
        "The X button in the corner is hidden — close via the footer or by pressing escape.",
      disableDefaultClose: true,
      children: sampleBody,
      footerActions: (
        <Button variant="solid" tone="brand" onClick={close}>
          Done
        </Button>
      ),
    })}
  />
);
