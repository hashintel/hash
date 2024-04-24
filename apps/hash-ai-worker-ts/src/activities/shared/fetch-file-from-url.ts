import isDocker from "is-docker";

export const fetchFileFromUrl = async (url: string): Promise<Buffer> => {
  const urlObject = new URL(url);

  let rewrittenUrl: string | undefined = undefined;

  if (["localhost", "127.0.0.1"].includes(urlObject.hostname) && isDocker()) {
    /**
     * When the file host is `localhost` or `127.0.0.1` (i.e. the file is
     * hosted in a locally running machine), and the activity is running in a
     * docker container, we need to replace the host in the download URL with
     * `host.docker.internal` so that the docker container accesses the correct
     * host.
     */
    const rewrittenUrlObject = new URL(url);
    rewrittenUrlObject.hostname = "host.docker.internal";
    rewrittenUrl = rewrittenUrlObject.toString();
  }

  const response = await fetch(rewrittenUrl ?? url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
};
