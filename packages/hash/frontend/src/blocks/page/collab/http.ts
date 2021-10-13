import { StatusError } from "./StatusError";

const makePlain = (html?: string | null | void) => {
  const elt = document.createElement("div");
  elt.innerHTML = html ?? "";
  return elt.textContent?.replace(/\n[^]*|\s+$/g, "") ?? "";
};

// A simple wrapper for XHR.
/**
 * @todo use signal
 * @todo replace with fetch
 */
export const req = (conf: {
  method: string;
  url: string;
  headers?: Record<string, string>;

  // @todo type body
  body?: any;
}) => {
  const request = new XMLHttpRequest();
  let aborted = false;
  const result = new Promise((success, failure) => {
    request.open(conf.method, conf.url, true);
    request.withCredentials = true;
    request.addEventListener("load", () => {
      if (aborted) return;
      if (request.status < 400) {
        success(request.responseText);
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
          `Request failed: ${request.statusText}${text ? `\n\n${text}` : ""}`
        );
        failure(err);
      }
    });
    request.addEventListener("error", () => {
      if (!aborted) failure(new Error("Network error"));
    });
    if (conf.headers) {
      for (const header of Object.keys(conf.headers)) {
        request.setRequestHeader(header, conf.headers[header]);
      }
    }
    request.send(conf.body || null);
  });

  // @todo don't do this – use signal
  return {
    ...result,
    abort: () => {
      if (!aborted) {
        request.abort();
        aborted = true;
      }
    },
  };
};

export const GET = (url: string) => req({ url, method: "GET" });

// @todo type body
export const POST = (url: string, body: any, type: string) =>
  req({ url, method: "POST", body, headers: { "Content-Type": type } });
