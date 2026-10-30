// oxlint-disable-next-line typescript/triple-slash-reference -- an ambient declaration a host must see without importing it
/// <reference path="./ui/markdown-raw.d.ts" />

/**
 * `@hashintel/brunch-agent/ui`: Brunch's React client: its Petrinaut plugin,
 * assistant hook, chat, cards, ledger tab and voice controls. Ships
 * `panda.buildinfo.json` for hosts' Panda extraction.
 */

export * from "./ui/chat/ai-assistant-panel";
export * from "./ui/chat/petrinaut";
export * from "./ui/editor-api-plugin";
export * from "./ui/interview-budget/interview-budget-control";
export * from "./ui/tools/brunch-petrinaut-tools";
export * from "./ui/tools/brunch-tool-presentation";
export * from "./ui/tools/shared/document-revision";
export * from "./ui/use-brunch-assistant";
export * from "./ui/voice/session/voice-interview-control";
export * from "./ui/words/conversation-words";
