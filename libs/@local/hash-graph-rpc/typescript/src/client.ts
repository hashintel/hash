import { ProcedureId, ServiceId } from "./transport/common";
import { Response } from "./transport/response";
import { Request } from "./transport/request";

export interface Procedure<
  S extends ServiceId,
  P extends ProcedureId,
  Req,
  Res,
> {
  service: ServiceId;
  procedure: ProcedureId;

  request: Req;
  response: Res;

  encode(request: Req): Request;
  decode(response: Response): Res;
}

// TODO: service builder
function defineRequest<
  const S extends ServiceId,
  const P extends ProcedureId,
  Req,
  Res,
>(
  service: S,
  procedure: P,
  request: Req,
  response: Res,
): Procedure<S, P, Req, Res> {
  class BaseRequest implements Procedure<S, P, Req, Res> {
    public readonly service = service;
    public readonly procedure = procedure;

    public readonly request = request;
    public readonly response = response;

    public encode(request: Req): Request {
      throw new Error("not implemented");
    }

    public decode(response: Response): Res {
      throw new Error("not implemented");
    }
  }

  return new BaseRequest();
}

export class Client {
  send<const S extends ServiceId, const P extends ProcedureId, Req, Res>(
    schema: Procedure<S, P, Req, Res>,
    request: Req,
  ): Res {
    throw new Error("not implemented");
  }
}

// todo: automatically generate service definitions that make use of a custom client!
