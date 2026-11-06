import { Function } from "effect";

import type { Symbol as $Symbol, SymbolFlags } from "typescript/async";

/** Whether `symbol` carries `flag`, one of the compiler's symbol flags. */
export const hasFlag: {
  (flag: SymbolFlags): (symbol: $Symbol) => boolean;
  (symbol: $Symbol, flag: SymbolFlags): boolean;
} = Function.dual(
  2,
  (symbol: $Symbol, flag: SymbolFlags): boolean =>
    // oxlint-disable-next-line no-bitwise -- `SymbolFlags` is the compiler's bit set.
    (symbol.flags & flag) !== 0,
);
