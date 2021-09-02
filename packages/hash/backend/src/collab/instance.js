import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import { Mapping, Step, Transform } from "prosemirror-transform";
import { createInitialDoc, createSchema } from "@hashintel/hash-shared/schema";
import {
  calculateSavePayloads,
  createBlockUpdateTransaction,
  mapEntityToBlock,
  transformBlockForProsemirror,
} from "@hashintel/hash-shared/sharedWithBackend";
import {
  getPageQuery,
  insertBlockIntoPage,
  updatePage,
} from "@hashintel/hash-shared/queries/page.queries";
import { updateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { createProseMirrorState } from "@hashintel/hash-shared/sharedWithBackendJs";

const MAX_STEP_HISTORY = 10000;

// A collaborative editing document instance.
class Instance {
  constructor(accountId, id, doc, savedContents, client) {
    this.accountId = accountId;
    this.id = id;
    this.doc = doc;
    // The version number of the document instance.
    this.version = 0;
    this.steps = [];
    this.lastActive = Date.now();
    this.users = Object.create(null);
    this.userCount = 0;
    this.waiting = [];
    this.savedContents = savedContents;
    this.client = client;
    this.saveChain = Promise.resolve();
    this.saveMapping = null;

    this.collecting = null;
  }

  stop() {
    if (this.collecting != null) clearInterval(this.collecting);
  }

  addEvents(version, steps, clientID) {
    this.checkVersion(version);
    if (this.version !== version) return false;
    let doc = this.doc;
    for (let i = 0; i < steps.length; i++) {
      steps[i].clientID = clientID;
      const result = steps[i].apply(doc);
      if (!result.doc) return false;
      if (this.saveMapping) {
        this.saveMapping.appendMap(steps[i].getMap());
      }
      doc = result.doc;
    }
    this.doc = doc;
    this.version += steps.length;
    this.steps = this.steps.concat(steps);
    if (this.steps.length > MAX_STEP_HISTORY) {
      this.steps = this.steps.slice(this.steps.length - MAX_STEP_HISTORY);
    }

    this.sendUpdates();

    // @todo offload saves to a separate process / debounce them
    this.save(clientID);

    return { version: this.version };
  }

  save(clientID) {
    const mapping = new Mapping();

    this.saveChain = this.saveChain
      .catch(() => {})
      .then(() => {
        this.saveMapping = mapping;

        const doc = this.doc;

        const insert = async (insertPayload) => {
          const { data } = await this.client.mutate({
            mutation: insertBlockIntoPage,
            variables: insertPayload,
          });

          const { position } = insertPayload;
          const newBlock =
            data.insertBlockIntoPage.properties.contents[position];

          const offset = await new Promise((resolve) => {
            doc.forEach((_, offset, index) => {
              if (index === position) {
                resolve(offset);
              }
            });
          });

          const transform = new Transform(this.doc);
          const { attrs } = transformBlockForProsemirror(newBlock);

          const blockWithAttrs = this.doc.childAfter(mapping.map(offset) + 1);

          // @todo use a custom step for this so we don't need to copy attrs – we may lose some
          transform.setNodeMarkup(mapping.map(offset) + 1, undefined, {
            ...blockWithAttrs.attrs,
            ...attrs,
          });

          this.addEvents(this.version, transform.steps, `${clientID}-server`);
        };

        const update = async (updatePayloads) => {
          for (const updatePayload of updatePayloads) {
            const { data } = await this.client.mutate({
              mutation:
                updatePayload.entityType === "Page" ? updatePage : updateEntity,
              variables: {
                id: updatePayload.entityId,
                properties: updatePayload.data,
                accountId: updatePayload.accountId,
              },
            });

            console.log("update", data);
          }
        };

        const { insertPayloads, pageUpdatedPayload, updatedEntitiesPayload } =
          calculateSavePayloads(
            this.accountId,
            // @todo one of these should be something else
            this.id,
            this.id,

            this.doc.type.schema,
            this.doc,
            this.savedContents
          );

        return insertPayloads
          .reduce(
            (promise, insertPayload) =>
              promise.catch(() => {}).then(() => insert(insertPayload)),
            pageUpdatedPayload
              ? update([pageUpdatedPayload])
              : Promise.resolve()
          )
          .then(() => update(updatedEntitiesPayload));
      })
      .catch((err) => {
        console.error("could not save", err);
      })
      .then(async () => {
        const { data } = await this.client.query({
          query: getPageQuery,
          variables: { metadataId: this.id, accountId: this.accountId },
        });

        this.savedContents =
          data.page.properties.contents.map(mapEntityToBlock);
      })
      .finally(() => {
        if (this.saveMapping === mapping) {
          this.saveMapping = null;
        }
      });
  }

  addJsonEvents(version, jsonSteps, clientId) {
    const steps = jsonSteps.map((step) =>
      Step.fromJSON(this.doc.type.schema, step)
    );

    return this.addEvents(version, steps, clientId);
  }

  sendUpdates() {
    while (this.waiting.length) this.waiting.pop().finish();
  }

  // : (Number)
  // Check if a document version number relates to an existing
  // document version.
  checkVersion(version) {
    if (version < 0 || version > this.version) {
      const err = new Error("Invalid version " + version);
      err.status = 400;
      throw err;
    }
  }

  // : (Number, Number)
  // Get events between a given document version and
  // the current document version.
  getEvents(version) {
    this.checkVersion(version);
    const startIndex = this.steps.length - (this.version - version);
    if (startIndex < 0) return false;

    return {
      steps: this.steps.slice(startIndex),
      users: this.userCount,
    };
  }

  collectUsers() {
    const oldUserCount = this.userCount;
    this.users = Object.create(null);
    this.userCount = 0;
    this.collecting = null;
    for (let i = 0; i < this.waiting.length; i++) {
      this._registerUser(this.waiting[i].ip);
    }
    if (this.userCount !== oldUserCount) this.sendUpdates();
  }

  registerUser(ip) {
    if (!(ip in this.users)) {
      this._registerUser(ip);
      this.sendUpdates();
    }
  }

  _registerUser(ip) {
    if (!(ip in this.users)) {
      this.users[ip] = true;
      this.userCount++;
      if (this.collecting == null) {
        this.collecting = setTimeout(() => this.collectUsers(), 5000);
      }
    }
  }
}

const instances = Object.create(null);
let instanceCount = 0;
const maxCount = 20;

export async function getInstance(accountId, id, ip) {
  const inst = instances[id] || (await newInstance(accountId, id));
  if (ip) inst.registerUser(ip);
  inst.lastActive = Date.now();
  return inst;
}

async function newInstance(accountId, id) {
  if (++instanceCount > maxCount) {
    let oldest = null;
    for (const id of Object.keys(instances)) {
      const inst = instances[id];
      if (!oldest || inst.lastActive < oldest.lastActive) oldest = inst;
    }
    instances[oldest.id].stop();
    delete instances[oldest.id];
    --instanceCount;
  }

  const client = createApolloClient("collab");

  const { data } = await client.query({
    query: getPageQuery,
    variables: { metadataId: id, accountId },
  });

  const state = createProseMirrorState(
    createInitialDoc(createSchema()),
    null,
    []
  );

  const newState = state.apply(
    await createBlockUpdateTransaction(
      state,
      data.page.properties.contents,
      null
    )
  );

  // The instance may have been created whilst another user we were doing the above work
  if (instances[id]) {
    return instances[id];
  }

  const blocks = data.page.properties.contents.map(mapEntityToBlock);

  return (instances[id] = new Instance(
    accountId,
    id,
    newState.doc,
    blocks,
    client
  ));
}
