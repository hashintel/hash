/**
 * The two ports a persona run's Brunch pair listens on. Several worktree
 * slots run Brunch at once, so a run takes free ports unless told otherwise;
 * the panel's origin keeps the browser's stored net and settings, so a resume
 * returns to the panel port its run recorded.
 */
import { createServer } from "node:net";

import { brunchEnv } from "../../../../src/env.ts";

const host = "127.0.0.1";

const requestedPort = (value: string | undefined): number | undefined => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined;
};

/** A port free on the loopback address now, chosen by the OS. */
export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address !== null
          ? resolve(address.port)
          : reject(new Error("The OS assigned no port")),
      );
    });
  });

export interface PersonaPorts {
  readonly chat: number;
  readonly panel: number;
}

/**
 * Ports set in the environment win. Otherwise a resume reuses the panel port
 * in its recorded origin, and every other port is free when chosen.
 */
export const resolvePersonaPorts = async ({
  environment,
  resumePanelOrigin,
  choosePort = freePort,
}: {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly resumePanelOrigin?: string;
  readonly choosePort?: () => Promise<number>;
}): Promise<PersonaPorts> => {
  const fixedChat = requestedPort(environment[brunchEnv.chatPort]);
  const fixedPanel =
    requestedPort(environment[brunchEnv.panelPort]) ??
    (resumePanelOrigin === undefined
      ? undefined
      : requestedPort(new URL(resumePanelOrigin).port));
  const panel = fixedPanel ?? (await choosePort());
  let chat = fixedChat ?? (await choosePort());
  // The OS may hand back the port it just gave; only a fixed pair can clash.
  while (fixedChat === undefined && chat === panel)
    // eslint-disable-next-line no-await-in-loop -- Each choice depends on the last.
    chat = await choosePort();
  if (chat === panel)
    throw new Error(
      `${brunchEnv.chatPort} and ${brunchEnv.panelPort} must differ; both are ${chat}`,
    );
  return { chat, panel };
};

export const localOrigin = (port: number) => `http://${host}:${port}`;
