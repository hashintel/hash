import { v4 as uuid } from "uuid";

import { MessageFromBlockFramer, MessageFromFramedBlock } from "../types";

type PromiseFn = (val: any) => void;

const requestMap = new Map<string, { resolve: PromiseFn; reject: PromiseFn }>();

export const sendMessage = (
  message: Omit<MessageFromFramedBlock, "requestId">,
  origin: string = "*"
): Promise<any> => {
  const requestId = uuid();
  let resolve: PromiseFn | undefined;
  let reject: PromiseFn | undefined;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
    requestMap.set(requestId, { resolve, reject });
  });

  const timeout = 10_000;
  setTimeout(() => {
    reject?.(
      `Cross-frame request ${requestId} unresolved in ${
        timeout / 1000
      } seconds.`
    );
  }, timeout);

  // eslint-disable-next-line no-restricted-globals
  parent.window.postMessage({ ...message, requestId }, origin);
  return promise;
};

export const settlePromiseFromResponse = (
  response: MessageFromBlockFramer & { type: "response" }
) => {
  const { payload, requestId } = response;
  const promise = requestMap.get(requestId);
  if (!promise) {
    throw new Error(`Request with id ${requestId} not found in request map`);
  }
  if (payload.data) {
    promise.resolve(payload.data);
  } else {
    promise.reject(
      new Error(payload.error || "Request could not be fulfilled.")
    );
  }
  requestMap.delete(requestId);
};

export const crossFrameFetchFn = (url: string) =>
  sendMessage({ payload: url, type: "fetchUrl" });
