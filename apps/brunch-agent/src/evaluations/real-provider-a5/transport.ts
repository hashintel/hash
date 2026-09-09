import assert from "node:assert/strict";
import { request } from "node:https";
import { isIP } from "node:net";

import { endpoint, maxOutputTokens, modelId } from "./preflight.ts";

/** Native HTTPS only: exact host/path, TLS verification/SNI, owner-pinned IP,
 * no DNS, proxy, redirects or retries. Bytes are retained before the unchanged
 * SDK consumes them; buffering is evaluation instrumentation, not replacement. */
export const pinnedNativeRequest = async (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ip: string,
  retain: (data: { status: number; body: Buffer; latencyMs: number }) => void,
): Promise<Response> => {
  assert(isIP(ip), "Owner must approve a concrete provider IP");
  const url = input instanceof Request ? input.url : input.toString();
  assert.equal(url, endpoint);
  assert.equal(init?.method, "POST");
  assert.equal(typeof init.body, "string");
  const payload = JSON.parse(init.body as string) as {
    model: string;
    max_tokens: number;
  };
  assert.equal(payload.model, modelId);
  assert(
    Number.isSafeInteger(payload.max_tokens) &&
      payload.max_tokens > 0 &&
      payload.max_tokens <= maxOutputTokens,
  );
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let status = 0;
    let retained = false;
    const save = () => {
      if (!retained) {
        retained = true;
        retain({
          status,
          body: Buffer.concat(chunks),
          latencyMs: Date.now() - started,
        });
      }
    };
    const outgoing = request(
      endpoint,
      {
        method: "POST",
        headers: Object.fromEntries(new Headers(init.headers)),
        servername: "api.anthropic.com",
        rejectUnauthorized: true,
        agent: false,
        // Node uses all:true on newer versions. Supply exactly the approved IP.
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address: ip, family: isIP(ip) }]);
          else callback(null, ip, isIP(ip));
        },
        signal: init.signal ?? undefined,
      },
      (incoming) => {
        status = incoming.statusCode ?? 0;
        incoming.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024)
            outgoing.destroy(
              new Error("Native response exceeds evidence byte ceiling"),
            );
          else chunks.push(chunk);
        });
        incoming.on("error", (error) => {
          save();
          reject(error);
        });
        incoming.on("end", () => {
          try {
            save();
            assert(
              status < 300 || status >= 400,
              "Provider redirect refused; no follow-up request",
            );
            resolve(
              new Response(Buffer.concat(chunks), {
                status,
                headers: {
                  "content-type": String(
                    incoming.headers["content-type"] ??
                      "application/octet-stream",
                  ),
                },
              }),
            );
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    // Total deadline as well as socket inactivity: never an unbounded paid wait.
    const deadline = setTimeout(
      () => outgoing.destroy(new Error("Native request deadline exceeded")),
      90_000,
    );
    outgoing.on("close", () => clearTimeout(deadline));
    outgoing.on("error", (error) => {
      save();
      reject(error);
    });
    outgoing.end(init.body);
  });
};
