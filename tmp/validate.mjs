import fetch from "node-fetch";
import Ajv2019 from "ajv/dist/2019.js";
import { URL } from "node:url";
import betterAjvErrors from "better-ajv-errors";

const JSON_SCHEMA_DRAFT_URL = "https://json-schema.org/draft/2019-09/schema";
const ENTITY_TYPE_META_SCHEMA_URL = "http://127.0.0.1:1337/meta.json";
const PROPERTY_TYPE_META_SCHEMA_URL =
  "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type";
const DATA_TYPE_META_SCHEMA_URL =
  "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type";

const TYPE_SYSTEM_META_SCHEMA_URLS = [
  ENTITY_TYPE_META_SCHEMA_URL,
  PROPERTY_TYPE_META_SCHEMA_URL,
  DATA_TYPE_META_SCHEMA_URL,
];

/**
 * We need a way to identify custom metaschemas (not a JSON schema draft), so we can squash them
 * to deal with `ajv`'s problems when handling `$ref` graphs.
 * These are strings to check `.includes()` on to determine if a given URL refers to a custom metaschema.
 */
const metaSchemaComponents = [
  JSON_SCHEMA_DRAFT_URL,
  "types/modules/graph", // This is part of the root of the paths we store Block Protocol type system metaschemas on
  ENTITY_TYPE_META_SCHEMA_URL.split("/").pop(), // we only check against a piece of the path just in case some of the transformation steps below rewrites or drops the URL
];

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
    if (
      !this.explored.has(dependencyTypeId) &&
      !this.exploreQueue.has(dependencyTypeId)
    ) {
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
const recurseWithCallBack = (key, obj, callback, ignoreKeys) => {
  if (typeof obj === "object") {
    for (const key in obj) {
      if (!ignoreKeys || !ignoreKeys.includes(key)) {
        recurseWithCallBack(key, obj[key], callback);
      }
    }
  } else {
    callback(key, obj);
  }
};

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

      if (
        key === "$schema" ||
        metaSchemaComponents.some((component) => obj.includes(component))
      ) {
        metaSchemaUrls.add(obj);
      } else {
        otherSchemaUrls.add(obj);
      }
    } catch (e) {
      // ignore
    }
  };

  // We don't want to look inside the `required` array, as it contains Base URLs which may not
  // return anything
  recurseWithCallBack(null, obj, parseUrl, ["required"]);
  return { metaSchemaUrls, otherSchemaUrls };
};

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

    addFetchPromise(
      (async () => {
        try {
          return (await fetch(typeId)).json();
        } catch (e) {
          console.error(`Failed to fetch ${typeId}: ${e}`);
          throw e;
        }
      })().then((type) => {
        traversalContext.contents[typeId] = type;

        const { metaSchemaUrls, otherSchemaUrls } = getUrls(type);

        Array.from(metaSchemaUrls).forEach((url) => {
          traversalContext.metaSchemaUrls.add(url);
          traversalContext.encounter(typeId, url);
        });

        Array.from(otherSchemaUrls).forEach((url) => {
          traversalContext.otherSchemaUrls.add(url);
          traversalContext.encounter(typeId, url);
        });
      }),
    );
  }
};

// TODO: make this a more general 'collapseSchema' function (not limited to metaschemas)
const generateCombinedMetaSchema = (root, schemas) => {
  const combinedSchema = schemas[root];
  combinedSchema.$defs ??= {};

  const resolveRef = (ref) => {
    if (ref.startsWith("#")) {
      // Local reference
      return ref;
    } else {
      // Remote reference
      const [url, pointer] = ref.split("#");
      if (
        url === JSON_SCHEMA_DRAFT_URL ||
        url === ENTITY_TYPE_META_SCHEMA_URL
      ) {
        return url;
      }
      if (pointer) {
        throw new Error(
          `Remote references with pointers are not supported: ${ref}`,
        );
      }

      const remoteSchema = schemas[url];
      if (!remoteSchema) {
        throw new Error(`Could not resolve remote reference: ${ref}`);
      }
      // split the url by '/' and take the last component
      const resolvedUrl = url.split("/").pop();

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

  for (const metaSchemaUrl of TYPE_SYSTEM_META_SCHEMA_URLS) {
    const metaSchema = await (await fetch(metaSchemaUrl)).json();

    traversalContext.metaSchemaUrls.add(metaSchemaUrl);
    traversalContext.contents[metaSchemaUrl] = metaSchema;
    traversalContext.exploreQueue.add(metaSchemaUrl);
  }

  for (const url of schemaUrls) {
    const schema = await (await fetch(url)).json();

    traversalContext.otherSchemaUrls.add(url);
    traversalContext.contents[url] = schema;
    traversalContext.exploreQueue.add(url);
  }

  await traverseAndCollateSchemas(traversalContext);

  // TODO: For each entity type, make an accompanying synthetic type to validate an array of linked
  //  entities (endpoints of links, not the links themselves)

  let ajv = new Ajv2019({
    allErrors: true,
    /*
      TODO: we can perhaps remove this by manually calling `.addVocabulary` for our additional
        keywords such as `kind`, `links`, etc.
     */
    strictSchema: false,
  });

  let generatedEntityTypeMetaSchema;
  const failures = [];

  for (const metaSchemaUrl of TYPE_SYSTEM_META_SCHEMA_URLS) {
    let combinedMetaSchema;
    try {
      combinedMetaSchema = generateCombinedMetaSchema(
        metaSchemaUrl,
        traversalContext.contents,
      );
    } catch (e) {
      failures.push(metaSchemaUrl);
      console.error(
        `Failed to generate combined meta schema [${metaSchemaUrl}]:\n${e}`,
      );
    }

    if (metaSchemaUrl === ENTITY_TYPE_META_SCHEMA_URL) {
      // Add `unevaluatedProperties` to the metaschema as we wish to implicitly add this when validating
      // entity types
      combinedMetaSchema.properties.unevaluatedProperties = {
        type: "boolean",
      };
      generatedEntityTypeMetaSchema = combinedMetaSchema;
    }

    try {
      ajv = ajv.addMetaSchema(combinedMetaSchema);
    } catch (e) {
      failures.push(metaSchemaUrl);
      console.error(`Failed to add meta schema [${metaSchemaUrl}]:\n${e}`);

      if (ajv.errors) {
        const jsonDraftMetaSchema = ajv.getSchema(JSON_SCHEMA_DRAFT_URL);
        for (const error of ajv.errors) {
          console.log(
            betterAjvErrors(jsonDraftMetaSchema, combinedMetaSchema, [error], {
              indent: 2,
            }),
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Failed to add schemas: ${failures.join(", ")}`);
  }

  const otherUrls = Array.from(traversalContext.otherSchemaUrls);

  for (const url of otherUrls) {
    const schema = traversalContext.contents[url];

    try {
      const valid = ajv.validateSchema(schema);
      if (!valid) {
        throw new Error("Invalid schema");
      }
    } catch (e) {
      console.log(`Failed to validate schema "${url}": ${e}`);
      if (ajv.errors) {
        for (const error of ajv.errors) {
          console.log(
            betterAjvErrors(generatedEntityTypeMetaSchema, schema, [error], {
              indent: 2,
            }),
          );
        }
      }
      failures.push(url);
      continue;
    }

    ajv = ajv.addSchema(schema);
  }

  if (failures.length > 0) {
    throw new Error(`Failed to add schemas: ${failures.join(", ")}`);
  }
  return ajv;
};

const propertyTypeBaseUrls = {
  name: "http://127.0.0.1:1337/types/property-type/name/",
  age: "http://127.0.0.1:1337/types/property-type/age/",
  occupation: "http://127.0.0.1:1337/types/property-type/occupation/",
};

const main = async () => {
  const personV2Url = "http://127.0.0.1:1337/types/entity-type/person/v/2";
  const employeeV1Url = "http://127.0.0.1:1337/types/entity-type/employee/v/1";

  const ajv = await getConfiguredAjv([personV2Url, employeeV1Url]);

  const getValidator = (url) => {
    const { schema } = ajv.getSchema(url);
    if (!schema) {
      throw new Error(`Could not find schema: ${url}`);
    }

    ajv.removeSchema(url);

    schema.unevaluatedProperties = false;
    ajv.addSchema(schema);

    const validate = ajv.getSchema(url);

    return (data) => {
      const valid = validate(data);
      if (!valid) {
        console.log(
          betterAjvErrors(validate.schema, data, validate.errors, {
            indent: 2,
          }),
        );
      }
      return valid;
    };
  };

  const bob = {
    [propertyTypeBaseUrls.name]: "Bob",
    [propertyTypeBaseUrls.age]: 30,
    [propertyTypeBaseUrls.occupation]: "Software Engineer",
  };

  const validatePerson = getValidator(personV2Url);
  const validateEmployee = getValidator(employeeV1Url);

  validatePerson(bob);
  validateEmployee(bob);
};

main().then((r) => {});
