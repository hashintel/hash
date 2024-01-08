import { Brand } from "effect";

export type TransportVersion = number & Brand.Brand<"TransportVersion">;
export const TransportVersion = Brand.refined<TransportVersion>(
  (value) => Number.isInteger(value) && value >= 0 && value <= 255,
  (value) =>
    Brand.error(`TransportVersion must be between 0 and 255, got ${value}`),
);

export type ServiceVersion = number & Brand.Brand<"ServiceVersion">;
export const ServiceVersion = Brand.refined<ServiceVersion>(
  (value) => Number.isInteger(value) && value >= 0 && value <= 255,
  (value) =>
    Brand.error(`ServiceVersion must be between 0 and 255, got ${value}`),
);

export type ServiceId = number & Brand.Brand<"ServiceId">;
export const ServiceId = Brand.refined<ServiceId>(
  (value) => Number.isSafeInteger(value) && value >= 0,
  (value) => Brand.error(`ServiceId must be a positive integer, got ${value}`),
);

export type ProcedureId = number & Brand.Brand<"ProcedureId">;
export const ProcedureId = Brand.refined<ProcedureId>(
  (value) => Number.isSafeInteger(value) && value >= 0,
  (value) =>
    Brand.error(`ProcedureId must be a positive integer, got ${value}`),
);

export type ActorId = Uint8Array & Brand.Brand<"ActorId">;
// validate that it is indeed a uuid, currently not done easily
export const ActorId = Brand.refined<ActorId>(
  (value) => value.length === 16,
  (value) =>
    Brand.error(`ActorId must be a 16 bytes UUID, got ${value.length}`),
);

export type PayloadSize = number & Brand.Brand<"Size">;
export const PayloadSize = Brand.refined<PayloadSize>(
  (value) => Number.isSafeInteger(value) && value >= 0,
  (value) => Brand.error(`Size must be a positive integer, got ${value}`),
);
