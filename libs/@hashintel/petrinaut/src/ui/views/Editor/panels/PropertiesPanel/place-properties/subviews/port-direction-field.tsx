import { use } from "react";

import { Form, Select } from "@hashintel/ds-components";
import {
  describePortDirection,
  inferPortDirection,
  portDirections,
  type Place,
  type PortDirection,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../../react/document/active-net-context";

/** The picker's value for a port that declares no direction. */
const inferredOption = "auto";

const directionLabel = (direction: PortDirection): string => {
  const text = describePortDirection(direction);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

/**
 * The direction a port declares. A port that declares none shows the one its
 * net's arcs give it; picking that entry clears a declared direction.
 */
export const PortDirectionField = ({
  place,
  disabled,
  className,
  onChange,
}: {
  place: Pick<Place, "id" | "portDirection">;
  disabled: boolean;
  className?: string;
  /** `undefined` when the port goes back to its inferred direction. */
  onChange: (direction: PortDirection | undefined) => void;
}) => {
  const { activeNet } = use(ActiveNetContext);

  return (
    <Form.Field
      label="Direction"
      size="sm"
      className={className}
      labelTooltip="What the component promises about the port: input ports are only consumed by its transitions, output ports only produced into. Inferred from the arcs unless set."
    >
      <Select
        required
        size="sm"
        value={place.portDirection ?? inferredOption}
        disabled={disabled}
        onChange={(value: PortDirection | typeof inferredOption) =>
          onChange(value === inferredOption ? undefined : value)
        }
        items={[
          {
            value: inferredOption,
            text: `Inferred (${directionLabel(inferPortDirection(activeNet, place.id))})`,
          },
          ...portDirections.map((value) => ({
            value,
            text: directionLabel(value),
          })),
        ]}
      />
    </Form.Field>
  );
};
