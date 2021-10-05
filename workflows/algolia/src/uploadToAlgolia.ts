import { generateAlgoliaJson, uploadAlgoliaData } from ".";

const main = async () => {
  const records = generateAlgoliaJson();
  await uploadAlgoliaData(records);
  console.log("Algolia Indexes Updated.");
};

main();
