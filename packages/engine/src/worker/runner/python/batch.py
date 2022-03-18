import json
import struct

import pyarrow as pa

import hash_util
from wrappers import load_shared_mem
from wrappers import shared_buf_from_c_memory
from wrappers import dynamic_meta_from_c_memory
from wrappers import static_meta_from_schema
from wrappers import flush


def load_markers(mem):
    n_marker_bytes = 8  # Markers are all u64s.
    n_markers = 8  # NUMBER_OF_MARKERS in datastore/memory.rs.
    n_markers_bytes = n_marker_bytes * n_markers
    markers_bytes = mem[:n_markers_bytes].to_pybytes()

    # '<' implies little-endian.
    # '<' also implies standard sizes, so Q matches a u64.
    markers_fmt = '<' + 'Q' * n_markers
    markers = struct.unpack_from(markers_fmt, markers_bytes)
    assert len(markers) == n_markers, markers

    # Same order as in `datastore/storage/markers.rs`.
    # Units are all numbers of bytes.
    (schema_offset, schema_size, header_offset, header_size,
     meta_offset, meta_size, data_offset, data_size) = markers

    # The "meta bytes" here do *not* contain the schema's key-value metadata.
    # They contain what is officially called a "RecordBatch message data header", but
    # the Rust implementation just calls it a "RecordBatch message".
    # https://arrow.apache.org/docs/format/Columnar.html#recordbatch-message

    # Schema comes immediately after markers.
    assert schema_offset == n_markers_bytes, \
        "schema_offset: {}, n_markers_bytes: {}".format(schema_offset, n_markers_bytes)
    assert schema_offset + schema_size <= header_offset
    assert header_offset + header_size <= meta_offset
    assert meta_offset + meta_size <= data_offset
    assert data_offset + data_size <= mem.size
    return markers


def parse_any_type_fields(metadata):
    any_type_fields = set()

    field_names = metadata.get('any_type_fields')

    if field_names:
        for field_name in field_names.split(','):
            any_type_fields.add(field_name)

    return any_type_fields


def load_record_batch(mem, schema=None):
    (schema_offset, schema_size, _, _, meta_offset, _, data_offset, data_size) = load_markers(mem)
    # Pyarrow exposes a function for parsing the record batch message data header and
    # record batch data together, but not functions for parsing them separately, so
    # they should be contiguous in memory. (Or have to use a hack to pretend that
    # what is between them is padding.)
    if schema is None:
        schema_buf = mem[schema_offset: schema_offset + schema_size]
    record_batch_buf = mem[meta_offset: data_offset + data_size]

    if schema is None:
        schema = pa.ipc.read_schema(schema_buf)
    record_batch = pa.ipc.read_record_batch(record_batch_buf, schema)

    any_type_fields = parse_any_type_fields(schema.metadata)

    # Put data about `any` types and nullability directly in record batch.
    for i_field in range(len(record_batch.num_columns)):
        field = record_batch.schema.field(i_field)
        vector = record_batch.column(i_field)
        vector.type.is_any = field.name in any_type_fields
        vector.type.is_nullable = field.nullable

    return record_batch


# Returns dataset name, dataset contents and whether JSON could be loaded.
def load_dataset(batch_id):
    mem = load_shared_mem(shared_buf_from_c_memory(batch_id))
    (_, _, header_offset, header_size, _, _, data_offset, data_size) = load_markers(mem)

    # The header has the shortname of the dataset
    n_metaversion_bytes = 8  # Memory u32 + batch u32 version
    name_offset = header_offset + n_metaversion_bytes  # Skip metaversion.
    name_buf = mem[name_offset: name_offset + header_size]
    dataset_name = str(name_buf.to_pybytes().decode('utf-8'))

    # This data buffer has the dataset as a JSON string
    data_buf = mem[data_offset: data_offset + data_size]
    dataset_utf8 = data_buf.to_pybytes().decode('utf8')
    try:
        return dataset_name, json.loads(dataset_utf8), True
    except: # TODO: Only catch exact JSON parsing error.
            # TODO: Extract parsing error line number from exception.
        return dataset_name, dataset_utf8, False


class Batch:
    def __init__(self, batch_id):
        self.id = batch_id

        self.mem_version = -1
        self.batch_version = -1
        self.mem = None  # After loading, `mem` will be a shared buffer.
        self.record_batch = None  # After loading, `record_batch` will be a record batch.
        self.cols = {}  # Syncing erases columns that have become invalid.

        # For flushing:
        self.c_memory = None
        self.dynamic_meta = None
        self.static_meta = None

    def sync(self, latest_batch, schema=None):
        should_load = self.batch_version < latest_batch.batch_version
        if self.mem_version < latest_batch.mem_version:
            self.mem_version = latest_batch.mem_version
            assert should_load, "Should be impossible to have new memory without new batch"

            # `load_shared_mem` throws an exception if loading fails,
            # but otherwise the returned pointer to shared memory is non-null.
            self.c_memory = load_shared_mem(latest_batch.id)
            self.mem = shared_buf_from_c_memory(self.c_memory)
            self.dynamic_meta = dynamic_meta_from_c_memory(self.c_memory)

        if should_load:
            self.batch_version = latest_batch.batch_version
            self.record_batch = load_record_batch(self.mem, schema)
            self.cols = {}  # Avoid using obsolete column data.
            self.static_meta = static_meta_from_schema(self.record_batch.schema)

    def load_col(self, name, loader=None):
        vector = self.record_batch.column(name)
        if not vector:
            raise RuntimeError("Missing vector for " + name)

        if loader is not None:
            col = loader(vector)
        elif len(name) >= 9 and (name[:2] == '_PRIVATE_' or name[:2] == '_HIDDEN_'): # only agent-scoped fields are fully loaded by default
            col = hash_util.load_shallow(vector)
        else:
            col = hash_util.load_full(vector)

        self.cols[name] = col
        return col

    # Load columns that are in `schema`, but haven't been loaded yet
    # (or were loaded, but then were erased again). Uses optional
    # custom loaders.
    def load_missing_cols(self, schema, loaders):
        for field_name in schema.names:
            if field_name not in self.cols:
                self.load_col(field_name, loaders.get(field_name))

    def flush_changes(self, schema, skip):
        any_type_fields = parse_any_type_fields(schema.metadata)

        # Dynamically accessed columns (if any) were added to `cols` by `state`.
        changes = []
        for field_name, col in self.cols.items():
            if type(col) is not list or skip[field_name]:
                continue  # Column wasn't written to or was writable in place.

            i_field = schema.get_field_index(field_name)
            if i_field < 0:
                continue  # Not supposed to have this column in `cols`?

            field = schema.field(i_field)
            if field.name in any_type_fields:
                c = [json.dumps(elem) for elem in col]
            else:
                c = col

            changes.append({
                'i_field': i_field,
                'data': pa.array(c, type=field.type)
            })

        if len(changes) == 0:
            return

        self.batch_version += 1
        did_resize = flush(
            self.c_memory, self.dynamic_meta, self.static_meta, changes
        )
        if did_resize:
            # `c_memory` is updated inside `_flush_changes` if memory is resized.
            self.mem_version += 1
            self.mem = shared_buf_from_c_memory(self.c_memory)
            self.dynamic_meta = dynamic_meta_from_c_memory(self.c_memory)


class Batches:
    def __init__(self):
        self.batches = {}

    def get(self, batch_id):
        return self.batches[batch_id]

    def sync(self, latest_batch, schema=None):
        loaded_batch = self.batches.get(latest_batch.id)
        if loaded_batch is None:
            self.batches[latest_batch.id] = loaded_batch = Batch(latest_batch.id)

        # `loaded_batch` is changed in-place. Return is for convenience.
        loaded_batch.sync(latest_batch, schema)
        return loaded_batch

    def free(self):
        # TODO: Check that this releases references to shared memory
        self.batches = {}
