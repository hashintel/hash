/* oxlint-disable eslint/no-await-in-loop -- Steps and mail polls run one after another. */
/**
 * Probe H0a: does a real HASH session reach a separate local origin, and does
 * Brunch's session middleware resolve it there?
 *
 * A stub on port 4324 mounts credentialed CORS for `http://localhost:3000`,
 * the Brunch library's `hashSessionActor` over hash-api at
 * `http://localhost:5001`, and `POST /probe` answering `{ actorKey }`.
 * Headless Chromium then fetches it from pages on the real frontend:
 *
 * 1. with no session: expects 401;
 * 2. signed in as the seeded alice: expects 200 and `hash:<webId>`;
 * 3. the same page against `http://127.0.0.1:4324`: reported, not required;
 * 4. as a newly registered account, before and after verifying its email,
 *    stopping before HASH's account setup: expects 401 both times.
 *
 * The stub logs cookie names, never values, and asks hash-api's
 * `sessionAccount` itself for each session it sees, so the evidence shows
 * what hash-api answered.
 *
 * Usage: `turbo run probe:hash-session --filter @apps/durable-agents`, with
 * the compose stack, the graph, hash-api and the frontend already running
 * from this slot, and port 4324 free. No model is called. Each run registers
 * one Kratos identity (`h0a-<timestamp>@example.com`, random password) and
 * leaves it mid-signup. It takes about 30 s.
 */
import { randomBytes } from "node:crypto";

import { type BrowserContext, chromium, type Page } from "@playwright/test";
import { Hono } from "hono";
import { cors } from "hono/cors";

import {
  type HashSessionVariables,
  hashSessionActor,
  hashSessionCookie,
  sessionAccountQuery,
  sessionCookiePair,
} from "@hashintel/brunch-agent/server";

import { serveNode } from "../../../src/server/start-durable-agents-server/serve-node";

const frontendOrigin = "http://localhost:3000";
const apiOrigin = "http://localhost:5001";
const mailslurperApiOrigin = "http://localhost:4437";
const stubPort = 4324;
const stubOrigins = {
  localhost: `http://localhost:${stubPort}`,
  loopbackAddress: `http://127.0.0.1:${stubPort}`,
};
const alice = { email: "alice@example.com", password: "password" };

type ServerRecord = {
  readonly method: string;
  readonly host: string | null;
  readonly path: string;
  readonly origin: string | null;
  readonly cookieNames: readonly string[];
  readonly sessionCookieSent: boolean;
  status?: number;
  corsResponse?: Record<string, string | null>;
  sessionAccount?: unknown;
};

const serverRecords: ServerRecord[] = [];

/** hash-api's own answer for the session, without the cookie. */
const askSessionAccount = async (cookiePair: string): Promise<unknown> => {
  const response = await fetch(new URL("graphql", `${apiOrigin}/`), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookiePair },
    body: JSON.stringify({ query: sessionAccountQuery }),
  });
  const body = (await response.json()) as {
    data?: unknown;
    errors?: readonly { extensions?: { code?: string } }[];
  };
  return body.errors
    ? { refused: body.errors.map((error) => error.extensions?.code) }
    : body.data;
};

const app = new Hono<{ Variables: HashSessionVariables }>();
app.use(async (context, next) => {
  const cookiePair = sessionCookiePair(context);
  const record: ServerRecord = {
    method: context.req.method,
    host: context.req.header("host") ?? null,
    path: context.req.path,
    origin: context.req.header("origin") ?? null,
    cookieNames: (context.req.header("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("=")[0] ?? "")
      .filter((name) => name.length > 0),
    sessionCookieSent: cookiePair !== undefined,
  };
  serverRecords.push(record);
  await next();
  record.status = context.res.status;
  record.corsResponse = Object.fromEntries(
    [
      "access-control-allow-origin",
      "access-control-allow-credentials",
      "access-control-allow-headers",
      "access-control-allow-methods",
    ].map((name) => [name, context.res.headers.get(name)]),
  );
  if (cookiePair !== undefined && context.req.method === "POST")
    record.sessionAccount = await askSessionAccount(cookiePair);
});
app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-brunch-conversation"],
  }),
);
app.use(
  hashSessionActor({
    apiOrigin,
    logWarning: (message, fields) => {
      process.stderr.write(`${JSON.stringify({ message, ...fields })}\n`);
    },
  }),
);
app.post("/probe", (context) =>
  context.json({ actorKey: context.get("hashSessionActorKey") }),
);

type BrowserFetch =
  | { readonly status: number; readonly body: string }
  | { readonly error: string };

/** The design's fetch, run in the page. */
const fetchFromPage = (page: Page, stubOrigin: string) =>
  page.evaluate(async (url): Promise<BrowserFetch> => {
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-brunch-conversation": "probe",
        },
        body: "{}",
      });
      return { status: response.status, body: await response.text() };
    } catch (error) {
      return { error: String(error) };
    }
  }, `${stubOrigin}/probe`);

type Observation = {
  readonly page: string;
  readonly browser: BrowserFetch;
  readonly server: readonly ServerRecord[];
};

const observe = async (
  page: Page,
  stubOrigin: string,
): Promise<Observation> => {
  serverRecords.splice(0);
  const browser = await fetchFromPage(page, stubOrigin);
  return {
    page: new URL(page.url()).pathname,
    browser,
    server: [...serverRecords],
  };
};

/** The session cookie as the browser stores it, without its value. */
const sessionCookieAttributes = async (context: BrowserContext) => {
  const cookie = (await context.cookies(frontendOrigin)).find(
    ({ name }) => name === hashSessionCookie,
  );
  if (cookie === undefined) return undefined;
  const { domain, path, sameSite, secure, httpOnly, expires } = cookie;
  return {
    domain,
    path,
    sameSite,
    secure,
    httpOnly,
    expires: expires > 0 ? new Date(expires * 1000).toISOString() : "session",
  };
};

/** Each `Set-Cookie` for the session, attributes only. */
const recordSetCookies = (page: Page, into: string[]) => {
  page.on("response", async (response) => {
    for (const { name, value } of await response.headersArray().catch(() => []))
      if (
        name.toLowerCase() === "set-cookie" &&
        value.startsWith(`${hashSessionCookie}=`)
      )
        into.push(
          `${new URL(response.url()).host}${new URL(response.url()).pathname}: ${hashSessionCookie}=<redacted>${value.slice(value.indexOf(";"))}`,
        );
  });
};

type MailItem = {
  readonly body?: string;
  readonly subject?: string;
  readonly toAddresses?: readonly (string | { readonly address?: string })[];
};

const verificationCode = async (email: string): Promise<string> => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailslurperApiOrigin}/mail`);
    const { mailItems = [] } = (await response.json()) as {
      mailItems?: readonly MailItem[];
    };
    for (const item of mailItems) {
      const recipients = (item.toAddresses ?? []).map((address) =>
        typeof address === "string" ? address : address.address,
      );
      const code =
        item.body?.match(
          /following code:\s*(?:<br\s*\/?>\s*)?(\d{6})/is,
        )?.[1] ?? item.body?.match(/\b(\d{6})\b/)?.[1];
      if (recipients.includes(email) && code !== undefined) return code;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  throw new Error(`No verification mail for ${email} within 15 s`);
};

const statusOf = (observation: Observation) =>
  "status" in observation.browser ? observation.browser.status : undefined;

const main = async () => {
  const stub = await serveNode(app.fetch, { port: stubPort });
  const browser = await chromium.launch();
  const results: Record<string, unknown> = {};
  const verdicts: Record<string, boolean> = {};
  try {
    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(`${frontendOrigin}/signin`);
    const noSession = await observe(anonymousPage, stubOrigins.localhost);
    results.noSession = noSession;
    verdicts.noSession401 = statusOf(noSession) === 401;
    await anonymous.close();

    const signedIn = await browser.newContext();
    const page = await signedIn.newPage();
    const aliceSetCookies: string[] = [];
    recordSetCookies(page, aliceSetCookies);
    await page.goto(`${frontendOrigin}/signin`);
    await page.fill('[placeholder="Enter your email address"]', alice.email);
    await page.fill('[placeholder="Enter your password"]', alice.password);
    await page.click("text=Submit");
    await page
      .locator("text=Get support")
      .waitFor({ state: "visible", timeout: 30_000 });
    results.aliceCookie = await sessionCookieAttributes(signedIn);
    results.aliceSetCookies = aliceSetCookies;
    const aliceSession = await observe(page, stubOrigins.localhost);
    results.aliceSession = aliceSession;
    const preflight = aliceSession.server.find(
      ({ method }) => method === "OPTIONS",
    );
    const post = aliceSession.server.find(({ method }) => method === "POST");
    verdicts.preflightSucceeded =
      preflight?.status === 204 &&
      preflight.corsResponse?.["access-control-allow-origin"] ===
        frontendOrigin &&
      preflight.corsResponse["access-control-allow-credentials"] === "true";
    verdicts.cookieReachedStub = post?.sessionCookieSent === true;
    verdicts.alice200 =
      statusOf(aliceSession) === 200 &&
      "body" in aliceSession.browser &&
      /^\{"actorKey":"hash:[^"]+"\}$/u.test(aliceSession.browser.body);

    results.aliceToLoopbackAddress = await observe(
      page,
      stubOrigins.loopbackAddress,
    );
    await signedIn.close();

    const signingUp = await browser.newContext();
    const signupPage = await signingUp.newPage();
    const signupSetCookies: string[] = [];
    recordSetCookies(signupPage, signupSetCookies);
    const email = `h0a-${Date.now()}@example.com`;
    results.signupEmail = email;
    await signupPage.goto(`${frontendOrigin}/signup`, {
      waitUntil: "networkidle",
    });
    await signupPage.fill('[placeholder="Enter your email address"]', email);
    await signupPage.fill(
      '[type="password"]',
      randomBytes(18).toString("base64url"),
    );
    const registered = signupPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/self-service/registration"),
      { timeout: 15_000 },
    );
    await signupPage.getByRole("button", { name: "Sign up" }).click();
    results.registrationStatus = (await registered).status();
    await signupPage
      .getByRole("heading", { name: "Verify your email address" })
      .waitFor({ state: "visible", timeout: 15_000 });
    results.signupCookie = await sessionCookieAttributes(signingUp);
    const unverified = await observe(signupPage, stubOrigins.localhost);
    results.signupUnverified = unverified;
    verdicts.unverified401 = statusOf(unverified) === 401;

    await signupPage.fill(
      '[placeholder="Enter your verification code"]',
      await verificationCode(email),
    );
    const accountSetup = signupPage.locator(
      "text=Thanks for confirming your account",
    );
    const waitlisted = signupPage.getByText("on the waitlist", {
      exact: false,
    });
    await accountSetup.or(waitlisted).waitFor({ timeout: 20_000 });
    results.afterVerification = (await accountSetup.isVisible())
      ? "account setup form"
      : "waitlist";
    results.signupSetCookies = signupSetCookies;
    const verified = await observe(signupPage, stubOrigins.localhost);
    results.signupVerifiedBeforeSetup = verified;
    verdicts.verifiedBeforeSetup401 = statusOf(verified) === 401;
    await signingUp.close();
  } finally {
    await browser.close();
    await stub.close();
  }
  process.stdout.write(
    `${JSON.stringify({ verdicts, results }, undefined, 2)}\n`,
  );
  if (!Object.values(verdicts).every(Boolean)) process.exitCode = 1;
};

await main();
