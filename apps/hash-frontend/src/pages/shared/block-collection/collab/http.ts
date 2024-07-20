import { StatusError } from "./status-error";

const makePlain = (html?: string | null | undefined) => {
  const elt = document.createElement("div");

  elt.innerHTML = html ?? "";

  return elt.textContent?.replace(/\n[^]*|\s+$/g, "") ?? "";
};

/**
 * @deprecated
 * @todo Remove.
 */
export type AbortingPromise<T> = Promise<T> & { abort: () => void };

// A simple wrapper for XHR.
/**
 * @todo Use signal.
 * @todo Replace with fetch.
 */
export const req = (
  config: {
    method: string;
    url: string;
    headers?: Record<string, string>;

    // @todo type body
    body?: string;
  },
  onAbort?: VoidFunction,
): AbortingPromise<string> => {
  const request = new XMLHttpRequest();
  let aborted = false;
  let finished = false;

  return Object.assign(
    new Promise<string>((resolve, reject) => {
      request.open(config.method, config.url, true);
      request.withCredentials = true;
      request.addEventListener("load", () => {
        if (aborted) {
          return;
        }
        if (request.status < 400) {
          finished = true;
          resolve(request.responseText);
        } else {
          let text = request.responseText;

          if (
            text &&
            (request.getResponseHeader("content-type") ?? "").includes('html')
          ) {
            text = makePlain(text);
          }
          const error = new StatusError(
            request.status,
            `Request failed: ${request.statusText}${text ? `\n\n${text}` : ""}`,
          );

          finished = true;
          reject(error);
        }
      });
      request.addEventListener("error", () => {
        if (!aborted) {
          finished = true;
          reject(new Error("Network error"));
        }
      });
      if (config.headers) {
        for (const header of Object.keys(config.headers)) {
          request.setRequestHeader(header, config.headers[header]!);
        }
      }
      request.send(config.body ?? null);
    }),
    {
      abort() {
        if (!aborted && !finished) {
          request.abort();
          onAbort?.();
          aborted = true;
        }
      },
    },
  );
};

export const GET = (url: string) => req({ url, method: "GET" });

// @todo type body
export const POST = (
  url: string,
  body: string,
  type: string,
  onAbort?: VoidFunction,
) =>
  req(
    { url, method: "POST", body, headers: { "Content-Type": type } },
    onAbort,
  );
