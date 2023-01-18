import { motion } from "framer-motion";
import { FunctionComponent, ReactNode } from "react";

interface CollabPositionIndicatorProps {
  backgroundColor: string;
  title: string;
  children?: ReactNode;
}

export const CollabPositionIndicator: FunctionComponent<
  CollabPositionIndicatorProps
> = ({ backgroundColor, title, children }) => (
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
      backgroundColor,
      borderRadius: 9999,
      display: "flex",
      fontWeight: 500,
      height: "1.5em",
      justifyContent: "center",
      marginRight: "0.5rem",
      width: "1.5em",
    }}
    title={title}
  >
    {children}
  </motion.div>
);
