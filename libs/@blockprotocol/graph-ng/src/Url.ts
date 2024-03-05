import * as S from "@effect/schema/Schema";

export const TypeId = Symbol.for("@blockprotocol/graph/Url");
export type TypeId = typeof TypeId;

export const Schema = S.string.pipe(
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

export type Schema = S.Schema.To<typeof Schema>;
