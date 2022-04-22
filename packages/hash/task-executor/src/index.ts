import express from "express";
import { json } from "body-parser";
import { readFileSync } from "fs";
import { executeTask } from "./execution";
import { GithubIngestor } from "./tasks/source-github";

const port = 5010;

const app = express();
app.use(json());

app.get("/python", (_, res) => {
  executeTask("python", ["-m", "src.tasks.demo"])
    .then((result) => res.status(200).json(result))
    .catch((err) => res.status(500).json(err));
});

app.get("/github/spec", (_, res) => {
  new GithubIngestor()
    .runSpec()
    .then((result) => res.status(200).send(JSON.stringify(result)))
    .catch((err) => res.status(500).json({ error: err.toString() }));
});

app.get("/github/check", (_, res) => {
  const config = JSON.parse(
    readFileSync(
      `${process.cwd()}/src/tasks/source-github/secrets/config.json`,
    ).toString(),
  );
  new GithubIngestor()
    .runCheck(config)
    .then((result) => res.status(200).send(JSON.stringify(result)))
    .catch((err) => {
      res.status(500).json({ error: err.toString() });
    });
});

app.get("/github/discover", (_, res) => {
  const config = JSON.parse(
    readFileSync(
      `${process.cwd()}/src/tasks/source-github/secrets/config.json`,
    ).toString(),
  );
  new GithubIngestor()
    .runDiscover(config)
    .then((result) => res.status(200).send(JSON.stringify(result)))
    .catch((err) => res.status(500).json({ error: err.toString() }));
});

app.get("/github/read", (_, res) => {
  const config = JSON.parse(
    readFileSync(
      `${process.cwd()}/src/tasks/source-github/secrets/config.json`,
    ).toString(),
  );
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
