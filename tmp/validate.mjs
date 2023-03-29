import fetch from "node-fetch";
import Ajv2019 from "ajv/dist/2019.js";
import {URL} from "node:url";

const META_SCHEMA_URL = "http://127.0.0.1:1337/meta.json";
const JSON_SCHEMA_DRAFT_URL = "https://json-schema.org/draft/2019-09/schema";

/**
 * We need a way to identify custom metaschemas (not a JSON schema draft), so we can squash them
 * to deal with `ajv`'s problems when handling `$ref` graphs.
 * These are strings to check `.includes()` on to determine if a given URL refers to a custom metaschema.
 */
const metaSchemaComponents = [
  JSON_SCHEMA_DRAFT_URL,
  "types/modules/graph", // This is part of the root of the paths we store Block Protocol type system metaschemas on
  META_SCHEMA_URL.split("/").pop(), // we only check against a piece of the path just in case some of the transformation steps below rewrites or drops the URL
]

/**
 * Keeps track of types to explore, types that have been explored, and their resolved dependency graph as its explored.
 */
class TraversalContext {
  explored;
  exploreQueue;
  metaschemaUrls;
  otherSchemaUrls;
  contents;

  constructor() {
    this.explored = new Set();
    this.exploreQueue = new Set();
    this.metaschemaUrls = new Set();
    this.otherSchemaUrls = new Set();
    this.contents = {};
  }

  encounter(sourceTypeId, dependencyTypeId) {
    if (!this.explored.has(dependencyTypeId) && !this.exploreQueue.has(dependencyTypeId)) {
      // console.log(`Adding ${dependencyTypeId} to explore queue, as it was encountered as a dependency of ${sourceTypeId}.`,);
      this.exploreQueue.add(dependencyTypeId);
    } else {
      // console.log(`Skipping ${dependencyTypeId} as a dependency of ${sourceTypeId}, as it has already been explored.`,);
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

/**
 * Recurse inside an object and get all url string values from within it
 *
 * @param obj
 * @returns {{metaSchemas: Set<string>, otherSchemaUrls: Set<string>}}
 */
const getUrls = (obj) => {
  const metaSchemas = new Set();
  const others = new Set();

  const recurse = (key, obj) => {
    if (typeof obj === "string") {
      try {
        const _url = new URL(obj);

        if (key === "$schema" || metaSchemaComponents.some((component) => obj.includes(component))) {
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

    // console.log(`Fetching ${typeId}...`);

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
      if (url === JSON_SCHEMA_DRAFT_URL || url === META_SCHEMA_URL) {
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

const getConfiguredAjv = async (schemaUrls) => {
  const traversalContext = new TraversalContext();

  const metaSchema = await (await fetch(META_SCHEMA_URL)).json();

  traversalContext.metaschemaUrls.add(META_SCHEMA_URL);
  traversalContext.contents[META_SCHEMA_URL] = metaSchema;
  traversalContext.exploreQueue.add(META_SCHEMA_URL);

  for (const url of schemaUrls) {
    const schema = await (await fetch(url)).json();

    traversalContext.otherSchemaUrls.add(url);
    traversalContext.contents[url] = schema;
    traversalContext.exploreQueue.add(url);
  }

  await traverseAndCollateSchemas(traversalContext);

  // Post process schema contents
  Object.values(traversalContext.contents).forEach((schema) => {
    // split the schema.$id by '/' if it exists and only take the last component
    if (schema.$id && schema.$id !== META_SCHEMA_URL && schema.$id !== JSON_SCHEMA_DRAFT_URL && schema.$id.includes('/')) {
      const schemaId = schema.$id.split('/').pop();
      if (schemaId) {
        schema.$id = schemaId;
      }
    }
  })

  const generatedMetaSchema = generateCombinedMetaSchema(META_SCHEMA_URL, traversalContext.contents);

  const otherUrls = Array.from(traversalContext.otherSchemaUrls);

  let ajv = new Ajv2019({allErrors: true});
  try {
    ajv = ajv.addMetaSchema(generatedMetaSchema)
  } catch (e) {
    console.error(`Failed to add meta schema: ${e}`);
  }

  for (const url of otherUrls) {
    try {
      ajv = ajv.addSchema(traversalContext.contents[url]);
    } catch (e) {
      console.error(`Failed to add schema "${url}": ${e}`);
      console.error({schema: traversalContext.contents[url]})
    }
  }
  return ajv;
}

const main = async () => {
  const personV2Url = "http://127.0.0.1:1337/person/v/2";

  const ajv = await getConfiguredAjv([personV2Url]);

  console.log(ajv.validateSchema(personV2Url));
};

main().then((r) => {
});
