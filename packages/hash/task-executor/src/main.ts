import { readFileSync, writeFileSync } from "node:fs";

import { json } from "body-parser";
import express from "express";

import { ConfiguredAirbyteCatalog } from "./airbyte/protocol";
import { executeTask } from "./execution";
import { GithubIngestor } from "./tasks/source-github";

/** @todo - Could be from env-var */
const port = 5010;

const app = express();
app.use(json());

// eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- @todo potentially improve logic and move the function to a shared package
const stringifyError = (error: unknown) => `${error}`;

app.post("/python", (_, res) => {
  executeTask("python", ["-m", "src.tasks.demo"])
    .then((result) => res.status(200).json(result))
    .catch((error) => res.status(500).json(error));
});

app.post("/github/spec", (_, res) => {
  new GithubIngestor()
    .runSpec()
    .then((result) => res.status(200).json(result))
    .catch((error) => res.status(500).json({ error: stringifyError(error) }));
});

app.post("/github/check", (req, res) => {
  const config = req.body as unknown;
  new GithubIngestor()
    .runCheck(config)
    .then((result) => res.status(200).json(result))
    .catch((error) => {
      res.status(500).json({ error: stringifyError(error) });
    });
});

app.post("/github/discover", (req, res) => {
  const config = req.body as unknown;
  new GithubIngestor()
    .runDiscover(config)
    .then((result) => {
      const configuredCatalog: ConfiguredAirbyteCatalog = {
        streams: result.map((airbyteStream) => {
          return {
            stream: airbyteStream,
            sync_mode:
              "full_refresh" /** @todo - We don't want to always default to this */,
            destination_sync_mode:
              "overwrite" /** @todo - This doesn't matter right now as we haven't built a destination connector */,
          };
        }),
      };

      /** @todo - This should be configurable by the user, and we shouldn't just write it to disk like this */
      writeFileSync(
        `${process.cwd()}/src/tasks/source-github/secrets/catalog.json`,
        JSON.stringify(configuredCatalog),
      );
      res.status(200).json(result);
    })
    .catch((error) => res.status(500).json({ error: stringifyError(error) }));
});

app.post("/github/read", (req, res) => {
  const config = req.body as unknown;
  // Can be replaced with readJsonSync from fs-extra
  const configuredCatalog = JSON.parse(
    readFileSync(
      `${process.cwd()}/src/tasks/source-github/secrets/catalog.json`,
      "utf8",
    ),
  ) as ConfiguredAirbyteCatalog;
  new GithubIngestor()
    .runRead(config, configuredCatalog)
    .then((result) => res.status(200).json(result))
    .catch((error) => res.status(500).json({ error: stringifyError(error) }));
});

app.listen(port, () => console.log(`Listening on port ${port}...`));
