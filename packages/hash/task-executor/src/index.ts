import express from "express";
import { json } from "body-parser";
import { executeTask } from "./execution";

const port = 5010;

const app = express();
app.use(json());

app.get("/python", (_, res) => {
  executeTask("python", ["-m", "src.tasks.demo"])
    .then((result) => res.status(200).json(result))
    .catch((err) => res.status(500).json(err));
});

app.listen(port, () => console.log(`Listening on port ${port}...`));
