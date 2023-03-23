import fetch from "node-fetch";
import Ajv2019 from "ajv/dist/2019.js";
import {URL} from "node:url";

/**
 * Keeps track of types to explore, types that have been explored, and their resolved dependency graph as its explored.
 */
class TraversalContext {
  explored;
  exploreQueue;
  metaschemas;
  others;
  contents;

  constructor() {
    this.explored = new Set();
    this.exploreQueue = new Set();
    this.metaschemas = new Set();
    this.others = new Set();
    this.contents = {};
  }

  encounter(sourceTypeId, dependencyTypeId) {
    if (!this.explored.has(dependencyTypeId) && !this.exploreQueue.has(dependencyTypeId)) {
      console.log(`Adding ${dependencyTypeId} to explore queue, as it was encountered as a dependency of ${sourceTypeId}.`,);
      this.exploreQueue.add(dependencyTypeId);
    } else {
      console.log(`Skipping ${dependencyTypeId} as a dependency of ${sourceTypeId}, as it has already been explored.`,);
    }
  }

  /**
   * This indicates the next type to explore, if there is one in the queue.
   */
  nextToExplore() {
    const typeId = this.exploreQueue.values().next().value;
    if (typeId) {
      this.exploreQueue.delete(typeId);
      this.explored.add(typeId);
    }
    return typeId;
  }
}

// recurse inside an object and get all url string values from within it
const getUrls = (obj) => {
  const metaSchemas = new Set();
  const others = new Set();

  const recurse = (key, obj) => {
    if (typeof obj === "string") {
      try {
        const _url = new URL(obj);
        if (key === "$schema" || obj.includes("types/modules/graph") || obj.includes("meta.json")) {
          metaSchemas.add(obj);
        } else {
          others.add(obj);
        }
      } catch (e) {
        // ignore
      }
    } else if (typeof obj === "object") {
      for (const key in obj) {
        recurse(key, obj[key]);
      }
    }
  };
  recurse(null, obj);
  return {metaSchemas, others};
}

export const traverseAndCollateSchemas = async (traversalContext) => {
  const fetchQueue = [];

  const addFetchPromise = (fetchPromise) => {
    fetchQueue.push(fetchPromise);

    void fetchPromise.then(() => {
      fetchQueue.splice(fetchQueue.indexOf(fetchPromise), 1);
    });
  };

  while (traversalContext.exploreQueue.size > 0 || fetchQueue.length > 0) {
    const typeId = traversalContext.nextToExplore();

    if (!typeId) {
      // wait a bit before checking the loop again
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      continue;
    }

    console.log(`Fetching ${typeId}...`);

    addFetchPromise((async () => {
      try {
        return (await fetch(typeId)).json()
      } catch (e) {
        console.error(`Failed to fetch ${typeId}: ${e}`);
        throw e;
      }
    })().then((type) => {
      traversalContext.contents[typeId] = type;

      const {metaSchemas, others} = getUrls(type);
      const metaSchemaUrls = Array.from(metaSchemas);
      const otherUrls = Array.from(others);

      metaSchemaUrls.forEach((url) => {
        traversalContext.metaschemas.add(url);
        traversalContext.encounter(typeId, url);
      });

      otherUrls.forEach((url) => {
        traversalContext.others.add(url);
        traversalContext.encounter(typeId, url);
      });
    }));
  }
};

const generateCombinedMetaSchema = (root, schemas) => {
  const combinedSchema = schemas[root];
  combinedSchema.definitions = {};

  const resolveRef = (ref) => {
    if (ref.startsWith("#")) {
      // Local reference
      return ref;
    } else {
      // Remote reference
      const [url, pointer] = ref.split("#");
      if (url === "https://json-schema.org/draft/2019-09/schema" || url === "http://127.0.0.1:1337/meta.json") {
        return url;
      }
      if (pointer) {
        throw new Error(`Remote references with pointers are not supported: ${ref}`);
      }

      const remoteSchema = schemas[url];
      if (!remoteSchema) {
        throw new Error(`Could not resolve remote reference: ${ref}`);
      }
      // split the url by '/' and take the last component
      const resolvedUrl = url.split('/').pop();

      const localRef = `#/$defs/${resolvedUrl}`;
      if (remoteSchema.$id) {
        delete remoteSchema.$id;
      }
      if (remoteSchema.$schema) {
        delete remoteSchema.$schema;
      }
      if (!combinedSchema.$defs[resolvedUrl]) {
        combinedSchema.$defs[resolvedUrl] = remoteSchema;
      }
      return localRef;
    }
  };

  const traverseSchema = (schema) => {
    if (typeof schema !== "object" || schema === null) {
      // Base case: schema is not an object
      return schema;
    }

    if (schema.$ref && typeof schema.$ref === "string") {
      // Replace remote reference with local reference
      schema.$ref = resolveRef(schema.$ref);
    }

    // Traverse each property recursively
    for (const key in schema) {
      schema[key] = traverseSchema(schema[key]);
    }

    return schema;
  };

  // Traverse combined schema
  traverseSchema(combinedSchema);
  // Hacky but some of the sub schemas weren't being updated (depending on number of iterations) so we just do another pass
  traverseSchema(combinedSchema);

  return combinedSchema;
};

const main = async () => {
  // const metaSchema = await (await fetch("http://127.0.0.1:1337/meta.json")).json();
  const personV2Url = "http://127.0.0.1:1337/person/v/2";
  const personV2 = await (await fetch(personV2Url)).json();

  const traversalContext = new TraversalContext();

  traversalContext.others.add(personV2Url);
  traversalContext.contents[personV2Url] = personV2;
  traversalContext.exploreQueue.add(personV2Url);

  await traverseAndCollateSchemas(traversalContext);

  Object.values(traversalContext.contents).forEach((schema) => {
    // split the schema.$id by '/' if it exists and only take the last component
    if (schema.$id && schema.$id !== "http://127.0.0.1:1337/meta.json" && schema.$id !== "https://json-schema.org/draft/2019-09/schema" && schema.$id.includes('/')) {
      const schemaId = schema.$id.split('/').pop();
      if (schemaId) {
        schema.$id = schemaId;
      }
    }
  })

  const generatedMetaSchema = generateCombinedMetaSchema("http://127.0.0.1:1337/meta.json", traversalContext.contents);

  const metaSchemaUrls = Array.from(traversalContext.metaschemas);
  // remove "http://127.0.0.1:1337/meta.json" from `metaSchemaUrls`
  const otherUrls = Array.from(traversalContext.others);

  metaSchemaUrls.splice(metaSchemaUrls.indexOf("http://127.0.0.1:1337/meta.json"), 1);
  // remove "https://json-schema.org/draft/2019-09/schema" from `metaSchemaUrls` as it's already included in Ajv2019
  metaSchemaUrls.splice(metaSchemaUrls.indexOf("https://json-schema.org/draft/2019-09/schema"), 1);

  let ajv = new Ajv2019();

  ajv = ajv.addMetaSchema(generatedMetaSchema);
  ajv = ajv.addSchema([...otherUrls].map((url) => traversalContext.contents[url]));

  console.log(ajv.validateSchema(personV2));
};

main().then((r) => {
});
