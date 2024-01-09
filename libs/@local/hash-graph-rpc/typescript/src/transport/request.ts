import * as S from "@effect/schema/Schema";
import { Writer } from "./writer";
import {
  ActorId,
  PayloadSize,
  ProcedureId,
  ServiceId,
  ServiceVersion,
  TransportVersion,
} from "./common";

// currently unused
export const RequestFlags = S.struct({});
export interface RequestFlags extends S.Schema.To<typeof RequestFlags> {}

export const Version = S.struct({
  transport: S.number.pipe(S.fromBrand(TransportVersion)),
  service: S.number.pipe(S.fromBrand(ServiceVersion)),
});

export interface Version extends S.Schema.To<typeof Version> {}

export const RequestHeader = S.struct({
  flags: RequestFlags,
  version: Version,

  service: S.number.pipe(S.fromBrand(ServiceId)),
  procedure: S.number.pipe(S.fromBrand(ProcedureId)),

  actor: S.Uint8ArrayFromSelf.pipe(S.fromBrand(ActorId)),
  size: S.number.pipe(S.fromBrand(PayloadSize)),
});

export interface RequestHeader extends S.Schema.To<typeof RequestHeader> {}

export const Request = S.struct({
  header: RequestHeader,
  body: S.Uint8ArrayFromSelf,
});

export interface Request extends S.Schema.To<typeof Request> {}

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
