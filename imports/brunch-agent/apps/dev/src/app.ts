/**
 * The dev app's route map — the "mount" half of the thin host (spec §12.1).
 *
 * The dev app is chartered with three roles, none of them "the product"
 * (spec §12.5): the local dev loop against every plugin, the colleague-facing
 * target-gallery demo, and the diagnostic probe surface. Milestone one keeps
 * affordance renderers here rather than in a ui package.
 */

import { readFile } from 'node:fs/promises';
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { GherkinElicitor } from './agents/gherkin-elicitor.ts';
import { assetHandler } from './assets.ts';

const app = new Hono();

// One route per target agent. The gallery grows an entry per plugin; gherkin
// is the tracer that wires end-to-end first (spec §13). The path derives from
// the pinned identity — a copied literal here would let a second agent shadow
// this mount with every test still green.
app.route(`/agents/${GherkinElicitor.agentName}`, createAgentRouter(GherkinElicitor));

// The flue dev controller owns the whole request space — no fall-through to
// vite's html serving — so the ui is app-served, in dev and in production
// alike (spec §10, recorded facts).
//
// Two different files, because two different builds produce them: in dev, the
// source `index.html` whose script tag vite resolves live; in production, the
// client build's emitted `index.html`, whose script tag points at a real
// bundled asset. `@flue/vite` emits the server environment only, so that
// client build is a second, plain vite build — without it the ui tree would
// have no build coverage at all.
const uiRoot = new URL(import.meta.env.DEV ? '../' : './client/', import.meta.url);

app.get('/', async (c) => c.html(await readFile(new URL('index.html', uiRoot), 'utf8')));

// Production only: in dev, vite serves the module graph under /src. A
// wildcard, not `:file` — bundlers may emit nested asset paths.
app.get('/assets/*', assetHandler(uiRoot));

export default app;
