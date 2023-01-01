import { StatusError } from "./status-error";

const makePlain = (html?: string | null | undefined) => {
  const elt = document.createElement("div");
  elt.innerHTML = html ?? "";
  return elt.textContent?.replace(/\n[^]*|\s+$/g, "") ?? "";
};

/**
 * @deprecated
 * @todo remove
 */
export type AbortingPromise<T> = Promise<T> & { abort: () => void };

// A simple wrapper for XHR.
/**
 * @todo use signal
 * @todo replace with fetch
 */
export const req = (
  conf: {
    method: string;
    url: string;
    headers?: Record<string, string>;

    // @todo type body
    body?: any;
  },
  onAbort?: VoidFunction,
): AbortingPromise<string> => {
  const request = new XMLHttpRequest();
  let aborted = false;
  let finished = false;

  return Object.assign(
    new Promise<string>((resolve, reject) => {
      request.open(conf.method, conf.url, true);
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
            /html/.test(request.getResponseHeader("content-type") ?? "")
          ) {
            text = makePlain(text);
          }
          const err = new StatusError(
            request.status,
            `Request failed: ${request.statusText}${text ? `\n\n${text}` : ""}`,
          );
          finished = true;
          reject(err);
        }
      });
      request.addEventListener("error", () => {
        if (!aborted) {
          finished = true;
          reject(new Error("Network error"));
        }
      });
      if (conf.headers) {
        for (const header of Object.keys(conf.headers)) {
          request.setRequestHeader(header, conf.headers[header]!);
        }
      }
      request.send(conf.body || null);
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
  body: any,
  type: string,
  onAbort?: VoidFunction,
) =>
  req(
    { url, method: "POST", body, headers: { "Content-Type": type } },
    onAbort,
  );
