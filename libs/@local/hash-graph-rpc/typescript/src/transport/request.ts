import { Brand } from "@local/advanced-types/brand";
import { Writer } from "./writer";

// currently unused
export interface RequestFlags extends Record<string, never> {}

export type TransportVersion = Brand<number, "TransportVersion">;
export type ServiceVersion = Brand<number, "ServiceVersion">;

export interface Version {
  transport: TransportVersion;
  service: ServiceVersion;
}

export type ServiceId = Brand<number, "ServiceId">;
export type ProcedureId = Brand<number, "ProcedureId">;
export type ActorId = Brand<Uint8Array, "ActorId">;
export type PayloadSize = Brand<number, "Size">;

export interface RequestHeader {
  flags: RequestFlags;
  version: Version;

  service: ServiceId;
  procedure: ProcedureId;

  actor: ActorId;
  size: PayloadSize;
}

export interface Request {
  header: RequestHeader;
  body: Uint8Array;
}

function writeRequestHeader(writer: Writer, header: RequestHeader) {
  writer.writeByte(header.version.transport);

  // flags (currently unused)
  writer.writeByte(0x00);
  writer.writeByte(0x00);

  writer.writeByte(header.version.service);

  writer.writeVarUInt(header.service);
  writer.writeVarUInt(header.procedure);

  writer.writeBytes(header.actor);
  writer.writeVarUInt(header.size);
}

export function writeRequest(request: Request): Uint8Array {
  const writer = new Writer();

  writeRequestHeader(writer, request.header);
  writer.writeBytes(request.body);

  return writer.getBytes();
}
