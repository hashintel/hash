/**
 * This file contains the input and output types for the template agent.
 * These types define the input and output of the agent, and can be adjusted as
 * needed for new agents.
 *
 * These types MUST be called `Input` and `Output`
 */

type Message = {
  type: "AIMessage" | "HumanMessage";
  content: string;
};

export type Input = {
  /** React app prompt to generate */
  messages: Message[];
};

export type Output = {
  /** Generated code result */
  messages: Message[];
};
