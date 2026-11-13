import { createContext } from "react";

/**
 * Whether an end of a fusion link is being dragged. React Flow draws that as
 * a connection from the end that stays, which says nothing of what the moved
 * end may land on: a node's handles ask here.
 */
export const LinkRewiringContext = createContext(false);
