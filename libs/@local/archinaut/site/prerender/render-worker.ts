/**
 * One prerender worker: loads the built server entry once and renders every
 * path it is sent.
 */

import { pathToFileURL } from "node:url";

import { serveWorker, workerInput } from "../../src/shared/worker-channel";

import type { RenderedPage } from "../prerender";

const { serverEntry } = workerInput<{ serverEntry: string }>();
const { render } = (await import(pathToFileURL(serverEntry).href)) as {
  render: (path: string) => Promise<RenderedPage>;
};

serveWorker<string, RenderedPage>(render);
