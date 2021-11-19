import { tw } from "twind";
import { motion, AnimatePresence } from "framer-motion";

import { CollabPosition } from "@hashintel/hash-shared/collab";
import { useCollabPositions } from "./collab/useCollabPositions";
import { useMemo } from "react";

function pickColor(inputString: string) {
  let hash = 0;
  for (var i = 0; i < inputString.length; i++) {
    hash = inputString.charCodeAt(i) + ((hash << 5) - hash);
  }

  // reduce the last number to get a darker color
  return `hsl(${hash % 360}, 100%, 80%)`;
}
export default function PresenceIndicators({
  entityId,
  accountId,
  pageEntityId,
}: {
  entityId: string | null;
  accountId: string;
  pageEntityId: string;
}) {
  const collabPositions = useCollabPositions(accountId, pageEntityId);

  // const { collabPositions } = usePageContext().state;

  const relevantPresenceIndicators: CollabPosition[] = useMemo(() => {
    return (
      collabPositions?.filter(
        (collabPosition) => collabPosition.entityId === entityId,
      ) ?? []
    );
  }, [collabPositions]);

  console.log({ collabPositions, relevantPresenceIndicators });

  if (relevantPresenceIndicators.length > 0) {
    console.log(entityId);
  }

  return (
    <motion.div
      animate={{
        // only display upto 3 indicators
        left: `-${relevantPresenceIndicators.slice(0, 3).length * 33.5}px`,
      }}
      id="presence-indicators"
      className={tw`flex absolute`}
    >
      <AnimatePresence>
        {relevantPresenceIndicators
          // only display first 2 indicators
          .slice(0, 2)
          .map((presenceIndicator, index) => (
            <motion.div
              initial={{
                opacity: 0,
                x: "100%",
              }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              exit={{
                opacity: 0,
              }}
              style={{
                height: "1.5em",
                width: "1.5em",
                backgroundColor: pickColor(presenceIndicator.userPreferredName),
              }}
              className={tw`rounded-full flex justify-center mr-2 font-medium`}
              key={index}
              title={presenceIndicator.userPreferredName}
            >
              {presenceIndicator.userPreferredName.charAt(0).toUpperCase()}
            </motion.div>
          ))}

        {relevantPresenceIndicators.length > 2 && (
          <motion.div
            initial={{
              opacity: 0,
              x: "100%",
            }}
            animate={{
              opacity: 1,
              x: 0,
            }}
            exit={{
              opacity: 0,
            }}
            style={{
              height: "1.5em",
              width: "1.5em",
              backgroundColor: pickColor(
                `+${relevantPresenceIndicators.length - 2}`,
              ),
            }}
            className={tw`rounded-full flex justify-center mr-2 font-medium`}
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
