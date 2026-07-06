import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Button } from "../Button/button";
import { Dialog } from "../Dialog/dialog";
import { Icon } from "../Icon/icon";
import { Drawer, type DrawerPosition, type DrawerSize } from "./drawer";

import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/Drawer",
} satisfies StoryDefault;

const sampleBody = (
  <p>
    The body of the drawer can contain any content you like — forms,
    descriptions, lists, or rich text. It scrolls independently of the header
    and footer.
  </p>
);

type ExampleProps = {
  buttonLabel: string;
  renderDrawer: (close: () => void) => React.ReactElement;
};

const DrawerExample = ({ buttonLabel, renderDrawer }: ExampleProps) => {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>{buttonLabel}</Button>
      {open ? renderDrawer(close) : null}
    </>
  );
};

const stackStyles = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "3",
  alignItems: "flex-start",
});

type DrawerVariant = "partitionedFooter" | "plain";

const buildExampleEntries = (variant: DrawerVariant): ExampleProps[] => [
  {
    buttonLabel: "Title only",
    renderDrawer: (close) => (
      <Drawer variant={variant} onClose={close}>
        <Drawer.Header title="Account settings" />
        <Drawer.Body>{sampleBody}</Drawer.Body>
      </Drawer>
    ),
  },
  {
    buttonLabel: "Title + icon",
    renderDrawer: (close) => (
      <Drawer variant={variant} onClose={close}>
        <Drawer.Header title="Settings" iconName="gear" />
        <Drawer.Body>{sampleBody}</Drawer.Body>
      </Drawer>
    ),
  },
  {
    buttonLabel: "Description only",
    renderDrawer: (close) => (
      <Drawer variant={variant} onClose={close}>
        <Drawer.Header description="A description without a title, written long enough that it wraps onto a second line so we can check how the header lays out when only the subtext is present." />
        <Drawer.Body>{sampleBody}</Drawer.Body>
      </Drawer>
    ),
  },
  {
    buttonLabel: "Footer actions",
    renderDrawer: (close) => (
      <Drawer variant={variant} onClose={close}>
        <Drawer.Body>
          <p>
            Do you want to save your changes before closing? Select close to go
            back.
          </p>
        </Drawer.Body>
        <Drawer.Footer
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
      </Drawer>
    ),
  },
  {
    buttonLabel: "Kitchen sink",
    renderDrawer: (close) => (
      <Drawer variant={variant} onClose={close}>
        <Drawer.Header
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
        <Drawer.Body>{sampleBody}</Drawer.Body>
        <Drawer.Footer
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
      </Drawer>
    ),
  },
  {
    buttonLabel: "Custom header",
    renderDrawer: (close) => (
      <Drawer variant={variant} onClose={close}>
        <Drawer.Header>
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
        </Drawer.Header>
        <Drawer.Body>{sampleBody}</Drawer.Body>
      </Drawer>
    ),
  },
  {
    buttonLabel: "Custom footer",
    renderDrawer: (close) => (
      <Drawer variant={variant} onClose={close}>
        <Drawer.Header title="Custom footer" />
        <Drawer.Body>{sampleBody}</Drawer.Body>
        <Drawer.Footer>
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
        </Drawer.Footer>
      </Drawer>
    ),
  },
  {
    buttonLabel: "Kitchen sink (no padding)",
    renderDrawer: (close) => (
      <Drawer variant={variant} onClose={close}>
        <Drawer.Header
          title="Edit workspace"
          iconName="gear"
          description="Body content controls its own padding."
        />
        <Drawer.Body withPadding={false}>
          <p>
            This body container has zero padding from the drawer, so it spans
            edge-to-edge. The content within decides its own layout.
          </p>
        </Drawer.Body>
        <Drawer.Footer
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
      </Drawer>
    ),
  },
  {
    buttonLabel: "No backdrop",
    renderDrawer: (close) => (
      <Drawer variant={variant} showBackdrop={false} onClose={close}>
        <Drawer.Header
          title="No backdrop"
          description="Rendered with showBackdrop={false}, so the page behind stays visible with no dimmed overlay."
        />
        <Drawer.Body>{sampleBody}</Drawer.Body>
      </Drawer>
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
          <DrawerExample
            key={entry.buttonLabel}
            buttonLabel={entry.buttonLabel}
            renderDrawer={entry.renderDrawer}
          />
        ))}
      </div>
    ))}
  </div>
);

const positions = [
  "left",
  "top",
  "right",
  "bottom",
] as const satisfies readonly DrawerPosition[];

export const Positions: Story = () => (
  <div className={stackStyles}>
    {positions.map((position) => (
      <DrawerExample
        key={position}
        buttonLabel={position}
        renderDrawer={(close) => (
          <Drawer position={position} onClose={close}>
            <Drawer.Header
              title={`${position} drawer`}
              iconName="gear"
              description={`Anchored to the ${position} edge of the viewport.`}
            />
            <Drawer.Body>{sampleBody}</Drawer.Body>
            <Drawer.Footer
              actions={
                <Button variant="solid" tone="brand" onClick={close}>
                  Done
                </Button>
              }
            />
          </Drawer>
        )}
      />
    ))}
  </div>
);

const sizes = ["sm", "md", "lg", "xl"] as const satisfies readonly DrawerSize[];

const renderKitchenSink = (
  size: DrawerSize,
  close: () => void,
  options?: { loading?: boolean },
) => (
  <Drawer size={size} loading={options?.loading} onClose={close}>
    <Drawer.Header
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
    <Drawer.Body>{sampleBody}</Drawer.Body>
    <Drawer.Footer
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
  </Drawer>
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
        <DrawerExample
          buttonLabel={`Kitchen sink — ${size}`}
          renderDrawer={(close) => renderKitchenSink(size, close)}
        />
        <DrawerExample
          buttonLabel={`Loading — ${size}`}
          renderDrawer={(close) =>
            renderKitchenSink(size, close, { loading: true })
          }
        />
        <DrawerExample
          buttonLabel={`Bottom — ${size}`}
          renderDrawer={(close) => (
            <Drawer size={size} position="bottom" onClose={close}>
              <Drawer.Header
                title={`Bottom drawer (${size})`}
                iconName="gear"
                description="Anchored to the bottom edge, sized for this height."
              />
              <Drawer.Body>{sampleBody}</Drawer.Body>
              <Drawer.Footer
                actions={
                  <Button variant="solid" tone="brand" onClick={close}>
                    Done
                  </Button>
                }
              />
            </Drawer>
          )}
        />
        {size === "sm" ? (
          <>
            <DrawerExample
              buttonLabel={`No header — ${size}`}
              renderDrawer={(close) => (
                <Drawer size={size} onClose={close}>
                  <Drawer.Body>{sampleBody}</Drawer.Body>
                </Drawer>
              )}
            />
            <DrawerExample
              buttonLabel={`No header, no padding — ${size}`}
              renderDrawer={(close) => (
                <Drawer size={size} onClose={close}>
                  <Drawer.Body withPadding={false}>{sampleBody}</Drawer.Body>
                </Drawer>
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
      <DrawerExample
        buttonLabel="Custom width (480px)"
        renderDrawer={(close) => (
          <Drawer className={css({ maxWidth: "[480px]" })} onClose={close}>
            <Drawer.Header
              title="Custom width (480px)"
              description="maxWidth is overridden via className."
            />
            <Drawer.Body>{sampleBody}</Drawer.Body>
            <Drawer.Footer
              actions={
                <Button variant="solid" tone="brand" onClick={close}>
                  Save changes
                </Button>
              }
            />
          </Drawer>
        )}
      />
      <DrawerExample
        buttonLabel="Custom height (320px, bottom)"
        renderDrawer={(close) => (
          <Drawer
            position="bottom"
            className={css({ maxHeight: "[320px]" })}
            onClose={close}
          >
            <Drawer.Header
              title="Custom height (320px)"
              description="maxHeight is overridden via className on a bottom drawer."
            />
            <Drawer.Body>{sampleBody}</Drawer.Body>
            <Drawer.Footer
              actions={
                <Button variant="solid" tone="brand" onClick={close}>
                  Save changes
                </Button>
              }
            />
          </Drawer>
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
  <Drawer loading={options?.loading} onClose={close}>
    <Drawer.Header
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
    <Drawer.Body>{overflowingBody}</Drawer.Body>
    <Drawer.Footer
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
  </Drawer>
);

const renderOverflowCustom = (
  close: () => void,
  options?: { loading?: boolean },
) => (
  <Drawer loading={options?.loading} onClose={close}>
    <Drawer.Header>
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
    </Drawer.Header>
    <Drawer.Body>{overflowingBody}</Drawer.Body>
    <Drawer.Footer>
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
    </Drawer.Footer>
  </Drawer>
);

const renderOverflowBodyOnly = (
  close: () => void,
  options?: { loading?: boolean },
) => (
  <Drawer loading={options?.loading} onClose={close}>
    <Drawer.Body>{overflowingBody}</Drawer.Body>
  </Drawer>
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
        <DrawerExample
          buttonLabel={`Kitchen sink${loading ? " — loading" : ""}`}
          renderDrawer={(close) =>
            renderOverflowKitchenSink(close, { loading })
          }
        />
        <DrawerExample
          buttonLabel={`Custom header + footer${loading ? " — loading" : ""}`}
          renderDrawer={(close) => renderOverflowCustom(close, { loading })}
        />
        <DrawerExample
          buttonLabel={`No header + footer${loading ? " — loading" : ""}`}
          renderDrawer={(close) => renderOverflowBodyOnly(close, { loading })}
        />
      </div>
    ))}
  </div>
);

const StackedExample = ({
  buttonLabel,
  position,
}: {
  buttonLabel: string;
  position: DrawerPosition;
}) => {
  const [l1, setL1] = useState(false);
  const [l2, setL2] = useState(false);
  const [l3, setL3] = useState(false);
  const [l4, setL4] = useState(false);
  const [l5, setL5] = useState(false);
  const [l6, setL6] = useState(false);
  const [l7, setL7] = useState(false);

  return (
    <>
      <Button onClick={() => setL1(true)}>{buttonLabel}</Button>
      {l1 ? (
        <Drawer size="lg" position={position} onClose={() => setL1(false)}>
          <Drawer.Header
            title="Drawer 1 (lg)"
            iconName="gear"
            description="Open the next drawer to stack another on top."
          />
          <Drawer.Body>{sampleBody}</Drawer.Body>
          <Drawer.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={() => setL2(true)}>
                Open lg drawer
              </Button>
            }
          />
        </Drawer>
      ) : null}
      {l2 ? (
        <Drawer size="lg" position={position} onClose={() => setL2(false)}>
          <Drawer.Header
            title="Drawer 2 (lg)"
            iconName="gear"
            description="Open a smaller drawer to stack it on top."
          />
          <Drawer.Body>{sampleBody}</Drawer.Body>
          <Drawer.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={() => setL3(true)}>
                Open sm drawer
              </Button>
            }
          />
        </Drawer>
      ) : null}
      {l3 ? (
        <Drawer size="sm" position={position} onClose={() => setL3(false)}>
          <Drawer.Header
            title="Drawer 3 (sm)"
            iconName="gear"
            description="Open a medium drawer to stack it on top."
          />
          <Drawer.Body>{sampleBody}</Drawer.Body>
          <Drawer.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={() => setL4(true)}>
                Open md drawer
              </Button>
            }
          />
        </Drawer>
      ) : null}
      {l4 ? (
        <Drawer size="md" position={position} onClose={() => setL4(false)}>
          <Drawer.Header
            title="Drawer 4 (md)"
            iconName="gear"
            description="Open a dialog to stack it on top of the drawers."
          />
          <Drawer.Body>{sampleBody}</Drawer.Body>
          <Drawer.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={() => setL5(true)}>
                Open dialog
              </Button>
            }
          />
        </Drawer>
      ) : null}
      {l5 ? (
        <Dialog size="md" onClose={() => setL5(false)}>
          <Dialog.Header
            title="Dialog"
            iconName="info"
            description="A dialog stacked in the middle. Open another drawer to keep stacking."
          />
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={() => setL6(true)}>
                Open lg drawer
              </Button>
            }
          />
        </Dialog>
      ) : null}
      {l6 ? (
        <Drawer size="lg" position={position} onClose={() => setL6(false)}>
          <Drawer.Header
            title="Drawer 5 (lg)"
            iconName="info"
            description="Open a final dialog to top off the stack."
          />
          <Drawer.Body>{sampleBody}</Drawer.Body>
          <Drawer.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={() => setL7(true)}>
                Open dialog
              </Button>
            }
          />
        </Drawer>
      ) : null}
      {l7 ? (
        <Dialog size="md" onClose={() => setL7(false)}>
          <Dialog.Header
            title="Dialog"
            iconName="info"
            description="This is the top of the stack."
          />
          <Dialog.Body>{sampleBody}</Dialog.Body>
          <Dialog.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={() => setL7(false)}>
                Done
              </Button>
            }
          />
        </Dialog>
      ) : null}
    </>
  );
};

export const Stacked: Story = () => (
  <div className={stackStyles}>
    <StackedExample buttonLabel="Open stacked drawers" position="right" />
    <StackedExample
      buttonLabel="Open stacked bottom drawers"
      position="bottom"
    />
  </div>
);

export const ShouldCloseOn: Story = () => (
  <div className={stackStyles}>
    <DrawerExample
      buttonLabel="closeButtonAndOverlay (default)"
      renderDrawer={(close) => (
        <Drawer shouldCloseOn="closeButtonAndOverlay" onClose={close}>
          <Drawer.Header
            title="Close button and overlay"
            iconName="info"
            description="Escape, the close button, and clicking the overlay all close the drawer."
          />
          <Drawer.Body>{sampleBody}</Drawer.Body>
          <Drawer.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={close}>
                Done
              </Button>
            }
          />
        </Drawer>
      )}
    />

    <DrawerExample
      buttonLabel="closeButton"
      renderDrawer={(close) => (
        <Drawer shouldCloseOn="closeButton" onClose={close}>
          <Drawer.Header
            title="Close button only"
            iconName="info"
            description="Escape and the close button close the drawer. Overlay clicks do not."
          />
          <Drawer.Body>{sampleBody}</Drawer.Body>
          <Drawer.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={close}>
                Done
              </Button>
            }
          />
        </Drawer>
      )}
    />

    <DrawerExample
      buttonLabel="none"
      renderDrawer={(close) => (
        <Drawer shouldCloseOn="none" onClose={close}>
          <Drawer.Header
            title="No default close"
            iconName="info"
            description="No close button is rendered, and neither escape nor overlay clicks close the drawer."
          />
          <Drawer.Body>{sampleBody}</Drawer.Body>
          <Drawer.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={close}>
                Done
              </Button>
            }
          />
        </Drawer>
      )}
    />

    <DrawerExample
      buttonLabel="none + no header"
      renderDrawer={(close) => (
        <Drawer shouldCloseOn="none" onClose={close}>
          <Drawer.Body>{sampleBody}</Drawer.Body>
          <Drawer.Footer
            actions={
              <Button variant="solid" tone="brand" onClick={close}>
                Done
              </Button>
            }
          />
        </Drawer>
      )}
    />
  </div>
);
