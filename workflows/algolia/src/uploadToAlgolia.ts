import { generateAlgoliaJson, uploadAlgoliaData } from ".";

const main = async () => {
  const records = generateAlgoliaJson();
  console.log(records)
  await uploadAlgoliaData(records);
};

main();
