import { CollabPosition } from "@local/hash-isomorphic-utils/collab";
import { createContext, useContext } from "react";

const CollabPositionContext = createContext<CollabPosition[]>([]);
const { Provider, Consumer } = CollabPositionContext;

const useCollabPositionContext = () => useContext(CollabPositionContext);

export {
  Consumer as CollabPositionConsumer,
  CollabPositionContext,
  Provider as CollabPositionProvider,
  useCollabPositionContext,
};
