/**
 * Listen addresses the local Brunch↔Petrinaut pair must emit and assume.
 *
 * Each port is named by an environment variable, so a second pair can run
 * beside the first. The panel derives everything it assumes about the chat
 * server from these two addresses, so setting the variables on the one command
 * that starts both keeps the pair agreeing with itself.
 *
 * `strictPort` stays on either side. It refuses a port already taken rather
 * than drifting to the next free one, which the pair cannot survive: the
 * panel's proxy would reach whatever holds the chat port, and a drifted panel
 * would serve the editor at an address nobody is watching. An explicit port is
 * honoured, an accidental clash is reported.
 */

const listenPort = (variable: string, fallback: number): number => {
  const requested = Number(process.env[variable]);
  return Number.isInteger(requested) && requested > 0 && requested < 65536
    ? requested
    : fallback;
};

export const localChatListen = {
  host: "127.0.0.1",
  port: listenPort("BRUNCH_CHAT_PORT", 4321),
  strictPort: true,
} as const;

export const localPanelListen = {
  host: "127.0.0.1",
  port: listenPort("BRUNCH_PANEL_PORT", 4915),
  strictPort: true,
} as const;

export const defaultChatOrigin = `http://${localChatListen.host}:${localChatListen.port}`;

export const petrinautLocalServer = (chatOrigin: string) => ({
  ...localPanelListen,
  proxy: {
    "/agents/chat": {
      target: chatOrigin,
      changeOrigin: false,
    },
  },
});
