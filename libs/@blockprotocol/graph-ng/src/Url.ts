import * as S from "@effect/schema/Schema";

const TypeId: unique symbol = Symbol.for("@blockprotocol/graph/Url");
export type TypeId = typeof TypeId;

export const Url = S.string.pipe(
  S.nonEmpty(),
  S.filter((value) => {
    try {
      // eslint-disable-next-line no-new
      new URL(value);
      return true;
    } catch (_) {
      return false;
    }
  }),
  S.brand(TypeId),
);

export type Url = S.Schema.To<typeof Url>;
