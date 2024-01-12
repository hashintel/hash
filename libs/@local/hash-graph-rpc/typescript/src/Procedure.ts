import { ProcedureId, ServiceId } from "./transport/common";
import * as S from "@effect/schema/Schema";

import { Request, RequestHeader } from "./transport/request";
import { ResponseFrom } from "./transport/response";

export const Id = ProcedureId;

export const EncodingContext = RequestHeader.pipe(S.pick("actor"));
export interface EncodingContextFrom
  extends S.Schema.From<typeof EncodingContext> {}

export interface Procedure<
  S extends ServiceId,
  P extends ProcedureId,
  Req,
  Res,
> {
  service: S;
  procedure: P;

  request: S.Schema<readonly [EncodingContextFrom, Req], Request>;
  response: S.Schema<ResponseFrom, Res>;
}
