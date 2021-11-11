import { generateAlgoliaJson, uploadAlgoliaData, deleteDocsIndex } from ".";

const main = async () => {
  const records = generateAlgoliaJson();
  await deleteDocsIndex();
  console.log("Old Index Deleted.");
  await uploadAlgoliaData(records);
  console.log("Algolia Indexes Updated.");
};

main();
