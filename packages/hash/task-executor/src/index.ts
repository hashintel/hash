import express from "express";
import { json } from "body-parser";
import { readFileSync, writeFileSync } from "fs";
import { executeTask } from "./execution";
import { GithubIngestor } from "./tasks/source-github";
import { ConfiguredAirbyteCatalog } from "./airbyte/protocol";

const port = 5010;

const app = express();
app.use(json());

app.post("/python", (_, res) => {
  executeTask("python", ["-m", "src.tasks.demo"])
    .then((result) => res.status(200).json(result))
    .catch((err) => res.status(500).json(err));
});

app.post("/github/spec", (_, res) => {
  new GithubIngestor()
    .runSpec()
    .then((result) => res.status(200).send(JSON.stringify(result)))
    .catch((err) => res.status(500).json({ error: err.toString() }));
});

app.post("/github/check", (req, res) => {
  const config = req.body;
  new GithubIngestor()
    .runCheck(config)
    .then((result) => res.status(200).send(JSON.stringify(result)))
    .catch((err) => {
      res.status(500).json({ error: err.toString() });
    });
});

app.post("/github/discover", (req, res) => {
  const config = req.body;
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
      res.status(200).send(JSON.stringify(result));
    })
    .catch((err) => res.status(500).json({ error: err.toString() }));
});

app.post("/github/read", (req, res) => {
  const config = req.body;
  const configuredCatalog = JSON.parse(
    readFileSync(
      `${process.cwd()}/src/tasks/source-github/secrets/catalog.json`,
    ).toString(),
  );
  new GithubIngestor()
    .runRead(config, configuredCatalog)
    .then((result) => res.status(200).send(JSON.stringify(result)))
    .catch((err) => res.status(500).json({ error: err.toString() }));
});

app.listen(port, () => console.log(`Listening on port ${port}...`));
