import { instrument } from "./instrument.mjs";

if (!("__monacoBench" in globalThis)) instrument();

const { mountApp } = await import("./app.tsx");
mountApp();
