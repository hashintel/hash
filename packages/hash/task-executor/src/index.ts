import { createServer, IncomingMessage, ServerResponse } from "http";
import { executeTask } from "./execution";

const port = 5010;

const requestHandler = async (
  request: IncomingMessage,
  response: ServerResponse,
) => {
  const url = request.url;
  let result = "Fallback response";
  try {
    if (url === "/python") {
      result = await executeTask("python", ["-m", "src.tasks.demo"]);
    }
  } catch (err: any) {
    console.log(err);
    response.statusCode = 500;
    response.end(err.toString());
    return;
  }

  response.end(result);
};

const server = createServer(requestHandler);

server.on("error", (err) => {
  console.error(`Error occurred: ${err}`);
});

server.listen(port, () => {
  console.log(`Server is listening on ${port}`);
});
