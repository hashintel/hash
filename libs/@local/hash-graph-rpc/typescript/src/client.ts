import { ProcedureId, ServiceId } from "./transport/common";

export interface Request<T> {
  service: ServiceId;
  procedure: ProcedureId;

  payload: T;
}
