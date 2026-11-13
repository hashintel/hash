import { use } from "react";

import { Checkbox, Form, Popover, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  defaultImplementationId,
  hasBody,
  implementationsOf,
  implementsInterface,
  isInterface,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";

import type { Subnet } from "@hashintel/petrinaut-core";

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "[260px]",
});

const hintStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
});

const checkboxListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

/**
 * What a subnet is to the nets around it: an interface, a signature with no
 * body that instances run through an implementation, or a component that
 * may implement interfaces. For an interface, the document's default
 * implementation is chosen here too.
 */
const InterfaceOptions: React.FC<{ subnet: Subnet }> = ({ subnet }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { updateSubnet, setImplementation } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  const isAnInterface = isInterface(subnet);
  const cannotBecomeOne = !isAnInterface && hasBody(subnet);
  const interfaces = (petriNetDefinition.subnets ?? []).filter(
    (candidate) => isInterface(candidate) && candidate.id !== subnet.id,
  );
  const implementations = implementationsOf(petriNetDefinition, subnet.id);

  return (
    <>
      <div>
        <Checkbox
          size="sm"
          label="Interface"
          value={isAnInterface}
          disabled={isReadOnly || cannotBecomeOne}
          onChange={(checked) =>
            updateSubnet({
              subnetId: subnet.id,
              update: checked
                ? { interface: true, implements: undefined }
                : { interface: undefined },
            })
          }
        />
        <div className={hintStyle}>
          {cannotBecomeOne
            ? "An interface is ports and parameters alone: remove the transitions and instances first."
            : "An interface is ports and parameters alone. Its instances run the implementation bound to them."}
        </div>
      </div>
      {isAnInterface ? (
        <Form.Field label="Default implementation" size="sm">
          <Select
            required
            size="sm"
            value={
              defaultImplementationId(petriNetDefinition, subnet.id) ?? "none"
            }
            disabled={isReadOnly}
            onChange={(value) =>
              setImplementation({
                interfaceId: subnet.id,
                implementationId: value === "none" ? null : value,
              })
            }
            items={[
              {
                value: "none",
                text:
                  implementations.length === 0
                    ? "None: no subnet implements this yet"
                    : "None",
              },
              ...implementations.map((implementation) => ({
                value: implementation.id,
                text: implementation.name,
              })),
            ]}
          />
        </Form.Field>
      ) : interfaces.length > 0 ? (
        <Form.Field label="Implements" as="legend" size="sm">
          <div className={checkboxListStyle}>
            {interfaces.map((iface) => (
              <Checkbox
                key={iface.id}
                size="sm"
                label={iface.name}
                value={implementsInterface(subnet, iface.id)}
                disabled={isReadOnly}
                onChange={(checked) => {
                  const current = subnet.implements ?? [];
                  const next = checked
                    ? [...current, iface.id]
                    : current.filter((id) => id !== iface.id);
                  updateSubnet({
                    subnetId: subnet.id,
                    update: { implements: next.length > 0 ? next : undefined },
                  });
                }}
              />
            ))}
          </div>
        </Form.Field>
      ) : (
        <div className={hintStyle}>
          Mark another subnet as an interface to implement it here.
        </div>
      )}
    </>
  );
};

/** The options of one subnet, hung off its row in the Nets list. */
export const SubnetOptionsPopover: React.FC<{
  subnet: Subnet;
  anchor: Element;
  onClose: () => void;
}> = ({ subnet, anchor, onClose }) => (
  <Popover
    triggerRef={{ current: anchor }}
    position="bottom-start"
    onClose={onClose}
  >
    <Popover.Container>
      <Popover.Body>
        <div className={bodyStyle}>
          <InterfaceOptions subnet={subnet} />
        </div>
      </Popover.Body>
    </Popover.Container>
  </Popover>
);
