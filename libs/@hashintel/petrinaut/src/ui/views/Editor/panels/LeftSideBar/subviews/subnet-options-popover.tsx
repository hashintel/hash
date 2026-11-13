import { use, useState } from "react";

import {
  Button,
  Checkbox,
  Form,
  Popover,
  Select,
} from "@hashintel/ds-components";
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
import { OptionalColorSelect } from "../../../../../components/color-select";
import { ComponentGlyph } from "../../../../../components/component-glyph";
import { hintTextStyle } from "../../../../../constants/hint-text";
import { pickSvgIcon } from "../../../../../file-io/pick-svg-icon";
import { implementationItems } from "../../implementation-items";

import type { Subnet } from "@hashintel/petrinaut-core";

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "[260px]",
});

const iconRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

/** The icon as the cards draw it: the component's glyph, in its colour. */
const iconPreviewStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[28px]",
  height: "[28px]",
  flexShrink: "0",
  borderRadius: "sm",
  border: "[1px solid rgba(0,0,0,0.06)]",
  backgroundColor: "neutral.s10",
  color: "neutral.s80",
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
  const defaultId = defaultImplementationId(petriNetDefinition, subnet.id);
  const implementations = implementationItems(
    petriNetDefinition,
    subnet.id,
    defaultId,
  );

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
        <div className={hintTextStyle}>
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
            value={defaultId ?? "none"}
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
              ...implementations,
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
        <div className={hintTextStyle}>
          Mark another subnet as an interface to implement it here.
        </div>
      )}
    </>
  );
};

/** How a component's instances look: the icon and the colour their cards wear. */
const AppearanceOptions: React.FC<{ subnet: Subnet }> = ({ subnet }) => {
  const { updateSubnet } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const [iconError, setIconError] = useState<string | null>(null);

  const chooseIcon = () => {
    void pickSvgIcon().then((picked) => {
      if (picked === null) {
        return;
      }
      setIconError(picked.ok ? null : picked.error);
      if (picked.ok) {
        updateSubnet({
          subnetId: subnet.id,
          update: { iconSvg: picked.iconSvg },
        });
      }
    });
  };

  return (
    <>
      <Form.Field
        label="Icon"
        as="legend"
        size="sm"
        descriptionBottom={
          <span className={hintTextStyle}>
            An SVG file. Its shape is drawn in one colour on the component's
            instances.
          </span>
        }
        errors={iconError === null ? undefined : [iconError]}
      >
        <div className={iconRowStyle}>
          <span
            className={iconPreviewStyle}
            style={
              subnet.displayColor ? { color: subnet.displayColor } : undefined
            }
          >
            <ComponentGlyph
              iconSvg={subnet.iconSvg}
              fallback={isInterface(subnet) ? "puzzlePiece" : "cube"}
              size="sm"
            />
          </span>
          <Button
            variant="subtle"
            tone="neutral"
            size="sm"
            disabled={isReadOnly}
            onClick={chooseIcon}
          >
            {subnet.iconSvg ? "Replace" : "Choose SVG"}
          </Button>
          {subnet.iconSvg ? (
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              disabled={isReadOnly}
              onClick={() => {
                setIconError(null);
                updateSubnet({
                  subnetId: subnet.id,
                  update: { iconSvg: undefined },
                });
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </Form.Field>
      <Form.Field label="Color" size="sm">
        <OptionalColorSelect
          value={subnet.displayColor ?? null}
          noneLabel="Default"
          disabled={isReadOnly}
          onChange={(color) =>
            updateSubnet({
              subnetId: subnet.id,
              update: { displayColor: color ?? undefined },
            })
          }
        />
      </Form.Field>
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
          <AppearanceOptions subnet={subnet} />
        </div>
      </Popover.Body>
    </Popover.Container>
  </Popover>
);
