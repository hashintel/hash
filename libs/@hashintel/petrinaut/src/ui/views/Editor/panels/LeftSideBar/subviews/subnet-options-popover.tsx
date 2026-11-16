import { use } from "react";

import { Checkbox, Form, Popover, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  defaultImplementationId,
  hasBody,
  implementsInterface,
  isInterface,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { hintTextStyle } from "../../../../../constants/hint-text";
import { implementationItems } from "../../implementation-items";

import type { Subnet } from "@hashintel/petrinaut-core";

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "[260px]",
});

const checkboxListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

/** The implementation the document runs for instances of `iface` that choose none. */
const DefaultImplementationField: React.FC<{ iface: Subnet }> = ({ iface }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { setImplementation } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  const defaultId = defaultImplementationId(petriNetDefinition, iface.id);
  const implementations = implementationItems(
    petriNetDefinition,
    iface.id,
    defaultId,
  );

  return (
    <Form.Field label="Default implementation" size="sm">
      <Select
        required
        size="sm"
        value={defaultId ?? "none"}
        disabled={isReadOnly}
        onChange={(value) =>
          setImplementation({
            interfaceId: iface.id,
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
          ...implementations,
        ]}
      />
    </Form.Field>
  );
};

/** The interfaces of the document, each ticked when `subnet` implements it. */
const ImplementsField: React.FC<{ subnet: Subnet }> = ({ subnet }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { updateSubnet } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  const interfaces = (petriNetDefinition.subnets ?? []).filter((candidate) =>
    isInterface(candidate),
  );

  if (interfaces.length === 0) {
    return (
      <div className={hintTextStyle}>
        Mark another subnet as an interface to implement it here.
      </div>
    );
  }

  return (
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
  );
};

/**
 * What a subnet is to the nets around it: an interface, a signature with no
 * body that instances run through an implementation, or a component that
 * may implement interfaces. For an interface, the document's default
 * implementation is chosen here too.
 */
const InterfaceOptions: React.FC<{ subnet: Subnet }> = ({ subnet }) => {
  const { updateSubnet } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  const isAnInterface = isInterface(subnet);
  const cannotBecomeInterface = !isAnInterface && hasBody(subnet);

  return (
    <>
      <div>
        <Checkbox
          size="sm"
          label="Interface"
          value={isAnInterface}
          disabled={isReadOnly || cannotBecomeInterface}
          onChange={(checked) =>
            updateSubnet({
              subnetId: subnet.id,
              update: checked
                ? // An interface has no body to stand behind another interface.
                  { interface: true, implements: undefined }
                : { interface: undefined },
            })
          }
        />
        <div className={hintTextStyle}>
          {cannotBecomeInterface
            ? "An interface is ports and parameters alone: remove the transitions and instances first."
            : "An interface is ports and parameters alone. Its instances run the implementation bound to them."}
        </div>
      </div>
      {isAnInterface ? (
        <DefaultImplementationField iface={subnet} />
      ) : (
        <ImplementsField subnet={subnet} />
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
