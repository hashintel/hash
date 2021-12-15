import { createContext, useContext } from "react";
import { CollabPosition } from "@hashintel/hash-shared/collab";

const CollabPositionContext = createContext<CollabPosition[]>([]);
const { Provider, Consumer } = CollabPositionContext;

const useCollabPositionContext = () => useContext(CollabPositionContext);

export {
  Provider as CollabPositionProvider,
  Consumer as CollabPositionConsumer,
  useCollabPositionContext,
  CollabPositionContext,
};
