import type events from "node:events";

export interface ContextVariables {
  $env: Record<string, string>;
  $testId: string;
  $environment?: string;
  $dirname: string;
  target: string;
}

export interface ScenarioVariables {
  $uuid: string;
}

// @todo: Add missing types -- Currently, only the types that are used are added.
export interface RequestParams {
  headers?: Record<string, string>;
}

export interface Context<
  Vars extends Record<string, unknown> = Record<string, unknown>,
  Scenario extends Record<string, unknown> = Record<string, unknown>,
> {
  vars: Vars & ContextVariables;
  scenario: Scenario & ScenarioVariables;
}

export type BeforeRequestFn<
  Vars extends Record<string, unknown> = Record<string, unknown>,
  Scenario extends Record<string, unknown> = Record<string, unknown>,
> = (
  requestParams: RequestParams,
  context: Context<Partial<Vars>, Partial<Scenario>>,
  events: events.EventEmitter,
) => Promise<void>;

export type AfterResponseFn<
  Vars extends Record<string, unknown> = Record<string, unknown>,
  Scenario extends Record<string, unknown> = Record<string, unknown>,
> = (
  requestParams: RequestParams,
  response: Record<string, unknown>,
  context: Context<Partial<Vars>, Partial<Scenario>>,
  events: events.EventEmitter,
) => Promise<void>;

export type ActionFn<
  Vars extends Record<string, unknown> = Record<string, unknown>,
  Scenario extends Record<string, unknown> = Record<string, unknown>,
> = (
  context: Context<Partial<Vars>, Partial<Scenario>>,
  events: events.EventEmitter,
) => Promise<void>;

export type BeforeScenarioFn<
  Vars extends Record<string, unknown> = Record<string, unknown>,
  Scenario extends Record<string, unknown> = Record<string, unknown>,
> = ActionFn<Vars, Scenario>;

export type AfterScenarioFn<
  Vars extends Record<string, unknown> = Record<string, unknown>,
  Scenario extends Record<string, unknown> = Record<string, unknown>,
> = ActionFn<Vars, Scenario>;
