// noinspection BadExpressionStatementJS
import { arrow } from "./lib/execution/src/runner/javascript/apache-arrow-bundle.js";
import * as hash_util from "./lib/execution/src/runner/javascript/hash_util.js";

const Batch = function () {
  this.mem_version = -1;
  this.batch_version = -1;
  this.mem = null; // After loading, `mem` will be an ArrayBuffer.
  this.vectors = {};
  this.cols = {}; // Syncing erases columns that have become invalid.
};

const get_u64 = (dataview, offset) => {
  const left = dataview.getUint32(offset, true);
  const right = dataview.getUint32(offset + 4, true);
  const combined = left + 2 ** 32 * right; // Assumes little-endian.

  // `MAX_SAFE_INTEGER` is (2^53 - 1). We (currently) don't support more
  // than 2^32 agents, so as long as we use less than about 2^20 bytes
  // per agent (including message pools, whose size can grow quadratically
  // with the number of agents in the worst case), the shared memory length
  // will accurately fit in a double.
  // Also, 2^53 bytes is 2^43 kilobytes, i.e. 2^33 megabytes, i.e. 2^23
  // gigabytes, i.e. 2^13 terabytes. It's unlikely that any HASH users
  // will have that much RAM or even disk space. Even virtual memory
  // address space is usually less than 2^53 bytes (current 64-bit
  // computers don't enable using the full 64 bits of address space).

  if (!Number.isSafeInteger(combined)) {
    throw new RangeError(combined + " exceeds MAX_SAFE_INTEGER.");
  }
  return combined;
};
const parse_any_type_fields = (metadata) => {
  const any_type_fields = new Set();

  let field_names = metadata.get("any_type_fields");

  if (field_names) {
    for (let field_name of field_names.split(",")) {
      any_type_fields.add(field_name);
    }
  }

  return any_type_fields;
};

const load_vectors = (record_batch_bytes, schema) => {
  const reader = new arrow.MessageReader(record_batch_bytes);
  const msg = reader.readMessage();
  const header = msg.header();
  const body = reader.readMessageBody(msg.bodyLength);
  const dicts = new Map();
  const loader = new reader.VectorLoader(
    body,
    header.nodes,
    header.buffers,
    dicts,
  );
  const vector_list = loader.visitMany(schema.fields);
  const any_type_fields = parse_any_type_fields(schema.metadata);
  // Unnecessary:
  // const record_batch = new arrow.RecordBatch(schema, header.length, vector_list);

  const vectors = {}; // Field name --> vector.
  for (var i = 0; i < vector_list.length; ++i) {
    // `VectorLoader` doesn't actually return instances of `Vector` for some reason.
    const vector = new arrow.makeVector(vector_list[i]);
    const field = schema.fields[i];
    vector.type.is_any = any_type_fields.has(field.name);
    vectors[field.name] = vector;
  }
  return vectors;
};

const load_markers = (shared_bytes) => {
  // `shared_bytes` should be ArrayBuffer.
  const dataview = new DataView(shared_bytes);
  const m = {
    // TODO: Use Uint32Array instead of Dataview, both
    //       here and in `get_u64`.
    // Size of `u64` is 8 bytes.
    schema_offset: get_u64(dataview, 0 * 8),
    schema_size: get_u64(dataview, 1 * 8),
    header_offset: get_u64(dataview, 2 * 8),
    header_size: get_u64(dataview, 3 * 8),
    meta_offset: get_u64(dataview, 4 * 8),
    meta_size: get_u64(dataview, 5 * 8),
    data_offset: get_u64(dataview, 6 * 8),
    data_size: get_u64(dataview, 7 * 8),
  };

  if (m.schema_offset + m.schema_size > m.header_offset) {
    throw new RangeError("schema marker");
  }
  if (m.header_offset + m.header_size > m.meta_offset) {
    throw new RangeError("header marker");
  }
  if (m.meta_offset + m.meta_size > m.data_offset) {
    throw new RangeError("meta marker");
  }
  if (m.data_offset + m.data_size > shared_bytes.length) {
    throw new RangeError("data marker");
  }
  return m;
};

const load_marked_vectors = (shared_bytes, schema) => {
  const markers = load_markers(shared_bytes); // Record batch bytes are subset of all shared.
  const data_end = markers.data_offset + markers.data_size;
  const record_batch_offset = markers.meta_offset;
  const record_batch_size = data_end - record_batch_offset;
  const record_batch_bytes = new Uint8Array(
    shared_bytes,
    record_batch_offset,
    record_batch_size,
  );
  return load_vectors(record_batch_bytes, schema);
};

/// `latest_batch` should have `id` (string), and `mem` (ArrayBuffer) fields.
Batch.prototype.sync = function (latest_batch, schema) {
  const markers = load_markers(latest_batch.mem);
  let header_offset = markers.header_offset;

  // extract the metaversion from the header of the latest batch
  // more informations on metaversions can be found on the `Metaversion` struct
  const dataview_latest = new DataView(latest_batch.mem);
  // note: the header consists of two 32-bit unsigned integers (aka `u32` in Rust)
  const latest_mem_version = dataview_latest.getUint32(header_offset, true);
  // we use header_offset + 4 here because the both integers have a width of 4
  // bytes
  const latest_batch_version = dataview_latest.getUint32(
    header_offset + 4,
    true,
  );

  const should_load = this.batch_version < latest_batch_version;

  if (this.mem_version < latest_mem_version) {
    if (!should_load) {
      throw new Error(
        "Should be impossible to have new memory without new batch",
      );
    }

    // JS is in same process as Rust, so just need to update pointer.
    this.mem = latest_batch.mem;
    this.mem_version = latest_mem_version;
  }

  if (should_load) {
    this.vectors = load_marked_vectors(this.mem, schema);
    this.cols = {}; // Reset columns because they might be invalid due to vectors changing.
    this.batch_version = latest_batch_version;
  }
};

/// `name` is the name of the Arrow column/field.
/// `loader` is optional.
Batch.prototype.load_col = function (name, loader) {
  const vector = this.vectors[name];
  if (!vector) throw new ReferenceError("Missing vector for " + name);

  let col;
  if (loader) {
    col = loader(vector);
  } else if (name.startsWith("_HIDDEN_") || name.startsWith("_PRIVATE_")) {
    // only agent-scoped fields are fully loaded by default
    // TODO: Whether a column is nullable doesn't currently affect Arrow loading in JS, but if we
    //       want to modify fixed-size non-nullable columns in place, `is_nullable` needs to be
    //       set to the correct value here.
    const is_nullable = undefined;
    col = hash_util.load_shallow(vector, is_nullable, vector.type.is_any);
  } else {
    // TODO: Whether a column is nullable doesn't currently affect Arrow loading in JS, but if we
    //       want to modify fixed-size non-nullable columns in place, `is_nullable` needs to be
    //       set to the correct value here.
    const is_nullable = undefined;
    col = hash_util.load_full(vector, is_nullable, vector.type.is_any);
  }
  return (this.cols[name] = col);
};

/// Load columns that are in `schema`, but haven't been loaded yet
/// (or were loaded, but then were erased again). Uses optional
/// custom loaders.
Batch.prototype.load_missing_cols = function (schema, loaders) {
  for (var i = 0; i < schema.fields.length; ++i) {
    const name = schema.fields[i].name;
    if (!this.cols[name]) this.load_col(name, loaders[name]);
  }
};

const array_data_from_col = (col, field_type) => {
  // TODO: Would `new arrow.Builder` work?
  // TODO: Faster way to convert JS array to vector than using `Builder`?
  //       `arrow.Vector.from(col)` doesn't seem to quite work.
  const builder = new arrow.makeBuilder({
    type: field_type,
    nullValues: [null, undefined],
  });

  // TODO: Is there a way to add the whole column all at once to `builder`?
  try {
    for (var i_agent = 0; i_agent < col.length; ++i_agent) {
      builder.append(col[i_agent]);
    }
  } catch (e) {
    throw new Error(
      "Flushing error: " +
        JSON.stringify([i_agent, col[i_agent], field_type, String(e)]),
    );
  }

  // JS Arrow doesn't really document what `builder.finish` does, but
  // maybe it affects later serialization.
  builder.finish();
  return builder.flush();
};

// TODO: Can JS Arrow silently coerce some flushed values to different types if
//       their type differs from what it's supposed to be according to the schema?
const ffi_data_from_array_data = (array_data) => {
  const child_data = [];
  for (var i = 0; i < array_data.children.length; ++i) {
    child_data[i] = ffi_data_from_array_data(array_data.children[i]);
  }

  const buffers = [];
  const offsets = array_data.valueOffsets;
  const values = array_data.values;
  if (offsets) {
    buffers[0] = offsets.buffer;
    if (values) buffers.push(values.buffer);
  } else if (values) {
    buffers[0] = values.buffer;
  }

  return {
    // Get datatype from schema later.
    len: array_data.length,
    null_count: array_data.nullCount,
    null_bits: array_data.nullBitmap.buffer,
    buffers: buffers,
    child_data: child_data,
  };
};

Batch.prototype.flush_changes = function (schema, skip) {
  const changes = [];
  // TODO: Benchmark vs `Object.entries` and vs `for (var col in cols)`.
  for (var i_field = 0; i_field < schema.fields.length; ++i_field) {
    const field = schema.fields[i_field];
    const col = this.cols[field.name];
    if (!col || skip[field.name] || col.length === 0) continue; // A package might not require all columns,
    // in which case some columns that are in the schema
    // might be missing from `cols`. (But columns that
    // are in `cols` should always be in schema too.)

    if (this.vectors[field.name].type.is_any) {
      for (var i_agent = 0; i_agent < col.length; ++i_agent) {
        col[i_agent] = JSON.stringify(col[i_agent]);
      }
    }
    const array_data = array_data_from_col(col, field.type);
    const data = ffi_data_from_array_data(array_data);
    changes.push({
      // Some fields might be skipped, so a field's index in `changes` might not be equal to `i_field`.
      i_field: i_field, //
      data: data,
    });
  }
  return changes;
};

export const Batches = function () {
  this.batches = {};
};

Batches.prototype.get = function (batch_id) {
  return this.batches[batch_id];
};

/// `latest_batch` should have `id` (string), `batch_version` (number),
/// `mem_version` (number) and `mem` (ArrayBuffer) fields.
Batches.prototype.sync = function (latest_batch, schema) {
  let loaded_batch = this.batches[latest_batch.id];
  if (!loaded_batch) {
    this.batches[latest_batch.id] = loaded_batch = new Batch();
  }
  loaded_batch.sync(latest_batch, schema);
  return loaded_batch;
};
