import {
  createTap,
  CatalogJSON,
  ValidSchema,
} from "../_utils/createTap.function";
import { z } from "zod";
import { resolve } from "path";
import { readFile } from "fs/promises";
import { Octokit } from "@octokit/rest";

export const github = createTap(
  "api.github.com",
  {
    stateType: z.object({
      repos: z.record(
        z.object({
          incrementalStreams: z.record(
            z.object({
              lastSync: z.date(),
            }),
          ),
        }),
      ),
    }),
    // no state, yet
    configType: z.object({
      githubAPIKey: z.string().min(16).describe("Github Personal Access Token"),
      githubRepos: z
        .object({
          owner: z.string().min(1),
          repo: z.string().min(1),
        })
        .array()
        .describe("Github Repos"),
      githubSyncSince: z
        .date()
        .optional()
        .describe(
          "Default date to synchronize back to. Defaults to 1970 if not provided.",
        ),
    }),
  },
  {
    createDefaultState() {
      return {
        repos: {},
      };
    },
    async discover(): Promise<CatalogJSON> {
      throw new Error("not implemented");
    },
    async start({ config, initialState, addStreamWithSchema }) {
      if (config == null) {
        throw new Error("Config must be defined to provide keys.");
      }
      // if (catalog != null) {
      //   throw new Error("Github does not yet support catalog")
      // }
      const client = new Octokit({
        auth: config.githubAPIKey,
      });

      // consider automatically pulling the schema from discover...
      const issueStream = addStreamWithSchema(
        "issues",
        await getSchemaObject("issue"),
      );

      if (issueStream.selected) {
        config.githubRepos.map(async (repo) => {
          const repoKey = `${repo.owner}/${repo.repo}`;
          const initialSyncSince =
            initialState.repos[repoKey]?.incrementalStreams[issueStream.name]
              ?.lastSync ??
            config.githubSyncSince ??
            new Date(0);
          const extractedAt = new Date();
          const issues = await client.issues.listForRepo({
            ...repo,
            since: initialSyncSince.toISOString(),
          });

          issueStream.pushRecords(issues.data, extractedAt);
          issueStream.updateState((prev) => ({
            ...prev,
            repos: {
              ...prev.repos,
              [repoKey]: {
                ...prev.repos[repoKey],
                incrementalStreams: {
                  ...prev.repos[repoKey]?.incrementalStreams,
                  [issueStream.name]: {
                    ...prev.repos[repoKey]?.incrementalStreams[
                      issueStream.name
                    ],
                    lastSync: extractedAt,
                  },
                },
              },
            },
          }));
        });
      }
    },
  },
);

async function getSchemaObject(name: string): Promise<ValidSchema> {
  const content = await readFile(
    resolve(__dirname, `./gen/schemas/${name}.json`),
    "utf-8",
  );
  return new ValidSchema(JSON.parse(content));
}
