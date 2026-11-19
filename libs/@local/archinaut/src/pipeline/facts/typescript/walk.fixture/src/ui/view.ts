import { coreVersion, describeToken, type Token } from "../core";
import * as types from "../core/types";
import "../core/types";

export const render = (token: Token): string =>
  `${describeToken(token)} v${coreVersion} ${types.exposed}`;

export const label = (token: Token): string => token.kind;

const loadLater = () => import("../core");
export { loadLater };
