/** Listen addresses the local Brunch↔Petrinaut pair must emit and assume. */

export const localChatListen = {
  host: "127.0.0.1",
  port: 4321,
  strictPort: true,
} as const;

export const localPanelListen = {
  host: "127.0.0.1",
  port: 4915,
  strictPort: true,
} as const;

export const defaultChatOrigin = `http://${localChatListen.host}:${localChatListen.port}`;

export const defaultPanelOrigins = [
  `http://${localPanelListen.host}:${localPanelListen.port}`,
  `http://localhost:${localPanelListen.port}`,
] as const;

export const petrinautLocalServer = (chatOrigin: string) => ({
  ...localPanelListen,
  proxy: {
    "/api/chat": {
      target: chatOrigin,
      changeOrigin: true,
    },
  },
});
