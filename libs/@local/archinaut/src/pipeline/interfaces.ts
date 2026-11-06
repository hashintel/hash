/**
 * Interfaces: the file that declares one defines it, and its participants
 * are every layer the facts show referencing a symbol that file defines,
 * plus the roles declared with `@participates` and the externals the config
 * names. A declared role is kept; a reference proves it.
 */

import { error, warning, type Diagnostic } from "../shared/diagnostics";

import type { ExternalConfig } from "../config";
import type { InterfaceNode, Participant } from "../model";
import type { SymbolFacts } from "./facts";
import type { InterfaceDeclaration, ParticipationDeclaration } from "./scan";

export const buildInterfaces = (options: {
  declarations: InterfaceDeclaration[];
  participations: ParticipationDeclaration[];
  externals: ExternalConfig[];
  facts: SymbolFacts;
  fileLayers: Map<string, string>;
}): { interfaces: InterfaceNode[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const declaredIds = new Set(
    options.declarations.map((declaration) => declaration.id),
  );

  for (const participation of options.participations) {
    if (!declaredIds.has(participation.interfaceId)) {
      diagnostics.push(
        error(
          participation.file,
          `@participates names \`${participation.interfaceId}\`, which no file declares with @interface`,
          participation.line,
        ),
      );
    }
  }
  for (const external of options.externals) {
    for (const participation of external.participates) {
      if (!declaredIds.has(participation.interface)) {
        diagnostics.push(
          error(
            "archinaut.config.ts",
            `external \`${external.id}\` participates in \`${participation.interface}\`, which no file declares with @interface`,
          ),
        );
      }
    }
  }

  /** File → the symbols it defines; symbol → files referencing it. */
  const definedIn = new Map<string, Set<string>>();
  const referencedFrom = new Map<string, Set<string>>();
  for (const document of options.facts.documents) {
    for (const occurrence of document.occurrences) {
      const { symbol } = occurrence;
      const map = occurrence.definition ? definedIn : referencedFrom;
      const key = occurrence.definition ? document.file : symbol;
      const value = occurrence.definition ? symbol : document.file;
      map.set(key, (map.get(key) ?? new Set<string>()).add(value));
    }
  }

  const interfaces = options.declarations.map((declaration): InterfaceNode => {
    const definedBy = options.fileLayers.get(declaration.file) ?? "";
    const participants = new Map<string, Participant>();

    // Layers proven by reference, consumers unless a declaration says otherwise.
    const proof = new Map<string, string>();
    for (const symbol of definedIn.get(declaration.file) ?? []) {
      for (const file of referencedFrom.get(symbol) ?? []) {
        const layer = options.fileLayers.get(file);
        if (layer !== undefined && layer !== definedBy && !proof.has(layer)) {
          proof.set(layer, file);
        }
      }
    }
    for (const participation of options.participations.filter(
      (entry) => entry.interfaceId === declaration.id,
    )) {
      const layer = options.fileLayers.get(participation.file);
      if (layer === undefined) {
        continue;
      }
      const evidence = proof.get(layer);
      participants.set(layer, {
        node: layer,
        role: participation.role,
        provenance: evidence === undefined ? "declared" : "type-ref",
        evidence: evidence ?? `${participation.file}:${participation.line}`,
      });
    }
    for (const [layer, file] of proof) {
      if (!participants.has(layer)) {
        participants.set(layer, {
          node: layer,
          role: "consumes",
          provenance: "type-ref",
          evidence: file,
        });
      }
    }
    for (const external of options.externals) {
      for (const participation of external.participates.filter(
        (entry) => entry.interface === declaration.id,
      )) {
        participants.set(external.id, {
          node: external.id,
          role: participation.role,
          provenance: "declared",
          evidence: external.summary,
        });
      }
    }
    if (participants.size === 0) {
      diagnostics.push(
        warning(
          declaration.file,
          `interface \`${declaration.id}\` has no participants: nothing references its symbols and nothing declares a role`,
          declaration.line,
        ),
      );
    }

    return {
      id: declaration.id,
      name: declaration.name,
      summary: declaration.summary,
      transport: declaration.transport,
      declaredIn: declaration.file,
      definedBy,
      participants: [
        {
          node: definedBy,
          role: "defines",
          provenance: "type-ref",
          evidence: declaration.file,
        },
        ...[...participants.values()].sort((left, right) =>
          left.node.localeCompare(right.node),
        ),
      ],
      tags: [],
      audience: ["contributor"],
    };
  });

  return {
    interfaces: interfaces.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    diagnostics,
  };
};
