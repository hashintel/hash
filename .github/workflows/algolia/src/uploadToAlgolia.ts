import { syncAlgoliaIndex } from "./syncAlgoliaIndex";

const main = async () => {
  await syncAlgoliaIndex();
  console.log("Algolia Indexes Updated.");
};

main();
