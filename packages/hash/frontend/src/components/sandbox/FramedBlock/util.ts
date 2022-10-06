import { v4 as uuid } from "uuid";

import { MessageFromBlockFramer, MessageFromFramedBlock } from "../types";

type PromiseFn = (val: any) => void;

const requestMap = new Map<string, { resolve: PromiseFn; reject: PromiseFn }>();

export function sendMessage<T = unknown>(
  message: Omit<MessageFromFramedBlock, "requestId">,
  origin: string = "*",
) {
  const requestId = uuid();
  const promise = new Promise<T>((resolve, reject) => {
    requestMap.set(requestId, { resolve, reject });

    const timeout = 10_000;
    setTimeout(() => {
      reject(
        new Error(
          `Cross-frame request ${requestId} unresolved in ${
            timeout / 1000
          } seconds.`,
        ),
      );
    }, timeout);
  });

  // eslint-disable-next-line no-restricted-globals
  parent.window.postMessage({ ...message, requestId }, origin);
  return promise;
}

export const settlePromiseFromResponse = (
  response: MessageFromBlockFramer & { type: "response" },
) => {
  const { payload, requestId } = response;
  const promiseSettlerFns = requestMap.get(requestId);
  if (!promiseSettlerFns) {
    throw new Error(`Request with id ${requestId} not found in request map`);
  }
  if (payload.data != null) {
    promiseSettlerFns.resolve(payload.data);
  } else {
    promiseSettlerFns.reject(
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- @todo what to do with empty error
      new Error(payload.error || "Request could not be fulfilled."),
    );
  }
  requestMap.delete(requestId);
};

export const crossFrameFetchFn = (url: string) =>
  sendMessage<string>({ payload: url, type: "fetchUrl" });
