import { use, useRef, useState } from "react";

import { Button, Icon, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../react/state/active-net-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { NetNavigationList } from "../views/Editor/panels/LeftSideBar/subviews/nets-list";

const popoverWidthStyle = css({
  width: "[min(320px, calc(100vw - 24px))]",
});

/** Compact host for the editor's shared root/subnet navigation list. */
export const PreviewNetNavigation: React.FC = () => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { activeSubnetId } = use(ActiveNetContext);
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);

  if (!subnets?.length) {
    return null;
  }

  const activeNetName =
    subnets.find(({ id }) => id === activeSubnetId)?.name ?? "Root";

  return (
    <>
      <Button
        ref={triggerRef}
        size="xs"
        variant="ghost"
        prefix={<Icon name="diagramNested" size="xs" />}
        suffix={<Icon name="chevronDown" size="xs" />}
        aria-label={`Select net. Current net: ${activeNetName}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {activeNetName}
      </Button>
      {open && (
        <Popover
          triggerRef={triggerRef}
          position="bottom-start"
          onClose={() => setOpen(false)}
        >
          <Popover.Container className={popoverWidthStyle}>
            <Popover.Header title="Nets" />
            <Popover.Body>
              {/* Picking a net closes the menu: on a compact embed it would
                  otherwise cover the net the user just chose. */}
              <NetNavigationList onSelect={() => setOpen(false)} />
            </Popover.Body>
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};
