import { upperFirst } from "lodash";

import { Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getKindIcon, getKindLabel } from "./value-display";

import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

const nameWithType = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
});
const typeIcon = css({ display: "flex", color: "fg.subtle" });

/**
 * A step's input or output, or a flow input, by name after an icon for its type, with the type on hover. `shape` is
 * `null` while the type isn't known, e.g. for an output that takes its kind from an input that isn't picked yet.
 */
export const ValueName = ({
  name,
  shape,
}: {
  name: string;
  shape: { payloadKind: PayloadKind; array: boolean } | null;
}) => (
  <span className={nameWithType}>
    <Tooltip
      position="top"
      content={shape ? upperFirst(getKindLabel(shape)) : "Type not known yet"}
    >
      <span
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the type can be read from the keyboard
        tabIndex={0}
        className={typeIcon}
      >
        <Icon
          name={shape ? getKindIcon(shape) : "circle"}
          size="xs"
          alt={shape ? getKindLabel(shape) : "Type not known yet"}
        />
      </span>
    </Tooltip>
    {name}
  </span>
);
