import { Function } from "effect";
import { SymbolFlags } from "typescript/async";

import type { Symbol as $Symbol, CheckFlags } from "typescript/async";

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

/** Whether `symbol` carries `flag`, one of the flags the checker sets on the symbols it derives, such as a member of `Box<number>`. */
export const hasCheckFlag: {
  (flag: CheckFlags): (symbol: $Symbol) => boolean;
  (symbol: $Symbol, flag: CheckFlags): boolean;
} = Function.dual(
  2,
  (symbol: $Symbol, flag: CheckFlags): boolean =>
    // oxlint-disable-next-line no-bitwise -- `CheckFlags` is the compiler's bit set.
    (symbol.checkFlags & flag) !== 0,
);

/** Whether `symbol` is a module the compiler names by a path or a specifier in quotes: a file, or a module declared by its specifier. */
export const isExternalModule = (symbol: $Symbol): boolean =>
  hasFlag(symbol, SymbolFlags.Module) && symbol.name.startsWith('"');
