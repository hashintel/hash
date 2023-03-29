import fetch from "node-fetch";
import Ajv2019 from "ajv/dist/2019.js";
import {URL} from "node:url";
import {inspect} from "node:util";
import betterAjvErrors from "better-ajv-errors";

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
  metaSchemaUrls;
  otherSchemaUrls;
  contents;

  constructor() {
    this.explored = new Set();
    this.exploreQueue = new Set();
    this.metaSchemaUrls = new Set();
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
 * Recurse inside an object and call a callback for each non-object key/value pair
 * @param key
 * @param obj
 * @param callback
 */
const recurseWithCallBack = (key, obj, callback) => {
  if (typeof obj === "object") {
    for (const key in obj) {
      recurseWithCallBack(key, obj[key], callback);
    }
  } else {
    callback(key, obj);
  }
}

/**
 * Recurse inside an object and get all url string values from within it
 *
 * @param obj
 * @returns {{metaSchemaUrls: Set<string>, otherSchemaUrls: Set<string>}}
 */
const getUrls = (obj) => {
  /** @type {Set<string>} */
  const metaSchemaUrls = new Set();
  /** @type {Set<string>} */
  const otherSchemaUrls = new Set();

  const parseUrl = (key, obj) => {
    try {
      const _url = new URL(obj);

      if (key === "$schema" || metaSchemaComponents.some((component) => obj.includes(component))) {
        metaSchemaUrls.add(obj);
      } else {
        otherSchemaUrls.add(obj);
      }
    } catch (e) {
      // ignore
    }
  }

  recurseWithCallBack(null, obj, parseUrl);
  return {metaSchemaUrls, otherSchemaUrls};
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

      const {metaSchemaUrls, otherSchemaUrls} = getUrls(type);

      Array.from(metaSchemaUrls).forEach((url) => {
        traversalContext.metaSchemaUrls.add(url);
        traversalContext.encounter(typeId, url);
      });

      Array.from(otherSchemaUrls).forEach((url) => {
        traversalContext.otherSchemaUrls.add(url);
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

  traversalContext.metaSchemaUrls.add(META_SCHEMA_URL);
  traversalContext.contents[META_SCHEMA_URL] = metaSchema;
  traversalContext.exploreQueue.add(META_SCHEMA_URL);

  for (const url of schemaUrls) {
    const schema = await (await fetch(url)).json();

    traversalContext.otherSchemaUrls.add(url);
    traversalContext.contents[url] = schema;
    traversalContext.exploreQueue.add(url);
  }

  await traverseAndCollateSchemas(traversalContext);

  const generatedMetaSchema = generateCombinedMetaSchema(META_SCHEMA_URL, traversalContext.contents);

  const otherUrls = Array.from(traversalContext.otherSchemaUrls);

  let ajv = new Ajv2019({
    allErrors: true,
    /*
      TODO: we can perhaps remove this by manually calling `.addVocabulary` for our additional
        keywords such as `kind`, `links`, etc.
     */
    strictSchema: false
  });
  try {
    ajv = ajv.addMetaSchema(generatedMetaSchema)
  } catch (e) {
    console.error(`Failed to add meta schema: ${e}`);
  }

  const failures = []
  for (const url of otherUrls) {
    const schema = traversalContext.contents[url];
    if (!ajv.validateSchema(schema)) {
      console.log(`Failed to validate schema "${url}"`);
      for (const error of ajv.errors) {
        console.log(betterAjvErrors(generatedMetaSchema, schema, [error], {indent: 2}));
      }
      console.log("\n\n")

      failures.push(url);
      continue;
    }

    ajv = ajv.addSchema(schema);
  }

  if (failures.length > 0) {
    throw new Error(`Failed to add schemas: ${failures.join(', ')}`);
  }
  return ajv;
}

const main = async () => {
  const personV2Url = "http://127.0.0.1:1337/person/v/2";

  const ajv = await getConfiguredAjv([
    personV2Url
  ]);

  const compileSchemaById = (url) => {
    const { schema } = ajv.getSchema(url);
    if (!schema) {
      throw new Error(`Could not find schema: ${url}`);
    }

    const validateFunc = ajv.compile(schema);
    if (!validateFunc) {
      console.log(inspect({errors: ajv.errors}, {colors: true, compact: false, depth: null}));
      throw new Error(`Could not compile schema: ${url}`);
    }
    return validateFunc;
  }

  const validatePerson = compileSchemaById(personV2Url);
};

main().then((r) => {
});
