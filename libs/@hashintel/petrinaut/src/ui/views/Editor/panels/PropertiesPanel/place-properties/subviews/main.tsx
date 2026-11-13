import { Collapsible } from "@ark-ui/react/collapsible";
import { use } from "react";

import {
  Button,
  Checkbox,
  Form,
  HelpTooltip,
  NumberInput,
  Select,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  describePortDirection,
  inferPortDirection,
  portDirections,
  validateEntityName,
  type PortDirection,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../../../react/state/user-settings-context";
import { DescriptionField } from "../../../../../../components/description-field";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { PropertyValue } from "../../../../../../components/property-value";
import { Section, SectionList } from "../../../../../../components/section";
import { PlaceIcon } from "../../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { usePlacePropertiesContext } from "../context";
import { placeTypeChange } from "./place-dynamics/compose-dynamics";

import type { SubView } from "../../../../../../components/sub-view/types";

const fieldsSectionStyle = css({
  paddingY: "3",
});

const relatedActionsStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: "1",
});

const optionRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const capacityContentStyle = css({
  overflow: "hidden",
  "&[data-animate=true]": {
    animationDuration: "[180ms]",
    animationTimingFunction: "ease-in-out",
    "&[data-state=open]": { animationName: "[petrinautExpand]" },
    "&[data-state=closed]": { animationName: "[petrinautCollapse]" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none!",
  },
});

const indentedFieldStyle = css({
  paddingTop: "2",
  paddingLeft: "6",
  "& label": { fontWeight: "normal" },
});

const directionLabel = (direction: PortDirection): string => {
  const text = describePortDirection(direction);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

const typeColorDotStyle = css({
  width: "3",
  height: "3",
  borderRadius: "full",
  flexShrink: 0,
});

const arcStyle = css({
  display: "flex",
  gap: "2",
  alignItems: "center",
});

/**
 * Main content section for the Place properties panel.
 * Rendered as a headerless SubView at the top of the proportional layout.
 */
const PlaceMainContent: React.FC = () => {
  const { place, types, isReadOnly, updatePlace } = usePlacePropertiesContext();
  const { selectItem } = use(EditorContext);
  const { showAnimations } = use(UserSettingsContext);
  const capacityEnabled =
    place.capacity !== undefined && place.capacity !== null;

  const { extensions } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  const { types: availableTypes } = activeNet;
  const inferredDirection = inferPortDirection(activeNet, place.id);

  const placeTypeName =
    types.find((candidate) => candidate.id === place.colorId)?.name ?? "None";

  return (
    <SectionList>
      <Form.Section className={fieldsSectionStyle}>
        <DraftFieldInput
          label="Name"
          sourceId={place.id}
          sourceValue={place.name}
          validate={validateEntityName}
          onCommit={(name) =>
            updatePlace({ placeId: place.id, update: { name } })
          }
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
        <DescriptionField
          sourceId={place.id}
          sourceValue={place.description}
          onCommit={(description) =>
            updatePlace({ placeId: place.id, update: { description } })
          }
          disabled={isReadOnly}
          tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
        />
      </Form.Section>

      {extensions.colors && (
        <Section
          title="Accepted token type"
          tooltip={`If tokens in this place should carry data ("colour"), assign a data type here.${
            availableTypes.length === 0
              ? " You must create a data type in the left-hand sidebar first."
              : ""
          } Tokens in places don't have to carry data, but they need one for dynamics (token data changing over time when in a place); changing the type clears the place's equations.`}
        >
          <PropertyValue text={placeTypeName}>
            <Tooltip
              content={UI_MESSAGES.READ_ONLY_MODE}
              disableTooltip={!isReadOnly}
            >
              <Select
                aria-label="Accepted token type"
                required
                size="sm"
                value={place.colorId ?? ""}
                onChange={(colorId) => {
                  const update = placeTypeChange(
                    place,
                    colorId === "" ? null : colorId,
                  );
                  if (update) {
                    updatePlace({ placeId: place.id, update });
                  }
                }}
                items={[
                  { value: "", text: "None" },
                  ...types.map((type) => ({
                    value: type.id,
                    text: type.name,
                  })),
                ]}
                renderItem={(value) => {
                  const type = types.find((tp) => tp.id === value);
                  return (
                    <div className={arcStyle}>
                      {type?.displayColor && (
                        <div
                          className={typeColorDotStyle}
                          style={{ backgroundColor: type.displayColor }}
                        />
                      )}
                      {type?.name ?? "None"}
                    </div>
                  );
                }}
                disabled={isReadOnly}
              />
            </Tooltip>
          </PropertyValue>

          {place.colorId && (
            <div className={relatedActionsStyle}>
              <Button
                variant="ghost"
                tone="neutral"
                size="xs"
                onClick={() => {
                  if (place.colorId) {
                    selectItem({ type: "type", id: place.colorId });
                  }
                }}
                iconName="arrowRight"
                iconPosition="right"
              >
                View type
              </Button>
            </div>
          )}
        </Section>
      )}

      <Section title="Options">
        <div className={optionRowStyle}>
          <Checkbox
            size="sm"
            label="Component port"
            value={!!place.isPort}
            disabled={isReadOnly}
            onChange={(checked) =>
              updatePlace({ placeId: place.id, update: { isPort: checked } })
            }
          />
          <HelpTooltip content="Expose this place as a port when its subnet is used as a component: fuse it with a place of the net that holds the instance, or connect it to a transition there." />
        </div>
        {place.isPort && (
          <Form.Field
            label="Direction"
            size="sm"
            className={indentedFieldStyle}
            labelTooltip="What the component promises about the port: input ports are only consumed by its transitions, output ports only produced into. Inferred from the arcs unless set."
          >
            <Select
              required
              size="sm"
              value={place.portDirection ?? "auto"}
              disabled={isReadOnly}
              onChange={(value: PortDirection | "auto") =>
                updatePlace({
                  placeId: place.id,
                  update: {
                    portDirection: value === "auto" ? undefined : value,
                  },
                })
              }
              items={[
                {
                  value: "auto",
                  text: `Inferred (${directionLabel(inferredDirection)})`,
                },
                ...portDirections.map((value) => ({
                  value,
                  text: directionLabel(value),
                })),
              ]}
            />
          </Form.Field>
        )}
        <Collapsible.Root open={capacityEnabled} lazyMount unmountOnExit>
          <div className={optionRowStyle}>
            <Checkbox
              size="sm"
              label="Token capacity"
              value={capacityEnabled}
              disabled={isReadOnly}
              onChange={(checked) =>
                updatePlace({
                  placeId: place.id,
                  update: { capacity: checked ? 1 : null },
                })
              }
            />
            <HelpTooltip content="Limit how many tokens this place can hold. Transitions that would exceed this limit cannot fire." />
          </div>
          <Collapsible.Content
            className={capacityContentStyle}
            data-animate={showAnimations}
            inert={!capacityEnabled}
          >
            <Form.Field
              label="Maximum tokens"
              size="xs"
              layout="inline"
              inputAlign="end"
              className={indentedFieldStyle}
              disabled={isReadOnly}
            >
              <NumberInput
                size="xs"
                width="maxNumber"
                min={0}
                max={4294967294}
                value={place.capacity}
                onChange={(nextCapacity) => {
                  if (
                    nextCapacity !== null &&
                    nextCapacity >= 0 &&
                    nextCapacity <= 4294967294
                  ) {
                    updatePlace({
                      placeId: place.id,
                      update: { capacity: Math.floor(nextCapacity) },
                    });
                  }
                }}
                disabled={isReadOnly}
              />
            </Form.Field>
          </Collapsible.Content>
        </Collapsible.Root>
        <div className={optionRowStyle}>
          <Checkbox
            size="sm"
            label="Default starting place"
            value={!!place.showAsInitialState}
            disabled={isReadOnly}
            onChange={(checked) =>
              updatePlace({
                placeId: place.id,
                update: { showAsInitialState: checked },
              })
            }
          />
          <HelpTooltip content="Pre-select this place when creating a scenario so you can define its initial tokens." />
        </div>
      </Section>
    </SectionList>
  );
};

const DeletePlaceAction: React.FC = () => {
  const { place, isReadOnly } = usePlacePropertiesContext();
  const { removePlace } = usePetrinautMutations();

  return (
    <Button
      aria-label="Delete place"
      size="sm"
      variant="ghost"
      tone="error"
      iconName="trash"
      onClick={() => removePlace({ placeId: place.id })}
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete place"}
    />
  );
};

export const placeMainContentSubView: SubView = {
  id: "place-main-content",
  title: "Place",
  icon: PlaceIcon,
  main: true,
  component: PlaceMainContent,
  renderHeaderAction: () => <DeletePlaceAction />,
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
};
