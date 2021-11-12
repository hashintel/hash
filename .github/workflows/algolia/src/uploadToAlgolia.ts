import { syncAlgoliaIndex } from ".";

const main = async () => {
  await syncAlgoliaIndex();
  console.log("Algolia Indexes Updated.");
};

main();
