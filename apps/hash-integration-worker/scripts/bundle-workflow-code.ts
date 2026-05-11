import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bundleWorkflowCode } from "@temporalio/worker";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

async function bundle() {
  const { code } = await bundleWorkflowCode({
    workflowsPath: require.resolve("../src/workflows"),
    workflowInterceptorModules: [
      require.resolve(
        "@local/hash-backend-utils/temporal/interceptors/workflows/sentry",
      ),
      // OTEL workflow interceptor must be in the bundle: when the
      // worker boots with `workflowBundle`, the `interceptors.workflowModules`
      // option on `Worker.create` is ignored. The interceptor is a no-op
      // when no global TracerProvider is registered, so it's safe to
      // include unconditionally.
      require.resolve(
        "@local/hash-backend-utils/temporal/interceptors/workflows/opentelemetry",
      ),
    ],
  });
  const codePath = path.join(__dirname, "../dist/workflow-bundle.js");

  await writeFile(codePath, code);
  console.log(`Bundle written to ${codePath}`);
}

bundle().catch((err) => {
  console.error(err);
  process.exit(1);
});
