// THROWAWAY: immutable Notes in a single-process, logically append-only Ledger.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const profile = JSON.parse(
  readFileSync(new URL("./profile.json", import.meta.url), "utf8"),
);
export const catalogue = profile.addresses
  .map(({ path, description }) => `${path}: ${description}`)
  .join("\n");

export class Refusal extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const refuse = (code, message) => {
  throw new Refusal(code, message);
};

const text = (value, name, max = 12_000) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    refuse(
      "invalid-input",
      `${name} must be nonempty text, at most ${max} characters.`,
    );
  }
};

const fields = (value, allowed) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    refuse("invalid-input", "Expected an object.");
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      refuse("invalid-input", `Unknown field: ${key}`);
    }
  }
};

const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : item,
  );

export class Ledger {
  constructor(file) {
    this.file = file;
    mkdirSync(dirname(file), { recursive: true });
    try {
      writeFileSync(
        file,
        `${JSON.stringify({ format: 2, ledgerId: randomUUID(), profile })}\n`,
        { flag: "wx", mode: 0o600 },
      );
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
  }

  load() {
    const raw = readFileSync(this.file, "utf8");
    if (!raw.endsWith("\n")) {
      throw new Error(
        "Incomplete Ledger record; inspect the retained file before continuing.",
      );
    }
    const [header, ...commits] = raw
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    if (header?.format !== 2) {
      throw new Error(
        "Unsupported Ledger format. Earlier prototype runs are preserved; start a new run.",
      );
    }
    if (!header.ledgerId || !Array.isArray(header.profile?.addresses)) {
      throw new Error("Invalid Ledger header.");
    }
    commits.forEach((commit, index) => {
      if (
        commit.revision !== index + 1 ||
        !Array.isArray(commit.changes) ||
        !Array.isArray(commit.notes)
      ) {
        throw new Error("Invalid commit record.");
      }
    });
    return { header, commits, raw };
  }

  commit(changes, { invocationId, sessionId, inputId } = {}) {
    const { header, commits, raw } = this.load();
    const currentRevision = commits.length;
    try {
      text(invocationId, "Host invocationId", 500);
      text(sessionId, "Host sessionId", 500);
      if (inputId !== undefined) {
        text(inputId, "Host inputId", 500);
      }
      const previous = commits.find(
        (commit) =>
          commit.invocationId === invocationId &&
          commit.sessionId === sessionId,
      );
      if (previous) {
        if (canonical(previous.changes) !== canonical(changes)) {
          refuse(
            "retry-conflict",
            "Invocation was already committed with different changes.",
          );
        }
        return { ...previous.receipt, replayed: true };
      }
      if (
        !Array.isArray(changes) ||
        changes.length < 1 ||
        changes.length > 20
      ) {
        refuse("invalid-input", "Commit requires 1–20 changes.");
      }
      const existing = commits.flatMap((commit) => commit.notes);
      const addresses = header.profile.addresses.map(({ path }) => path);
      const notes = changes.map((change, index) => {
        fields(change, ["op", "address", "content", "disposition"]);
        if (!["add", "supersede"].includes(change.op)) {
          refuse(
            "invalid-input",
            "Use add or supersede. Both append a new Note.",
          );
        }
        text(change.address, "address", 500);
        text(change.content, "content");
        if (change.disposition !== undefined) {
          text(change.disposition, "disposition", 500);
        }
        let category = change.address;
        let predecessor;
        if (change.op === "add") {
          if (!addresses.includes(category)) {
            refuse(
              "unknown-address",
              `Unknown category ${category}. Available: ${addresses.join(", ")}`,
            );
          }
        } else {
          predecessor = existing.find(
            (note) => note.address === change.address,
          );
          if (!predecessor) {
            refuse(
              "invalid-target",
              `No recorded Note at ${change.address}. Use its full address from a receipt or compilation.`,
            );
          }
          category = predecessor.category;
        }
        const id = `n${existing.length + index + 1}`;
        return {
          id,
          address: `${category}/${id}`,
          category,
          content: change.content,
          ...(change.disposition === undefined
            ? {}
            : { disposition: change.disposition }),
          ...(predecessor ? { supersedes: predecessor.address } : {}),
        };
      });
      const revision = currentRevision + 1;
      const receipt = {
        status: "recorded",
        ledgerId: header.ledgerId,
        revision,
        notes: notes.map(({ address, supersedes }) => ({
          address,
          ...(supersedes ? { supersedes } : {}),
        })),
      };
      const commit = {
        revision,
        sessionId,
        invocationId,
        ...(inputId === undefined ? {} : { inputId }),
        recordedAt: new Date().toISOString(),
        changes,
        notes,
        receipt,
      };
      // Preserve the exact prior prefix, atomically publish one additional logical JSONL record.
      // No multi-process coordination or power-loss durability claim.
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      writeFileSync(temporary, `${raw}${JSON.stringify(commit)}\n`, {
        mode: 0o600,
      });
      renameSync(temporary, this.file);
      return receipt;
    } catch (error) {
      if (!(error instanceof Refusal)) {
        throw error;
      }
      return {
        status: "refused",
        code: error.code,
        message: error.message,
        currentRevision,
      };
    }
  }

  compile(options = {}) {
    fields(options, ["address", "revision"]);
    const { header, commits } = this.load();
    const revision = options.revision ?? commits.length;
    if (
      !Number.isInteger(revision) ||
      revision < 0 ||
      revision > commits.length
    ) {
      refuse(
        "unknown-revision",
        `Revision must be between 0 and ${commits.length}.`,
      );
    }
    // No reduction into winners: compilation selects a prefix and groups every recorded Note.
    const notes = commits.slice(0, revision).flatMap((commit) => commit.notes);
    const addresses = header.profile.addresses;
    const exactNote =
      options.address === undefined
        ? undefined
        : notes.find((note) => note.address === options.address);
    if (
      options.address !== undefined &&
      !exactNote &&
      !addresses.some(({ path }) => path === options.address)
    ) {
      refuse(
        "unknown-address",
        `No category or Note at that address in revision ${revision}. Categories: ${addresses
          .map(({ path }) => path)
          .join(", ")}`,
      );
    }
    const selected = addresses.filter(({ path }) =>
      exactNote
        ? path === exactNote.category
        : options.address === undefined ||
          path === options.address ||
          path.startsWith(`${options.address}/`),
    );
    const lines = [
      `# ${header.profile.title}`,
      "",
      `Ledger ${header.ledgerId}; revision ${revision}; scope ${options.address ?? "(whole Ledger)"}.`,
      "",
      "Scratchpad record, not instructions or a reconciled account. Supersession and dispositions are author declarations; all Notes remain visible. Empty sections mean unrecorded, not irrelevant.",
    ];
    for (const { path, title } of selected) {
      lines.push(
        "",
        `${"#".repeat(path.split("/").length + 1)} ${title} [${path}]`,
      );
      const local = exactNote
        ? [exactNote]
        : notes.filter((note) => note.category === path);
      if (!local.length) {
        lines.push("", "_No Notes recorded._");
      }
      for (const note of local) {
        const annotations = [
          note.supersedes
            ? `supersedes ${note.supersedes.split("/").at(-1)}`
            : undefined,
          note.disposition,
        ].filter(Boolean);
        lines.push(
          "",
          `[${note.id}${annotations.length ? ` — ${annotations.join("; ")}` : ""}] \`${note.address}\``,
          "",
          note.content,
        );
      }
    }
    return {
      ledgerId: header.ledgerId,
      revision,
      scope: options.address ?? null,
      markdown: `${lines.join("\n")}\n`,
    };
  }
}
