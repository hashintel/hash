import express from "express";
import { json } from "body-parser";
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
    .catch((err) => res.status(500).send(JSON.stringify(err)));
});

app.listen(port, () => console.log(`Listening on port ${port}...`));
