import { useState } from "react";

import {
  Button,
  Checkbox,
  Form,
  Popover,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  componentKey,
  defaultImplementation,
  hasBody,
  implementsInterface,
  isInterface,
} from "@hashintel/petrinaut-core";

import { useSDCPNState } from "../../../../../../react/document/sdcpn-context";
import { usePetrinautDefinitionSelector } from "../../../../../../react/document/use-document";
import { useIsReadOnly } from "../../../../../../react/editing/use-is-read-only";
import { usePetrinautMutations } from "../../../../../../react/editing/use-petrinaut-mutations";
import { OptionalColorSelect } from "../../../../../components/color-select";
import { ComponentGlyph } from "../../../../../components/component-glyph";
import { hintTextStyle } from "../../../../../constants/hint-text";
import { pickSvgIcon } from "../../../../../file-io/pick-svg-icon";
import { implementationItems } from "../../implementation-items";

import type { Component } from "@hashintel/petrinaut-core";

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

/** A small tile for the component's glyph, in its colour. */
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

/** The implementation the document runs for instances of `iface` that choose none. */
const DefaultImplementationField: React.FC<{ iface: Component }> = ({
  iface,
}) => {
  const petriNetDefinition = useSDCPNState(
    (document) => document.petriNetDefinition,
  );
  const { setImplementation } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  const reference = { id: iface.id };
  const chosen = defaultImplementation(petriNetDefinition, reference);
  // The document's default is chosen among its own components.
  const implementations = implementationItems(
    petriNetDefinition,
    reference,
    chosen,
  );

  return (
    <Form.Field label="Default implementation" size="sm">
      <Select
        required
        size="sm"
        value={chosen ? componentKey(chosen) : "none"}
        disabled={isReadOnly}
        onChange={(value) => {
          const picked = implementations.find((item) => item.value === value);
          setImplementation({
            interfaceId: iface.id,
            implementationId:
              picked?.reference.from === undefined
                ? (picked?.reference.id ?? null)
                : null,
          });
        }}
        items={[
          {
            value: "none",
            text:
              implementations.length === 0
                ? "None: no component implements this yet"
                : "None",
          },
          ...implementations,
        ]}
      />
    </Form.Field>
  );
};

/** The interfaces of the document, each ticked when `component` implements it. */
const ImplementsField: React.FC<{ component: Component }> = ({ component }) => {
  const components = usePetrinautDefinitionSelector(
    (definition) => definition.components,
  );
  const { updateComponent } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  const interfaces = (components ?? []).filter((candidate) =>
    isInterface(candidate),
  );

  if (interfaces.length === 0) {
    return (
      <div className={hintTextStyle}>
        Mark another component as an interface to implement it here.
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
            value={implementsInterface(component, iface.id)}
            disabled={isReadOnly}
            onChange={(checked) => {
              const current = component.implements ?? [];
              const next = checked
                ? [...current, iface.id]
                : current.filter((id) => id !== iface.id);
              updateComponent({
                componentId: component.id,
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
 * What a component is to the nets around it: an interface, a signature with no
 * body that instances run through an implementation, or a component that
 * may implement interfaces. For an interface, the document's default
 * implementation is chosen here too.
 */
const InterfaceOptions: React.FC<{ component: Component }> = ({
  component,
}) => {
  const { updateComponent } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  const isAnInterface = isInterface(component);
  const cannotBecomeInterface = !isAnInterface && hasBody(component);

  return (
    <>
      <div>
        <Checkbox
          size="sm"
          label="Interface"
          value={isAnInterface}
          disabled={isReadOnly || cannotBecomeInterface}
          onChange={(checked) =>
            updateComponent({
              componentId: component.id,
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
        <DefaultImplementationField iface={component} />
      ) : (
        <ImplementsField component={component} />
      )}
    </>
  );
};

/** How a component's instances look: the icon and the colour their cards wear. */
const AppearanceOptions: React.FC<{ component: Component }> = ({
  component,
}) => {
  const { updateComponent } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const [iconError, setIconError] = useState<string | null>(null);

  const chooseIcon = async () => {
    const picked = await pickSvgIcon();
    if (picked === null) {
      return;
    }
    if (!picked.ok) {
      setIconError(picked.error);
      return;
    }
    setIconError(null);
    updateComponent({
      componentId: component.id,
      update: { iconSvg: picked.iconSvg },
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
            style={{ color: component.displayColor }}
          >
            <ComponentGlyph
              iconSvg={component.iconSvg}
              fallback={isInterface(component) ? "puzzlePiece" : "cube"}
              size="sm"
            />
          </span>
          <Button
            variant="subtle"
            tone="neutral"
            size="sm"
            disabled={isReadOnly}
            onClick={() => {
              void chooseIcon();
            }}
          >
            {component.iconSvg ? "Replace" : "Choose SVG"}
          </Button>
          {component.iconSvg ? (
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              disabled={isReadOnly}
              onClick={() => {
                setIconError(null);
                updateComponent({
                  componentId: component.id,
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
          value={component.displayColor ?? null}
          disabled={isReadOnly}
          onChange={(color) =>
            updateComponent({
              componentId: component.id,
              update: { displayColor: color ?? undefined },
            })
          }
        />
      </Form.Field>
    </>
  );
};

/** The options of one component, hung off its row in the Nets list. */
export const ComponentOptionsPopover: React.FC<{
  component: Component;
  anchor: Element;
  onClose: () => void;
}> = ({ component, anchor, onClose }) => (
  <Popover
    triggerRef={{ current: anchor }}
    position="bottom-start"
    onClose={onClose}
  >
    <Popover.Container>
      <Popover.Body>
        <div className={bodyStyle}>
          <InterfaceOptions component={component} />
          <AppearanceOptions component={component} />
        </div>
      </Popover.Body>
    </Popover.Container>
  </Popover>
);
