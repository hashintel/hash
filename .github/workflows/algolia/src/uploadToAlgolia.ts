import { syncAlgoliaIndex } from "./syncAlgoliaIndex";

const main = async () => {
  try {
    await syncAlgoliaIndex();
    console.log("Algolia Indexes Updated.");
  } catch (error) {
    throw new Error(`Algolia Indexing Failed: ${error}`);
  }
};

main();
