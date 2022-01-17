import { motion } from "framer-motion";
import { FC } from "react";
import { tw } from "twind";

interface CollabPositionIndicatorProps {
  backgroundColor: string;
  title: string;
}

export const CollabPositionIndicator: FC<CollabPositionIndicatorProps> = ({
  backgroundColor,
  title,
  children,
}) => (
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
      backgroundColor,
    }}
    className={tw`rounded-full flex justify-center mr-2 font-medium`}
    title={title}
  >
    {children}
  </motion.div>
);
