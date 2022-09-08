import json
import struct

import pyarrow as pa

import hash_util
from wrappers import load_shared_mem
from wrappers import shared_buf_from_c_memory
from wrappers import dynamic_meta_from_c_memory
from wrappers import static_meta_from_schema
from wrappers import flush
from wrappers import unload_shared_mem

N_MARKER_BYTES = 8  # Markers are all u64s.
N_MARKERS = 8  # NUMBER_OF_MARKERS in datastore/memory.rs.
N_MARKERS_BYTES = N_MARKER_BYTES * N_MARKERS


def _load_markers_unchecked(mem):
    markers_bytes = mem[:N_MARKERS_BYTES].to_pybytes()

    # '<' implies little-endian.
    # '<' also implies standard sizes, so Q matches a u64.
    markers_fmt = "<" + "Q" * N_MARKERS
    return struct.unpack_from(markers_fmt, markers_bytes)


def load_markers(mem):
    markers = _load_markers_unchecked(mem)
    verify_markers(markers, mem)
    return markers


def verify_markers(markers, mem):
    assert len(markers) == N_MARKERS, markers

    # Same order as in `memory::shared_memory/markers.rs`.
    # Units are all numbers of bytes.
    (
        schema_offset,
        schema_size,
        header_offset,
        header_size,
        meta_offset,
        meta_size,
        data_offset,
        data_size,
    ) = markers

    # The "meta bytes" here do *not* contain the schema's key-value metadata.
    # They contain what is officially called a "RecordBatch message data header", but
    # the Rust implementation just calls it a "RecordBatch message".
    # https://arrow.apache.org/docs/format/Columnar.html#recordbatch-message

    # Schema comes immediately after markers.
    assert (
            schema_offset == N_MARKERS_BYTES
    ), f"schema_offset: {schema_offset}, n_markers_bytes: {N_MARKERS_BYTES}"
    assert schema_offset + schema_size <= header_offset
    assert header_offset + header_size <= meta_offset
    assert meta_offset + meta_size <= data_offset
    assert data_offset + data_size <= mem.size


def parse_any_type_fields(metadata):
    any_type_fields = set()

    # arrow2 serializes empty dictionaries as None (rather than `{}`, as arrow
    # did)
    if metadata is None:
        return any_type_fields

    field_names = metadata.get("any_type_fields")

    if field_names:
        for field_name in field_names.split(","):
            any_type_fields.add(field_name)

    return any_type_fields


def load_record_batch(mem, schema=None):
    (
        schema_offset,
        schema_size,
        _header_offset,
        _header_size,
        meta_offset,
        _meta_size,
        data_offset,
        data_size,
    ) = load_markers(mem)
    # Pyarrow exposes a function for parsing the record batch message data header and
    # record batch data together, but not functions for parsing them separately, so
    # they should be contiguous in memory. (Or have to use a hack to pretend that
    # what is between them is padding.)
    if schema is None:
        schema_buf = mem[schema_offset: schema_offset + schema_size]
        schema = pa.ipc.read_schema(schema_buf)

    record_batch_buf = mem[meta_offset: data_offset + data_size]
    record_batch = pa.ipc.read_record_batch(record_batch_buf, schema)

    any_type_fields = parse_any_type_fields(schema.metadata)
    return record_batch, any_type_fields


# Returns dataset name, dataset contents and whether JSON could be loaded.
def load_dataset(batch_id):
    mem = shared_buf_from_c_memory(load_shared_mem(batch_id))
    (_, _, header_offset, header_size, _, _, data_offset, data_size) = load_markers(mem)

    # The header has the shortname of the dataset
    n_metaversion_bytes = 8  # Memory u32 + batch u32 version
    name_offset = header_offset + n_metaversion_bytes  # Skip metaversion.
    header_end = header_offset + header_size
    name_buf = mem[name_offset:header_end]
    dataset_name = str(name_buf.to_pybytes().decode("utf-8"))

    # This data buffer has the dataset as a JSON string
    data_buf = mem[data_offset: data_offset + data_size]
    dataset_utf8 = data_buf.to_pybytes().decode("utf8")
    try:
        return dataset_name, json.loads(dataset_utf8), True
    except json.JSONDecodeError:
        # TODO: Extract parsing error line number from exception.
        return dataset_name, dataset_utf8, False


class Batch:
    def __init__(self, batch_id):
        self.id = batch_id

        self.mem_version = -1
        self.batch_version = -1
        # After loading, `mem` will be a shared buffer.
        self.mem = None
        # After loading, `record_batch` will be a record batch.
        self.record_batch = None
        # TODO: Remove `any_type_fields` after upgrading Arrow and putting metadata in individual
        #       columns.
        self.any_type_fields = None
        # Syncing erases columns that have become invalid.
        self.cols = {}

        # For flushing:
        self.c_memory = None
        self.dynamic_meta = None
        self.static_meta = None

    def load_persisted_metaversion(self):
        if self.mem is None:
            return 0, 0, None

        # Can't verify markers right now as `self.mem` maybe needs to be reloaded first (e.g. after
        # resizing)
        markers = _load_markers_unchecked(self.mem)
        (_, _, header_offset, _, _, _, _, _) = markers

        n_metaversion_bytes = 8  # Memory u32 + batch u32 version
        metaversion_buffer = self.mem[
                             header_offset: header_offset + n_metaversion_bytes
                             ]
        metaversion_bytes = metaversion_buffer.to_pybytes()
        mem_version, batch_version = struct.unpack_from("<II", metaversion_bytes)
        return mem_version, batch_version, markers

    def sync(self, batch, schema=None):
        (
            persisted_mem_version,
            persisted_batch_version,
            markers,
        ) = self.load_persisted_metaversion()

        should_load_batch = self.batch_version < persisted_batch_version
        if self.mem_version < persisted_mem_version:
            assert (
                should_load_batch
            ), "Should be impossible to have new memory without new batch"

            # `load_shared_mem` throws an exception if loading fails,
            # but otherwise the returned pointer to shared memory is non-null.
            self.c_memory = load_shared_mem(batch.id)
            self.mem = shared_buf_from_c_memory(self.c_memory)

            self.mem_version = persisted_mem_version

        if markers:
            verify_markers(markers, self.mem)

        if should_load_batch:
            self.record_batch, self.any_type_fields = load_record_batch(
                self.mem, schema
            )
            self.cols = {}  # Avoid using obsolete column data.
            self.static_meta = static_meta_from_schema(self.record_batch.schema)
            self.dynamic_meta = dynamic_meta_from_c_memory(self.c_memory)

            self.batch_version = persisted_batch_version

    def load_col(self, name, loader=None):
        i_field = self.record_batch.schema.get_field_index(name)
        if i_field < 0:
            raise RuntimeError(f"Missing field for {name}")

        field = self.record_batch.schema.field(i_field)
        vector = self.record_batch.column(i_field)
        is_any = name in self.any_type_fields
        if loader is not None:
            col = loader(vector, field.nullable, is_any)
        elif name.startswith("_PRIVATE_") or name.startswith("_HIDDEN_"):
            # only agent-scoped fields are fully loaded by default
            col = vector
        else:
            col = hash_util.load_full(vector, field.nullable, is_any)

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
            if field_name in skip or not isinstance(col, list) or len(col) == 0:
                # Assume that column wasn't written to or was writable in place.
                # TODO: More robust check for this (i.e. for shallow-loaded columns)
                continue

            i_field = schema.get_field_index(field_name)
            if i_field < 0:
                continue  # Not supposed to have this column in `cols`?

            field = schema.field(i_field)
            if field.name in any_type_fields:
                # Convert `any`-type array of JSON values to array of JSON strings
                # for Arrow serialization as a string column.
                py_col = [json.dumps(elem) for elem in col]
            elif isinstance(col[0], pa.Scalar):
                # Shallow-loaded column; can be modified in place
                continue
            else:
                # TODO: Custom loaders with intermediate level of shallow loading
                #       (These currently result in an exception from `pa.array`.)
                py_col = col

            changes.append(
                {"i_field": i_field, "data": pa.array(py_col, type=field.type)}
            )

        if len(changes) == 0:
            return

        self.batch_version += 1
        did_resize = flush(self.c_memory, self.dynamic_meta, self.static_meta, changes)
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
        #       (Call _free_rust_static_meta, _free_rust_dynamic_meta here?)
        #   see https://app.asana.com/0/1201461747883418/1201634225076144/f
        # TODO: Make this the `__del__` method?
        for batch in self.batches.values():
            unload_shared_mem(batch.c_memory)
        self.batches = {}
