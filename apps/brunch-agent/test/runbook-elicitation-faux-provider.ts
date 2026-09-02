import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";

const modelId = process.env["BRUNCH_CHAT_MODEL"] ?? "claude-haiku-4-5";
const skillName = "sdcpn-modelling";
const violation = process.env["BRUNCH_RUNBOOK_FAUX_VIOLATION"];

const packagedSkillResourcePathFrom = (
  context: unknown,
  fileName: string,
): string => {
  const match = JSON.stringify(context).match(
    new RegExp(
      `/\\.flue/packaged-skills/[^"\\s\\\\]+/${fileName.replace(".", "\\.")}`,
    ),
  );
  if (match === null) {
    throw new Error(`activate_skill briefing did not advertise ${fileName}`);
  }
  return match[0];
};

const ir = (detail: string): string =>
  [
    "```runbook-ir",
    "# Runbook IR",
    "## Purpose and outcome",
    "Model weekly coatings-line scheduling decisions.",
    "## Activities, inputs, outputs, and resource usage",
    detail,
    "## Unknowns, assumptions, conflicts, and omissions",
    "Unknown: product-specific stage times.",
    "```",
  ].join("\n");

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: modelId, reasoning: true }],
});

const maybeIr = (detail: string): string =>
  violation === "missing-workpiece" ? detail : ir(detail);
const adversarialToolName =
  violation === "construction-tool"
    ? "addPlace"
    : violation === "capture-tool"
      ? "brunch_sweep"
      : violation === "unexpected-tool"
        ? "ping"
        : undefined;

faux.setResponses([
  (context: unknown) => {
    const modelRequest = JSON.stringify(context);
    for (const requiredPromptText of [
      "You are the Brunch elicitation assistant.",
      "Operational Process Modelling for SDCPN",
      "substantive elicitation, review, workpiece revision, or construction",
    ]) {
      if (!modelRequest.includes(requiredPromptText)) {
        throw new Error(`model request omitted: ${requiredPromptText}`);
      }
    }
    if (modelRequest.includes("## The role (core)")) {
      throw new Error("model request retained the legacy core prompt");
    }
    return fauxAssistantMessage(
      [
        fauxToolCall(
          "activate_skill",
          { name: skillName },
          { id: "activate-skill" },
        ),
      ],
      { stopReason: "toolUse" },
    );
  },
  (context: unknown) =>
    fauxAssistantMessage(
      [
        fauxToolCall(
          "read_skill_resource",
          {
            path: packagedSkillResourcePathFrom(
              context,
              violation === "construction-resource"
                ? "references/pn-construction.md"
                : "references/universal-elicitation.md",
            ),
          },
          { id: "read-universal-elicitation" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  (context: unknown) =>
    fauxAssistantMessage(
      [
        fauxToolCall(
          "read_skill_resource",
          {
            path: packagedSkillResourcePathFrom(
              context,
              "references/profile.md",
            ),
          },
          { id: "read-profile" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  fauxAssistantMessage([
    fauxText(
      "Walk me through the last scheduling decision that surprised you.",
    ),
  ]),
  (context: unknown) =>
    fauxAssistantMessage(
      [
        fauxToolCall(
          "read_skill_resource",
          {
            path: packagedSkillResourcePathFrom(
              context,
              "templates/workpiece.md",
            ),
          },
          { id: "read-workpiece-template" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  fauxAssistantMessage([
    fauxText(
      `What caused Line 1 to wait in that case?\n\n${maybeIr("Line 1 waited between milling and filling.")}`,
    ),
  ]),
  ...(adversarialToolName === undefined
    ? []
    : [
        fauxAssistantMessage(
          [fauxToolCall(adversarialToolName, {}, { id: "adversarial-tool" })],
          { stopReason: "toolUse" },
        ),
      ]),
  fauxAssistantMessage([
    fauxText(
      maybeIr("Line 1 waited when its mill-to-fill holding tank backed up."),
    ),
  ]),
]);

export default faux.provider;
