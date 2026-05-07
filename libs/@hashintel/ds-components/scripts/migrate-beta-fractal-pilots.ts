import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { camelCase, pascalCase } from "case-anything";
import * as ts from "typescript";

const BETA_DIR = path.resolve(import.meta.dirname, "../src/beta");

const DEFAULT_PILOT_COMPONENTS = ["text", "tooltip", "pagination"] as const;

type RecipeHelper = "cva" | "sva";

type PilotConfig = {
  name: string;
  suppressRecipeTypeErrors: boolean;
};

type FileMove = {
  oldPath: string;
  newPath: string;
};

type ReplaceEdit = {
  start: number;
  end: number;
  text: string;
};

const pilotConfigs = new Map<string, PilotConfig>([
  ["badge", { name: "badge", suppressRecipeTypeErrors: true }],
  ["button", { name: "button", suppressRecipeTypeErrors: true }],
  ["checkbox", { name: "checkbox", suppressRecipeTypeErrors: true }],
  ["code", { name: "code", suppressRecipeTypeErrors: true }],
  ["heading", { name: "heading", suppressRecipeTypeErrors: false }],
  ["icon", { name: "icon", suppressRecipeTypeErrors: true }],
  ["input-addon", { name: "input-addon", suppressRecipeTypeErrors: true }],
  ["kbd", { name: "kbd", suppressRecipeTypeErrors: true }],
  ["link", { name: "link", suppressRecipeTypeErrors: true }],
  ["text", { name: "text", suppressRecipeTypeErrors: false }],
  ["tooltip", { name: "tooltip", suppressRecipeTypeErrors: true }],
  ["spinner", { name: "spinner", suppressRecipeTypeErrors: true }],
  ["pagination", { name: "pagination", suppressRecipeTypeErrors: false }],
]);

function stripExtension(filePath: string): string {
  return filePath.replace(
    /\.(?:stories\.ts|recipe\.ts|story\.tsx|tsx|ts|stories|recipe)$/,
    "",
  );
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

function toRelativeModuleSpecifier(
  fromFilePath: string,
  toPathWithoutExtension: string,
) {
  const relativePath = path.relative(
    path.dirname(fromFilePath),
    toPathWithoutExtension,
  );

  if (!relativePath) {
    const targetBasename = path.basename(toPathWithoutExtension);
    return `../${targetBasename}`;
  }

  const posixPath = toPosixPath(relativePath);

  return posixPath.startsWith(".") ? posixPath : `./${posixPath}`;
}

function getModuleSpecifierSuffix(specifier: string): string {
  if (specifier.endsWith(".recipe")) {
    return ".recipe";
  }

  if (specifier.endsWith(".stories")) {
    return ".stories";
  }

  return "";
}

function applyEdits(sourceText: string, edits: ReplaceEdit[]): string {
  return edits
    .sort((left, right) => right.start - left.start)
    .reduce(
      (text, edit) =>
        `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`,
      sourceText,
    );
}

function getScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }

  return ts.ScriptKind.TS;
}

function createSourceFile(filePath: string, sourceText: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );
}

function rewriteRelativeSpecifiers(
  sourceText: string,
  oldFilePath: string,
  newFilePath: string,
  moveMap: ReadonlyMap<string, string>,
): string {
  const sourceFile = createSourceFile(oldFilePath, sourceText);
  const edits: ReplaceEdit[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const currentSpecifier = node.moduleSpecifier.text;
      if (currentSpecifier.startsWith(".")) {
        const oldResolvedPath = stripExtension(
          path.resolve(path.dirname(oldFilePath), currentSpecifier),
        );
        const newResolvedPath = moveMap.get(oldResolvedPath) ?? oldResolvedPath;
        const nextSpecifier = `${toRelativeModuleSpecifier(
          newFilePath,
          newResolvedPath,
        )}${getModuleSpecifierSuffix(currentSpecifier)}`;

        if (nextSpecifier !== currentSpecifier) {
          edits.push({
            start: node.moduleSpecifier.getStart(sourceFile) + 1,
            end: node.moduleSpecifier.getEnd() - 1,
            text: nextSpecifier,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return applyEdits(sourceText, edits);
}

function getRecipeSymbols(componentName: string, helper: RecipeHelper) {
  const componentStem = camelCase(componentName);
  const componentTypeStem = pascalCase(componentName);

  if (helper === "cva") {
    return {
      exportName: `${componentStem}Recipe`,
      typeName: `${componentTypeStem}RecipeProps`,
      definitionName: `${componentStem}RecipeDefinition`,
    };
  }

  return {
    exportName: `${componentStem}SlotRecipe`,
    typeName: `${componentTypeStem}SlotRecipeProps`,
    definitionName: `${componentStem}SlotRecipeDefinition`,
  };
}

function migrateRecipeModule(
  sourceText: string,
  componentName: string,
  suppressRecipeTypeErrors: boolean,
): string {
  const sourceFile = createSourceFile(`${componentName}.recipe.ts`, sourceText);

  let helper: RecipeHelper | null = null;
  let recipeConfigText: string | null = null;
  const preservedImports: string[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      if (
        statement.moduleSpecifier.text === "@pandacss/dev" ||
        statement.moduleSpecifier.text === "@hashintel/ds-helpers/css"
      ) {
        continue;
      }

      preservedImports.push(
        sourceText.slice(statement.pos, statement.end).trim(),
      );
      continue;
    }

    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    const declaration = statement.declarationList.declarations[0];
    if (
      !declaration ||
      !declaration.initializer ||
      !ts.isCallExpression(declaration.initializer)
    ) {
      continue;
    }

    const expressionText =
      declaration.initializer.expression.getText(sourceFile);
    if (
      expressionText !== "defineRecipe" &&
      expressionText !== "defineSlotRecipe" &&
      expressionText !== "cva" &&
      expressionText !== "sva"
    ) {
      continue;
    }

    helper =
      expressionText === "defineRecipe" || expressionText === "cva"
        ? "cva"
        : "sva";
    const firstArgument = declaration.initializer.arguments[0];
    if (!firstArgument) {
      throw new Error(`Missing recipe config in ${componentName}.recipe.ts`);
    }

    recipeConfigText = sourceText.slice(
      firstArgument.getStart(sourceFile),
      firstArgument.getEnd(),
    );
  }

  if (!helper || !recipeConfigText) {
    throw new Error(`Could not parse recipe module for ${componentName}`);
  }

  const { definitionName, exportName, typeName } = getRecipeSymbols(
    componentName,
    helper,
  );
  const nextImports = [...preservedImports];
  nextImports.push(
    `import { ${helper}, type RecipeVariantProps } from "@hashintel/ds-helpers/css";`,
  );

  const sections = [nextImports.join("\n")];
  sections.push(`const ${definitionName} = ${recipeConfigText} as const;`);

  if (suppressRecipeTypeErrors) {
    sections.push(
      "// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components\n" +
        `export const ${exportName} = ${helper}(${definitionName});`,
    );
  } else {
    sections.push(`export const ${exportName} = ${helper}(${definitionName});`);
  }

  sections.push(
    `export type ${typeName} = RecipeVariantProps<typeof ${exportName}>;`,
  );

  return `${sections.join("\n\n")}\n`;
}

function renameIdentifierReferences(
  sourceText: string,
  filePath: string,
  oldIdentifier: string,
  newIdentifier: string,
): string {
  const sourceFile = createSourceFile(filePath, sourceText);
  const edits: ReplaceEdit[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      node.text === oldIdentifier &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    ) {
      edits.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        text: newIdentifier,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return applyEdits(sourceText, edits);
}

function migrateComponentModule(
  sourceText: string,
  componentName: string,
): string {
  const legacyRecipeImportName = camelCase(componentName);

  const { exportName: nextRecipeImportName } = getRecipeSymbols(
    componentName,
    "cva",
  );
  const slotRecipeName = getRecipeSymbols(componentName, "sva").exportName;
  const recipeImportName = sourceText.includes(
    `{ ${legacyRecipeImportName} } from "@hashintel/ds-helpers/recipes"`,
  )
    ? legacyRecipeImportName
    : null;

  if (!recipeImportName) {
    return sourceText;
  }

  const usesSlotRecipe = sourceText.includes(
    `createStyleContext(${legacyRecipeImportName})`,
  );
  const nextImportName = usesSlotRecipe ? slotRecipeName : nextRecipeImportName;

  const updatedImport = `import { ${nextImportName} } from "./${componentName}.recipe";`;
  const nextSource = sourceText.replace(
    new RegExp(
      `import \\{\\s*${legacyRecipeImportName}\\s*\\} from "@hashintel/ds-helpers/recipes";`,
    ),
    updatedImport,
  );

  return renameIdentifierReferences(
    nextSource,
    `${componentName}.tsx`,
    legacyRecipeImportName,
    nextImportName,
  );
}

async function collectBetaSourceFiles(
  rootDirectory: string,
): Promise<string[]> {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  const nestedResults = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(rootDirectory, entry.name);
      if (entry.isDirectory()) {
        return collectBetaSourceFiles(entryPath);
      }

      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        return [entryPath];
      }

      return [];
    }),
  );

  return nestedResults.flat();
}

function getRootFileMoves(componentName: string): FileMove[] {
  return [
    {
      oldPath: path.join(BETA_DIR, componentName, `${componentName}.tsx`),
      newPath: path.join(BETA_DIR, `${componentName}.tsx`),
    },
    {
      oldPath: path.join(BETA_DIR, componentName, `${componentName}.recipe.ts`),
      newPath: path.join(BETA_DIR, `${componentName}.recipe.ts`),
    },
    {
      oldPath: path.join(
        BETA_DIR,
        componentName,
        `${componentName}.stories.ts`,
      ),
      newPath: path.join(BETA_DIR, `${componentName}.stories.ts`),
    },
  ];
}

async function ensureFileExists(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Expected file does not exist: ${filePath}`);
  }
}

async function migratePilots(componentNames: string[]): Promise<void> {
  const configs = componentNames.map((componentName) => {
    const config = pilotConfigs.get(componentName);
    if (!config) {
      throw new Error(`Unsupported pilot component: ${componentName}`);
    }

    return config;
  });

  const fileMoves = configs.flatMap(({ name }) => getRootFileMoves(name));
  await Promise.all(fileMoves.map(({ oldPath }) => ensureFileExists(oldPath)));

  const moveMap = new Map(
    fileMoves.map(({ oldPath, newPath }) => [
      stripExtension(oldPath),
      stripExtension(newPath),
    ]),
  );
  const betaFiles = await collectBetaSourceFiles(BETA_DIR);
  const transformedFiles = new Map<string, string>();

  for (const oldFilePath of betaFiles) {
    const newFilePath =
      fileMoves.find(({ oldPath }) => oldPath === oldFilePath)?.newPath ??
      oldFilePath;
    let nextSource = await fs.readFile(oldFilePath, "utf8");

    nextSource = rewriteRelativeSpecifiers(
      nextSource,
      oldFilePath,
      newFilePath,
      moveMap,
    );

    const recipeConfig = configs.find(
      ({ name }) =>
        oldFilePath === path.join(BETA_DIR, name, `${name}.recipe.ts`),
    );
    if (recipeConfig) {
      nextSource = migrateRecipeModule(
        nextSource,
        recipeConfig.name,
        recipeConfig.suppressRecipeTypeErrors,
      );
    }

    const componentConfig = configs.find(
      ({ name }) => oldFilePath === path.join(BETA_DIR, name, `${name}.tsx`),
    );
    if (componentConfig) {
      nextSource = migrateComponentModule(nextSource, componentConfig.name);
    }

    transformedFiles.set(newFilePath, nextSource);
  }

  await Promise.all(
    [...transformedFiles.entries()].map(async ([filePath, sourceText]) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, sourceText, "utf8");
    }),
  );

  await Promise.all(
    fileMoves.map(async ({ oldPath, newPath }) => {
      if (oldPath !== newPath) {
        await fs.unlink(oldPath);
      }
    }),
  );
}

export {
  DEFAULT_PILOT_COMPONENTS,
  getRecipeSymbols,
  migrateComponentModule,
  migrateRecipeModule,
  rewriteRelativeSpecifiers,
};

async function main() {
  const explicitComponents = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"));
  const components =
    explicitComponents.length > 0
      ? explicitComponents
      : [...DEFAULT_PILOT_COMPONENTS];

  await migratePilots(components);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
