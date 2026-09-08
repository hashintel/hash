// Unpaid canonical-handle evidence only. This is NOT a browser/product runner.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { verifyArcTransitionAttempt } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";

const fromRoot = (path) => import(pathToFileURL(resolve(path)).href);
const { createBrowserTransitionRecorder, observeBrowserDefinition } =
  await fromRoot(
    "apps/petrinaut-website/src/main/app/local-storage-demo/transition-record.ts",
  );
const {
  preparedCrewReservationNet,
  dispatchCrewPlaceId,
  startFinalInspectionTransitionId,
} = await fromRoot(
  "apps/petrinaut-website/src/main/app/local-storage-demo/prepared-crew-reservation-fixture.ts",
);
const binding = {
  documentId: "a3-20260908T092946Z-test-document",
  incarnationId: "a3-20260908T092946Z-handle-incarnation",
  conversationId: "a3-20260908T092946Z-test-conversation",
};
const handle = createJsonDocHandle({
  id: binding.documentId,
  initial: preparedCrewReservationNet,
  capabilities: { disabledExtensions: [] },
});
const instance = createPetrinaut({ document: handle });
const request = {
  toolName: "addArc",
  toolCallId: "a3-20260908T092946Z-test-call",
  binding,
  requestedBaseHash: observeBrowserDefinition(handle).sha256,
  input: {
    transitionId: startFinalInspectionTransitionId,
    arcDirection: "input",
    placeId: dispatchCrewPlaceId,
    weight: 1,
    type: "standard",
  },
};
const recorder = createBrowserTransitionRecorder({
  handle,
  binding,
  requestFor: () => request,
});
let executions = 0;
const execute = () => {
  executions += 1;
  instance.mutations.addArc(request.input);
  return { applied: true, title: "Test callback: added input arc" };
};
const first = recorder.executeMutation({ ...request, execute });
const duplicate = recorder.executeMutation({ ...request, execute });
const records = recorder.records();
for (const record of records)
  for (const attempt of record.attempts)
    await verifyArcTransitionAttempt(attempt);
const attempt = records[0].attempts[0];
const save = (name, value) =>
  writeFile(
    new URL(name, import.meta.url),
    `${JSON.stringify(value, null, 2)}\n`,
  );
await Promise.all([
  save("transition-records.handle.json", {
    evidenceKind: "canonical-handle-only; not browser or product entrypoint",
    requestedBaseSource:
      "test fixture author, captured before calling the observer",
    executions,
    first,
    duplicate,
    records,
  }),
  save("canonical-pre.handle.json", attempt.pre.definition),
  save("canonical-post.handle.json", attempt.post.definition),
]);
instance.dispose();
console.log(
  JSON.stringify({
    evidenceKind: "canonical-handle-only",
    executions,
    outcome: records[0].outcome,
    attempts: records[0].attempts.length,
  }),
);
