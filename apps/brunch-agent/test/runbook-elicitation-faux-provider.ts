import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";

const modelId = process.env["BRUNCH_CHAT_MODEL"] ?? "claude-haiku-4-5";
const skillName = "sdcpn-modelling";

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

faux.setResponses([
  fauxAssistantMessage(
    [
      fauxToolCall(
        "activate_skill",
        { name: skillName },
        { id: "activate-skill" },
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
            path: packagedSkillResourcePathFrom(context, "elicitation.md"),
          },
          { id: "read-elicitation" },
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
            path: packagedSkillResourcePathFrom(context, "ir-template.md"),
          },
          { id: "read-ir-template" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
  fauxAssistantMessage([
    fauxText(
      `Walk me through the last scheduling decision that surprised you.\n\n${ir("Not yet asked.")}`,
    ),
  ]),
  fauxAssistantMessage([
    fauxText(
      `What caused Line 1 to wait in that case?\n\n${ir("Line 1 waited between milling and filling.")}`,
    ),
  ]),
  fauxAssistantMessage([
    fauxText(ir("Line 1 waited when its mill-to-fill holding tank backed up.")),
  ]),
]);

export default faux.provider;
