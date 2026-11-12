import { readdirSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { describe, expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../../test/scripted-model";
import { hashPromptExtension, hashSystemPromptFile } from "./prompt";
import {
  activateSkillText,
  hashSkills,
  hashSkillsDirectory,
  hashSkillsExtension,
  readSkillResource,
  renderSkillCatalogue,
  skillResourcePath,
} from "./skills";

const context = BACKGROUND_CONTEXT;

/** Brunch's HASH agent's own guidance, which the copies must equal until cutover. */
const brunchHashAgent = new URL(
  "../../../../brunch-agent/src/agents/hash/",
  import.meta.url,
);

/** Every file under `directory`, by relative path. */
const filesUnder = (directory: URL) => {
  const root = fileURLToPath(directory);
  return Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = `${entry.parentPath}/${entry.name}`;
        return [relative(root, path), readFileSync(path, "utf8")] as const;
      })
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );
};

const skill = (name: string) => {
  const found = hashSkills.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No skill ${name}.`);
  return found;
};

describe("HASH's guidance copies", () => {
  test("equal Brunch's prompt and skill files, path for path (drift)", () => {
    expect(readFileSync(hashSystemPromptFile, "utf8")).toBe(
      readFileSync(new URL("prompts/system.md", brunchHashAgent), "utf8"),
    );
    const copies = filesUnder(hashSkillsDirectory);
    expect(Object.keys(copies).length).toBeGreaterThan(0);
    expect(copies).toEqual(filesUnder(new URL("skills/", brunchHashAgent)));
  });
});

describe("HASH's skills", () => {
  test("are Brunch's four, in its mounting order, with Flue's packaged IDs", () => {
    // Flue's `buildPackagedSkill` over Brunch's directories gave these IDs;
    // when a skill's files change, rerun it and update them with the copies.
    expect(hashSkills.map(({ id }) => id)).toEqual([
      "skill:eliciting:17fa6b7ae9872d86",
      "skill:modelling:58721049949230ef",
      "skill:petrinaut:9f13e866ca63ab9d",
      "skill:hash-graph:d0aee672e09c5792",
    ]);
  });

  test("activate_skill(petrinaut) returns Flue's packaged skill prompt", () => {
    const raw = readFileSync(
      new URL("petrinaut/SKILL.md", hashSkillsDirectory),
      "utf8",
    );
    const body = raw.slice(raw.indexOf("\n---\n") + "\n---\n".length).trim();
    expect(activateSkillText(hashSkills, "petrinaut")).toBe(
      [
        'Run the skill named "petrinaut".',
        "",
        "<skill_instructions>",
        body,
        "</skill_instructions>",
        "",
        "Supporting skill resources are available but are not loaded into context unless needed:",
        "<skill_resources>",
        "- references/docs.md → read_skill_resource /.flue/packaged-skills/skill%3Apetrinaut%3A9f13e866ca63ab9d/references/docs.md",
        "- references/examples.md → read_skill_resource /.flue/packaged-skills/skill%3Apetrinaut%3A9f13e866ca63ab9d/references/examples.md",
        "- references/experiments.md → read_skill_resource /.flue/packaged-skills/skill%3Apetrinaut%3A9f13e866ca63ab9d/references/experiments.md",
        "</skill_resources>",
      ].join("\n"),
    );
    // A skill without resources has no resource block.
    expect(activateSkillText(hashSkills, "eliciting")).toMatch(
      /<\/skill_instructions>$/,
    );
  });

  test("activate_skill on an unknown name lists the skills, as Flue does", () => {
    expect(activateSkillText(hashSkills, "nets")).toBe(
      'Skill "nets" is not available. Available skills: eliciting, modelling, petrinaut, hash-graph.',
    );
  });

  test("read_skill_resource returns each advertised file, and pages as Flue's read does", () => {
    for (const { id, files } of hashSkills) {
      for (const [filePath, content] of Object.entries(files)) {
        const path = skillResourcePath(id, filePath);
        expect(readSkillResource(hashSkills, { path })).toEqual({
          text: content,
          path,
          lines: content.split("\n").length,
        });
        // Without the leading slash, and with the ID unencoded.
        expect(
          readSkillResource(hashSkills, { path: path.slice(1) }).text,
        ).toBe(content);
        expect(
          readSkillResource(hashSkills, {
            path: `/.flue/packaged-skills/${id}/${filePath}`,
          }).text,
        ).toBe(content);
      }
    }
    const { id, files } = skill("eliciting");
    const lines = (files["SKILL.md"] ?? "").split("\n");
    const path = skillResourcePath(id, "SKILL.md");
    expect(
      readSkillResource(hashSkills, { path, offset: 3, limit: 2 }).text,
    ).toBe(lines.slice(2, 4).join("\n"));
    expect(readSkillResource(hashSkills, { path, limit: 2 }).text).toBe(
      lines.slice(0, 2).join("\n"),
    );
    expect(() =>
      readSkillResource(hashSkills, { path, offset: lines.length + 1 }),
    ).toThrow(
      `Offset ${lines.length + 1} is beyond end of file (${lines.length} lines total)`,
    );
    expect(() =>
      readSkillResource(hashSkills, {
        path: "/.flue/packaged-skills/skill%3Aeliciting%3A0/SKILL.md",
      }),
    ).toThrow(
      "[flue] Packaged skill file not found: /.flue/packaged-skills/skill%3Aeliciting%3A0/SKILL.md",
    );
  });

  test("the catalogue renders Flue's Available Skills block", () => {
    expect(renderSkillCatalogue(hashSkills)).toBe(
      [
        "## Available Skills",
        "",
        "The following skills provide specialized instructions for specific tasks. When a task matches a skill description, call the `activate_skill` tool with that skill name before proceeding so its full instructions are loaded. Skill instructions and supporting resources stay lazy until activation or explicit file reads.",
        "",
        ...hashSkills.map(
          ({ name, description }) => `- **${name}** — ${description}`,
        ),
      ].join("\n"),
    );
    expect(skill("hash-graph").description).toBe(
      "Reading the USER's HASH graph. Use before asking the USER for a fact their organisation may already record (a supplier, product, site, machine, role or figure), and before any HASH read.",
    );
  });

  test("a Harness offers the two tools with H0c's schemas, sends the prompt and catalogue, and runs the tools", async () => {
    const petrinaut = skill("petrinaut");
    const docsPath = skillResourcePath(petrinaut.id, "references/docs.md");
    const requests: string[] = [];
    let toolResults: unknown[] = [];
    const { models, model } = scriptedModel([
      (request) => {
        requests.push(JSON.stringify(request));
        return fauxAssistantMessage(
          [
            fauxToolCall(
              brunchTools.activateSkill,
              { name: "petrinaut" },
              { id: "activate" },
            ),
            fauxToolCall(
              brunchTools.readSkillResource,
              { path: docsPath },
              { id: "read" },
            ),
          ],
          { stopReason: "toolUse" },
        );
      },
      (request) => {
        requests.push(JSON.stringify(request));
        toolResults = request.messages.filter(
          (message) => message.role === "toolResult",
        );
        return fauxAssistantMessage("Done.");
      },
    ]);
    const registry = createRegistry();
    registry.install(hashPromptExtension);
    registry.install(hashSkillsExtension);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    const root = await harness.root(context, {
      agent: { extensions: [hashPromptExtension, hashSkillsExtension], model },
    });
    const submission = await root.submit(
      { type: "input", content: "Build me a net." },
      context,
    );
    expect((await submission.wait(context)).status).toBe("done");
    await harness.close(context);

    const [first] = requests;
    expect(first).toContain(
      JSON.stringify(renderSkillCatalogue(hashSkills)).slice(1, -1),
    );
    expect(first).toContain(
      JSON.stringify(
        readFileSync(hashSystemPromptFile, "utf8").trim().slice(0, 80),
      ).slice(1, -1),
    );
    expect(first).toContain(
      JSON.stringify({
        name: brunchTools.activateSkill,
        description:
          "Load the full instructions for one available skill before performing work that matches its description. Supporting resources remain lazy until explicitly read.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the skill to activate",
            },
          },
          required: ["name"],
        },
      }).slice(1, -1),
    );
    expect(first).toContain(
      JSON.stringify({
        name: brunchTools.readSkillResource,
        description:
          "Read a packaged skill supporting file by its advertised path.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file to read" },
            offset: {
              type: "number",
              description: "Line number to start from (1-indexed)",
            },
            limit: {
              type: "number",
              description: "Maximum number of lines to read",
            },
          },
          required: ["path"],
        },
      }).slice(1, -1),
    );
    expect(toolResults).toMatchObject([
      {
        toolCallId: "activate",
        isError: false,
        content: [
          { type: "text", text: activateSkillText(hashSkills, "petrinaut") },
        ],
      },
      {
        toolCallId: "read",
        isError: false,
        content: [
          { type: "text", text: petrinaut.files["references/docs.md"] },
        ],
      },
    ]);
  });
});
