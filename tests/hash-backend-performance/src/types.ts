import type events from "node:events";

type Value =
  | boolean
  | number
  | string
  | null
  | Value[]
  | {
      [key: string]: Value;
    };

export interface ContextVariables {
  $env: Record<string, string>;
  $testId: string;
  $environment?: string;
  $dirname: string;
  target: string;
}

export interface ScenarioVariables {
  $uuid?: string;
}

// @todo: Add missing types -- Currently, only the types that are used are added.
export interface RequestParams {
  headers?: Record<string, string>;
}

export interface Context<
  Vars extends Record<string, Value | undefined> = Record<string, never>,
  Scenario extends Record<string, Value | undefined> = Record<string, never>,
> {
  vars: Vars & ContextVariables;
  scenario: Scenario & ScenarioVariables;
}

export type BeforeRequestFn<
  Vars extends Record<string, Value | undefined> = Record<string, never>,
  Scenario extends Record<string, Value | undefined> = Record<string, never>,
> = (
  requestParams: RequestParams,
  context: Context<Partial<Vars>, Partial<Scenario>>,
  events: events.EventEmitter,
) => Promise<void>;

export type AfterResponseFn<
  Vars extends Record<string, Value | undefined> = Record<string, never>,
  Scenario extends Record<string, Value | undefined> = Record<string, never>,
> = (
  requestParams: RequestParams,
  response: Record<string, unknown>,
  context: Context<Partial<Vars>, Partial<Scenario>>,
  events: events.EventEmitter,
) => Promise<void>;

export type ActionFn<
  Vars extends Record<string, Value | undefined> = Record<string, never>,
  Scenario extends Record<string, Value | undefined> = Record<string, never>,
> = (
  context: Context<Partial<Vars>, Partial<Scenario>>,
  events: events.EventEmitter,
) => Promise<void>;

export type BeforeScenarioFn<
  Vars extends Record<string, Value | undefined> = Record<string, never>,
  Scenario extends Record<string, Value | undefined> = Record<string, never>,
> = ActionFn<Vars, Scenario>;

export type AfterScenarioFn<
  Vars extends Record<string, Value | undefined> = Record<string, never>,
  Scenario extends Record<string, Value | undefined> = Record<string, never>,
> = ActionFn<Vars, Scenario>;
