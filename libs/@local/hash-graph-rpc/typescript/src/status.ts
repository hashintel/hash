import * as S from "@effect/schema/Schema";
import { Either } from "effect";

export const Result = <OkFrom, OkTo, ErrFrom, ErrTo>(
  Ok: S.Schema<OkFrom, OkTo>,
  Err: S.Schema<ErrFrom, ErrTo>,
) =>
  S.transform(
    S.union(
      S.struct({
        Ok,
      }),
      S.struct({
        Err,
      }),
    ),
    S.eitherFromSelf(S.to(Err), S.to(Ok)),
    (value) => {
      if ("Ok" in value) {
        return Either.right(value.Ok);
      } else {
        return Either.left(value.Err);
      }
    },
    (value) => {
      return Either.match(value, {
        onLeft: (err) => ({ Err: err }),
        onRight: (ok) => ({ Ok: ok }),
      });
    },
  );

// eslint-disable-next-line id-length
export const Status = <DTo, DFrom>(D: S.Schema<DTo, DFrom>) =>
  S.struct({
    // TODO: for now not typed because I couldn't be bothered
    status: S.string,
    message: S.optional(S.string),
    contents: S.array(D),
  });

export const Error = Status(S.any);
export interface Error extends S.Schema.To<typeof Error> {}
export interface ErrorFrom extends S.Schema.From<typeof Error> {}

export const RpcResult = <OkTo, OkFrom>(Ok: S.Schema<OkTo, OkFrom>) =>
  Result(Ok, Error);
