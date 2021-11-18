import { tw } from "twind";
import { motion, AnimatePresence } from "framer-motion";

import { usePageContext } from "../../contexts/PageContext";

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
  const { collabPositions } = usePageContext();

  if (
    !collabPositions?.length ||
    collabPositions.filter(
      (collabPosition) => collabPosition.blockId === entityId,
    ).length === 0
  ) {
    return null;
  }

  return (
    <div className={tw`flex`}>
      {collabPositions
        .filter((collabPosition) => collabPosition.blockId === entityId)
        .map((presenceIndicator, index) => (
          <AnimatePresence>
            <motion.div
              initial={{
                opacity: 0,
                x: "100%",
              }}
              animate={{
                opacity: 1,
                x: 0,
                animationDelay: "4",
              }}
              exit={{
                opacity: 0,
                x: "100%",
              }}
              style={{
                height: "1.5em",
                width: "1.5em",
                backgroundColor: pickColor(presenceIndicator.userPreferredName),
              }}
              className={tw`rounded-full flex justify-center mr-3 font-medium`}
              key={index}
            >
              {presenceIndicator.userPreferredName.charAt(0).toUpperCase()}
            </motion.div>
          </AnimatePresence>
        ))}
    </div>
  );
}
