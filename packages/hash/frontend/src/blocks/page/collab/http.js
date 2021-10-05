const makePlain = (html) => {
  const elt = document.createElement("div");
  elt.innerHTML = html;
  return elt.textContent.replace(/\n[^]*|\s+$/g, "");
};

// A simple wrapper for XHR.
export const req = (conf) => {
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
        if (text && /html/.test(request.getResponseHeader("content-type"))) {
          text = makePlain(text);
        }
        const err = new Error(
          `Request failed: ${request.statusText}${text ? `\n\n${text}` : ""}`
        );
        err.status = request.status;
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
  result.abort = () => {
    if (!aborted) {
      request.abort();
      aborted = true;
    }
  };
  return result;
};

export const GET = (url) => req({ url, method: "GET" });

export const POST = (url, body, type) =>
  req({ url, method: "POST", body, headers: { "Content-Type": type } });
