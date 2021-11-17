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

    # Same order as `struct Offsets` in datastore/memory.rs.
    # Units are all numbers of bytes.
    schema_offset = markers[0]
    schema_size = markers[1]
    header_offset = markers[2]
    header_size = markers[3]
    meta_offset = markers[4]
    meta_size = markers[5]
    data_offset = markers[6]
    data_size = markers[7]

    # The "meta bytes" here do *not* contain the schema's key-value metadata.
    # They contain what is officially called a "RecordBatch message data header", but
    # the Rust implementation just calls it a "RecordBatch message".
    # https://arrow.apache.org/docs/format/Columnar.html#recordbatch-message

    # Schema comes immediately after markers.
    assert schema_offset == n_markers_bytes, "schema_offset: {}, n_markers_bytes: {}".format(schema_offset,
                                                                                             n_markers_bytes)
    assert schema_offset + schema_size <= header_offset
    assert header_offset + header_size <= meta_offset
    assert meta_offset + meta_size <= data_offset
    assert data_offset + data_size <= mem.size
    return schema_offset, schema_size, header_offset, header_size, meta_offset, meta_size, data_offset, data_size


def load_record_batch(mem, schema=None):
    schema_offset, schema_size, header_offset, header_size, \
    meta_offset, _, data_offset, data_size = load_markers(mem)
    # Pyarrow exposes a function for parsing the record batch message data header and
    # record batch data together, but not functions for parsing them separately, so
    # they should be contiguous in memory. (Or have to use a hack to pretend that
    # what is between them is padding.)
    if schema is None:
        schema_buf = mem[schema_offset: schema_offset + schema_size]
    rb_buf = mem[meta_offset: data_offset + data_size]

    if schema is None:
        schema = pa.ipc.read_schema(schema_buf)
    rb = pa.ipc.read_record_batch(rb_buf, schema)

    # Put data about `any` types and nullability directly in record batch.
    for i_field in range(len(rb.num_columns)):
        field = rb.schema.field(i_field)
        vector = rb.column(i_field)
        vector.type.is_any = field.metadata[b'is_any'].decode()
        vector.type.is_nullable = field.nullable

    return rb


class Batch:
    def __init__(self):
        self.mem_version = -1
        self.batch_version = -1
        self.mem = None  # After loading, `mem` will be a shared buffer.
        self.rb = None  # After loading, `rb` will be a record batch.
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
            self.c_memory = load_shared_mem(batch_id)
            self.mem = shared_buf_from_c_memory(self.c_memory)
            self.dynamic_meta = dynamic_meta_from_c_memory(self.c_memory)

        if should_load:
            self.batch_version = latest_batch.batch_version
            self.rb = load_record_batch(self.mem, schema)
            self.cols = {}
            self.static_meta = static_meta_from_schema(self.rb.schema)

    def load_col(self, name, loader=None):
        vector = self.rb.column(name)
        if not vector:
            raise RuntimeError("Missing vector for " + name)

        if loader is not None:
            col = loader(vector)
        elif name[:2] == '__':
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
        # Dynamically accessed columns (if any) were added to `cols` by `state`.
        changes = []
        for field_name, col in self.cols.items():
            if type(col) is not list or skip[field_name]:
                continue  # Column wasn't written to or was writable in place.

            i_field = schema.get_field_index(field_name)
            if i_field < 0:
                continue  # Not supposed to have this column in `cols`?

            field = schema.field(i_field)
            if field.metadata[b'is_any'].decode():
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
        did_resize = _flush_changes(
            self.c_memory, self.dynamic_meta, self.static_meta, changes
        )
        if did_resize:
            # `c_memory` is updated inside `_flush_changes` if memory is resized.
            self.mem_version += 1
            self.mem = shared_buf_from_c_memory(self.c_memory)
            self.dynamic_meta = dynamic_meta_from_c_memory(self.c_memory)

    def flush_messages():
        for i_agent, agent_msgs in enumerate(outbox["messages"]):
            if are_msgs_native[i_agent]:
                for m in agent_msgs:
                    m["data"] = json_dumps(m["data"])
                # No need to set `are_msgs_native[i_agent] = False`, because
                # it won't be used anymore -- messages are flushed below.

        # TODO: Only flush changes if there are changed messages.
        msgs_index = self.msg_schema.get_field_index("messages")
        field = self.msg_schema.field(msgs_index)
        outbox_changes = {
            msgs_index: pa.array(outbox["messages"], type=field.type)
        }
        resized_outbox = flush(
            outbox["c_memory"],
            outbox["dynamic_meta"],
            self.msg_static_meta,
            outbox_changes
        )
        if resized_outbox:
            outbox["mem_version"] += 1
            outbox["shared_buf"] = shared_buf_from_c_memory(outbox["c_memory"])


class Batches:
    def __init__(self):
        self.batches = {}

    def get(self, batch_id):
        return self.batches[batch_id]

    def sync(self, latest_batch):
        loaded_batch = self.batches.get(latest_batch.id)
        if loaded_batch is None:
            self.batches[latest_batch.id] = loaded_batch = Batch()

        # `loaded_batch` is changed in-place. Return is for convenience.
        loaded_batch.sync(latest_batch)
        return loaded_batch
