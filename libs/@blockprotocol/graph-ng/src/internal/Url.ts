import * as S from "@effect/schema/Schema";

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
);

export type Url = S.Schema.To<typeof Url>;
