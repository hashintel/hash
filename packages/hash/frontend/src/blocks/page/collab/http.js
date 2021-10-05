const makePlain = (html) => {
  const elt = document.createElement("div");
  elt.innerHTML = html;
  return elt.textContent.replace(/\n[^]*|\s+$/g, "");
};

// A simple wrapper for XHR.
export const req = (conf) => {
  const req = new XMLHttpRequest();
  let aborted = false;
  const result = new Promise((success, failure) => {
    req.open(conf.method, conf.url, true);
    req.withCredentials = true;
    req.addEventListener("load", () => {
      if (aborted) return;
      if (req.status < 400) {
        success(req.responseText);
      } else {
        let text = req.responseText;
        if (text && /html/.test(req.getResponseHeader("content-type"))) {
          text = makePlain(text);
        }
        const err = new Error(
          `Request failed: ${req.statusText}${text ? `\n\n${text}` : ""}`
        );
        err.status = req.status;
        failure(err);
      }
    });
    req.addEventListener("error", () => {
      if (!aborted) failure(new Error("Network error"));
    });
    if (conf.headers) {
      for (const header in conf.headers) {
        req.setRequestHeader(header, conf.headers[header]);
      }
    }
    req.send(conf.body || null);
  });
  result.abort = () => {
    if (!aborted) {
      req.abort();
      aborted = true;
    }
  };
  return result;
};

export const GET = (url) => req({ url, method: "GET" });

export const POST = (url, body, type) =>
  req({ url, method: "POST", body, headers: { "Content-Type": type } });
