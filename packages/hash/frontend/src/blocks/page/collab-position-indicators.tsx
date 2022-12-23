import { CollabPosition } from "@hashintel/hash-shared/collab";
import { AnimatePresence, motion } from "framer-motion";
import { FunctionComponent, useMemo } from "react";

import { useCollabPositionContext } from "../../contexts/collab-position-context";
import { CollabPositionIndicator } from "./collab-position-indicator";

function pickColor(inputString: string) {
  let hash = 0;
  for (let i = 0; i < inputString.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = inputString.charCodeAt(i) + ((hash << 5) - hash);
  }

  // reduce the last number to get a darker color
  return `hsl(${hash % 360}, 100%, 80%)`;
}

interface CollabPositionIndicatorsProps {
  blockEntityId: string | null;
}

export const CollabPositionIndicators: FunctionComponent<
  CollabPositionIndicatorsProps
> = ({ blockEntityId }) => {
  const collabPositions = useCollabPositionContext();

  const relevantPresenceIndicators: CollabPosition[] = useMemo(
    () =>
      collabPositions.filter(
        (collabPosition) => collabPosition.entityId === blockEntityId,
      ),
    [blockEntityId, collabPositions],
  );

  return (
    <motion.div
      animate={{
        // only display upto 3 indicators
        left: `-${relevantPresenceIndicators.slice(0, 3).length * 33.5}px`,
      }}
      id="presence-indicators"
      style={{
        display: "flex",
        position: "absolute",
      }}
    >
      <AnimatePresence>
        {relevantPresenceIndicators
          // only display first 2 indicators
          .slice(0, relevantPresenceIndicators.length === 3 ? 3 : 2)
          .map((presenceIndicator) => (
            <CollabPositionIndicator
              backgroundColor={pickColor(presenceIndicator.userPreferredName)}
              key={presenceIndicator.userId}
              title={presenceIndicator.userPreferredName}
            >
              {presenceIndicator.userPreferredName.charAt(0).toUpperCase()}
            </CollabPositionIndicator>
          ))}

        {relevantPresenceIndicators.length > 3 && (
          <CollabPositionIndicator
            backgroundColor={pickColor(
              `+${relevantPresenceIndicators.length - 2}`,
            )}
            title={`${relevantPresenceIndicators
              .slice(2)
              .map((presenceIndicator) => presenceIndicator.userPreferredName)
              .join("\n")}`}
          >
            <span
              style={{
                fontSize: `${
                  1 -
                  0.2 *
                    (relevantPresenceIndicators.length - 2).toString().length
                }em`,
              }}
            >{`+${relevantPresenceIndicators.length - 2}`}</span>
          </CollabPositionIndicator>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
