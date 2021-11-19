import { tw } from "twind";
import { motion, AnimatePresence } from "framer-motion";

import { CollabPositions, usePageContext } from "../../contexts/PageContext";

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
}: {
  entityId: string | null;
}) {
  const { collabPositions } = usePageContext().state;

  const relevantPresenceIndicators: CollabPositions =
    collabPositions?.filter(
      (collabPosition) => collabPosition.blockId === entityId,
    ) ?? [];

  return (
    <motion.div
      animate={{
        // only account for 3 indicators
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
