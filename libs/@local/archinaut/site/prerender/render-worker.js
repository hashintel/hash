// One prerender worker: loads the built server entry once and renders every
// path it is sent. Plain JavaScript, since it imports only built output.
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

const { render } = await import(pathToFileURL(workerData.serverEntry).href);

parentPort.on("message", async ({ id, path }) => {
  try {
    const page = await render(path);
    parentPort.postMessage({ id, page });
  } catch (cause) {
    parentPort.postMessage({
      id,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
});
