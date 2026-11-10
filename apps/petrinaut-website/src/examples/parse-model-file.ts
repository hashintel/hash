import { parseSDCPNFile, type SDCPN } from "@hashintel/petrinaut-core";

/**
 * The net of a bundled example model. A model ships with the build that reads
 * it, so a key that build does not define is a mistake in the model file.
 */
export const parseModelFile = (slug: string, data: unknown): SDCPN => {
  const parsed = parseSDCPNFile(data);
  if (!parsed.ok) {
    throw new Error(`${slug}: ${parsed.error}`);
  }
  if (parsed.unknownKeys.length > 0) {
    throw new Error(
      `${slug}: the file schema does not define ${parsed.unknownKeys
        .map((path) => path.join("."))
        .join(", ")}`,
    );
  }

  const { title: _title, ...definition } = parsed.sdcpn;
  return definition;
};
