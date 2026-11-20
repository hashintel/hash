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
import { validateEntityName } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { useEditorActions } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../../react/state/use-is-read-only";
import { useUserSettings } from "../../../../../../../react/state/user-settings-context";
import { DescriptionField } from "../../../../../../components/description-field";
import { DraftFieldInput } from "../../../../../../components/draft-field-input";
import { PropertyValue } from "../../../../../../components/property-value";
import { Section, SectionList } from "../../../../../../components/section";
import { UI_MESSAGES } from "../../../../../../constants/ui-messages";
import { DeleteItemButton } from "../../delete-item-button";
import { fieldsSectionStyle } from "../../styles";
import { usePlacePropertiesContext } from "../context";
import { placeTypeChange } from "./place-dynamics/compose-dynamics";
import { PortDirectionField } from "./port-direction-field";

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

export const PlaceMainContent: React.FC = () => {
  const { place, types } = usePlacePropertiesContext();
  const { updatePlace } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const { selectItem } = useEditorActions();
  const showAnimations = useUserSettings((settings) => settings.showAnimations);
  const capacityEnabled =
    place.capacity !== undefined && place.capacity !== null;

  const { extensions } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  const { types: availableTypes } = activeNet;

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
        />
        <DescriptionField
          sourceId={place.id}
          sourceValue={place.description}
          onCommit={(description) =>
            updatePlace({ placeId: place.id, update: { description } })
          }
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
          <HelpTooltip content="Expose this place as a port on the instances of its component: fuse it with a place of the net that holds the instance, or connect it to a transition there." />
        </div>
        {place.isPort && (
          <PortDirectionField
            place={place}
            disabled={isReadOnly}
            className={indentedFieldStyle}
            onChange={(portDirection) =>
              updatePlace({ placeId: place.id, update: { portDirection } })
            }
          />
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

export const DeletePlaceAction: React.FC = () => {
  const { place } = usePlacePropertiesContext();
  const { removePlace } = usePetrinautMutations();

  return (
    <DeleteItemButton
      label="Delete place"
      onDelete={() => removePlace({ placeId: place.id })}
    />
  );
};
