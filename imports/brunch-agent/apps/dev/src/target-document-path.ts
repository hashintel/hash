/** Resolve one target-document's local binding store without trusting its id as a path. */

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const defaultDirectory = (): string =>
  fileURLToPath(new URL('../.data-wipe-me/target-documents/', import.meta.url));

export function targetDocumentPath(targetDocumentId: string): string {
  if (targetDocumentId.length === 0) throw new TypeError('A target-document id cannot be empty.');
  const directory = process.env.BRUNCH_DEV_TARGET_DOCUMENT_DIR || defaultDirectory();
  const identity = createHash('sha256').update(targetDocumentId).digest('hex');
  return join(directory, `${identity}.json`);
}
