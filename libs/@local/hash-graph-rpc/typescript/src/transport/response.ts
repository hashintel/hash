import { PayloadSize, TransportVersion } from "./request";

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
