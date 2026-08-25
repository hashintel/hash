import { createServer } from "node:http";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import { BrunchVoiceBridge } from "@hashintel/brunch-agent-transport-aisdk/voice-bridge";

import {
  applySpeechEngineInterviewConfig,
  createElevenLabsSpeechEngineCallbacks,
} from "./elevenlabs-speech-engine.ts";

const apiKey = process.env.ELEVENLABS_API_KEY;
const speechEngineId = process.env.ELEVENLABS_SPEECH_ENGINE_ID;
if (!apiKey || !speechEngineId) {
  throw new Error(
    "ELEVENLABS_API_KEY and ELEVENLABS_SPEECH_ENGINE_ID are required.",
  );
}

const port = Number(process.env.ELEVENLABS_SPEECH_ENGINE_PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("ELEVENLABS_SPEECH_ENGINE_PORT must be a valid port.");
}

const host = process.env.ELEVENLABS_SPEECH_ENGINE_HOST ?? "127.0.0.1";
const brunchChatOrigin =
  process.env.BRUNCH_CHAT_ORIGIN ?? "http://127.0.0.1:4321";
const chatEndpoint = new URL("/api/chat", brunchChatOrigin).toString();

const bridge = new BrunchVoiceBridge({ chatEndpoint });
const callbacks = createElevenLabsSpeechEngineCallbacks({ bridge });
const elevenLabs = new ElevenLabsClient({ apiKey });

await applySpeechEngineInterviewConfig({
  speechEngine: elevenLabs.speechEngine,
  speechEngineId,
});

console.log(
  "Applied Speech Engine interview config (opening message, patient turn_v3)",
);

const httpServer = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "application/json",
    });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

// Authentication remains enabled: the SDK verifies ElevenLabs' signed JWT on
// every WebSocket upgrade before any transcript can reach Brunch.
const attachment = elevenLabs.speechEngine.attach(
  speechEngineId,
  httpServer,
  "/ws",
  callbacks,
);

await new Promise<void>((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(port, host, resolve);
});

console.log(
  `ElevenLabs Speech Engine listening on http://${host}:${port}/ws; Brunch chat is ${chatEndpoint}`,
);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await attachment.close();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown().finally(() => process.exit(0));
  });
}
