import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { getUser, uploadFile } from "../api-queries";
import { expect } from "../runtime";
import { generateDocx } from "./generate-test-docx";
import { generatePdf } from "./generate-test-pdf";
import { otherTestDocumentPages, testDocumentPages } from "./test-document";

import type { Locator, Page } from "../runtime";
import type { PageContent } from "./test-document";

const [, secondPage] = testDocumentPages;
const [otherDocumentPage] = otherTestDocumentPages;

export const getPdfPage = (page: Page) => page.locator(".react-pdf-page");

export const getDocxPage = (page: Page, heading: string) =>
  page.locator(".layout-page", { hasText: heading });

export const docxMimeType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type TestFile = { contents: Buffer; mimeType: string; name: string };

const uploadTestFile = async (page: Page, file: TestFile) => {
  const user = await getUser(page.request);
  if (!user) {
    throw new Error("Cannot upload a file without an authenticated user");
  }

  return uploadFile(page.request, {
    ...file,
    webId: extractWebIdFromEntityId(user.metadata.recordId.entityId),
  });
};

export const uploadAndOpenFile = async (page: Page, file: TestFile) => {
  const fileEntity = await uploadTestFile(page, file);
  const { entityId } = fileEntity.metadata.recordId;
  const entityUuid = extractEntityUuidFromEntityId(entityId);

  const fileEntityFetched = page.waitForResponse((response) => {
    const postData = response.request().postData() ?? "";

    return (
      response.url().includes("/graphql") &&
      postData.includes("queryEntitySubgraph") &&
      postData.includes(`{"path":["uuid"]},{"parameter":"${entityUuid}"}`)
    );
  });

  await page.goto(
    generateEntityPath({
      entityId,
      includeDraftId: false,
      shortname: "alice",
    }),
  );
  await fileEntityFetched;
};

export const uploadTestFileAndGetUrl = async (page: Page, file: TestFile) => {
  const fileEntity = await uploadTestFile(page, file);

  return simplifyProperties(fileEntity.properties).fileUrl;
};

/**
 * Changes the "File URL" value in the properties table without saving the
 * entity. The table draws its cells on a canvas, so the value cell is focused
 * through the grid's accessibility table. The canvas is focused first: its
 * focus handler would otherwise move the selection back to the first cell.
 */
export const editFileUrl = async (page: Page, fileUrl: string) => {
  const grid = page.getByTestId("data-grid-canvas").first();
  await grid.focus();
  await grid
    .locator("tr")
    .filter({ has: page.locator("td", { hasText: /^File URL$/ }) })
    .locator("td")
    .nth(1)
    .focus();
  await page.keyboard.press("Enter");

  const valueInput = page.getByPlaceholder("Start typing...");
  await valueInput.fill(fileUrl);
  await valueInput.press("Enter");
};

type FileFormat = {
  extension: string;
  generate: (pages: readonly PageContent[]) => Buffer | Promise<Buffer>;
  mimeType: string;
  pageWithHeading: (page: Page, heading: string) => Locator;
};

export const pdf: FileFormat = {
  extension: "pdf",
  generate: generatePdf,
  mimeType: "application/pdf",
  pageWithHeading: (page, heading) =>
    getPdfPage(page).getByText(heading, { exact: true }),
};

export const docx: FileFormat = {
  extension: "docx",
  generate: generateDocx,
  mimeType: docxMimeType,
  pageWithHeading: getDocxPage,
};

export const expectFileUrlEditOnLaterPageShowsNewFile = async (
  page: Page,
  format: FileFormat,
) => {
  const otherFileUrl = await uploadTestFileAndGetUrl(page, {
    contents: await format.generate(otherTestDocumentPages),
    mimeType: format.mimeType,
    name: `file-preview-other-${Date.now()}.${format.extension}`,
  });

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(format.pageWithHeading(page, secondPage.heading)).toBeVisible();

  await editFileUrl(page, otherFileUrl);

  await expect(
    format.pageWithHeading(page, otherDocumentPage.heading),
  ).toBeVisible();
};
