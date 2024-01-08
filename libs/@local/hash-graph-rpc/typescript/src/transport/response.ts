import { PayloadSize, TransportVersion } from "./request";
import { Reader } from "./reader";

export enum ResponseError {
  DeadlineExceeded,
  ConnectionClosed,
  UnknownServiceVersion,
  UnknownService,
  UnknownProcedure,
  InvalidTransportVersion,
  InvalidPayloadSize,
  InvalidPayload,
  EncodingError,
  DecodingError,
}

export interface ResponseFlags {
  endOfStream: boolean;
  streaming: boolean;
}

export interface ResponseHeader {
  version: TransportVersion;
  flags: ResponseFlags;
  size: PayloadSize;
}

export type ResponseBody =
  | {
      body: Uint8Array;
    }
  | {
      error: ResponseError;
    };

export interface Response {
  header: ResponseHeader;
  body: ResponseBody;
}

function readFlags(reader: Reader): ResponseFlags | null {
  const flags = reader.readBytes(1);
  if (flags === null) {
    return null;
  }

  const endOfStream = (flags[1] & 0b0000_0010) === 0b0000_0010;
  const streaming = (flags[1] & 0b0000_0001) === 0b0000_0001;

  return {
    endOfStream,
    streaming,
  };
}

export function readResponse(buffer: Uint8Array): Response | null {
  const reader = new Reader(buffer);

  const version = reader.readByte();
  if (version === null) {
    return null;
  }

  // TODO: validate version

  const flags = readFlags(reader);
  if (flags === null) {
    return null;
  }

  const status = reader.readByte();
}
