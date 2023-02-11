use crate::{
    arrow::{meta, util::bit_util},
    error::Result,
    shared_memory::{padding, BufferChange, Segment},
};

mod arrow2_growable_array_data;

/// This is an interface which provides a way to extract the data we need about an Arrow array
/// in order to be able to grow it.
///
/// Can be implemented by ArrayData, ArrayDataRef, Python FFI array data.
pub trait GrowableArrayData: Sized + std::fmt::Debug {
    fn len(&self) -> usize;
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
    /// Returns the number of items which are null in the given array.
    fn null_count(&self) -> usize;
    /// This returns a bitmap, where the nth bit of the returned data specifies whether or not the
    /// nth item in the array is null or not.
    fn null_buffer(&self) -> Option<&[u8]>;
    /// Returns the nth buffer of this array. We follow the
    /// [specification](https://arrow.apache.org/docs/format/Columnar.html#buffer-listing-for-each-layout)
    /// _except_ that we don't return any validity bitmaps/null buffers here (these can be obtained
    /// instead by calling [`GrowableArrayData::null_buffer`]).
    #[allow(clippy::redundant_allocation)]
    fn buffer(&self, index: usize) -> &[u8];
    /// Arrow stores the null buffer separately from other buffers.
    fn non_null_buffer_count(&self) -> usize;
    /// This returns the data of the child arrays.
    fn child_data(&self) -> &[Self];
}

/// The info required about an Arrow column in order to grow it
pub trait GrowableColumn<D: GrowableArrayData>: Sized {
    fn index(&self) -> usize;
    fn data(&self) -> &D;
}

/// A batch that can be grown after creation.
///
/// Implementing this trait implies that `flush_changes` may alter the memory location.
///
/// This trait is useful for batches with dynamically sized Arrow columns, such as string columns,
/// and Arrow batches whose number of elements can change due to the number of agents changing, such
/// as components of state or context, or `PreparedBatch` used by Python FFI.
// TODO: Move `flush_changes` outside of trait and make it a function with type parameters and
//       remove the type parameters from the trait? (would simplify impl of this trait a bit; still
//       couldn't make the trait public (outside the datastore) though due to `memory_mut`)
pub trait GrowableBatch<D: GrowableArrayData, C: GrowableColumn<D>> {
    fn static_meta(&self) -> &meta::StaticMetadata;
    fn dynamic_meta(&self) -> &meta::DynamicMetadata;
    fn dynamic_meta_mut(&mut self) -> &mut meta::DynamicMetadata;
    fn segment(&self) -> &Segment;
    fn segment_mut(&mut self) -> &mut Segment;

    /// Persists all queued changes to memory, empties the queue and increments the
    /// [`crate::shared_memory::Metaversion`] of the persisted data (i.e. the data in the
    /// shared-memory [`Segment`]).
    ///
    /// Calculates all moves, copies and resizes required to persist the changes.
    ///
    /// # Errors
    ///
    /// If the loaded metaversion isn't equal to the persisted metaversion, this gives an error to
    /// avoid flushing stale data. (The loaded metaversion can't be newer than the persisted
    /// metaversion.)
    // TODO: We might have to remove this restriction to allow flushing multiple changes in a row.
    ///
    /// If the underlying segment has been corrupted somehow, this can give various errors.
    #[allow(clippy::too_many_lines)]
    fn flush_changes(&mut self, mut column_changes: Vec<C>) -> Result<BufferChange> {
        // Sort the changes by the order in which the columns are
        column_changes.sort_by_key(|c| c.index());

        let column_metas = self.static_meta().get_column_meta();

        let mut buffer_actions = Vec::with_capacity(self.dynamic_meta().buffers.len());
        let mut node_changes = vec![];

        let mut this_buffer_index = 0;
        let mut this_buffer_offset = 0;

        // Go over all of the pending changes, calculate target locations for those buffers
        // and neighbouring buffers if they need to be moved.
        column_changes.iter().for_each(|column_change| {
            let column_index = column_change.index();
            // `meta` contains the information about where to look in `self.dynamic_meta` for
            // current offset/node information
            let meta = &column_metas[column_index];

            let buffer_start = meta.buffer_start;
            // Depth-first is required, because this is the order in which
            // nodes are written into memory, see `write_static_array_data` in ./arrow/ipc.rs
            let array_datas = gather_array_datas_depth_first(column_change.data());

            // Iterate over buffers that are not modified, but might have to be moved,
            // because of preceding buffers which may have been moved/resized
            if this_buffer_index != buffer_start {
                this_buffer_offset = push_non_modify_actions(
                    &mut buffer_actions,
                    this_buffer_index,
                    buffer_start - 1,
                    this_buffer_offset,
                    self.dynamic_meta(),
                );
                this_buffer_index = buffer_start;
            }

            // A column can consist of more than one node. For example a field that is
            // List<u8> corresponds to a column with 2 nodes
            array_datas.iter().enumerate().for_each(|(i, array_data)| {
                let node_index = meta.node_start + i;
                // Update Node information
                node_changes.push((node_index, meta::Node {
                    null_count: array_data.null_count(),
                    length: array_data.len(),
                }));

                // Null buffer calculation.
                // The null buffer is always the first buffer in a column,
                // it is found under `array_data.null_buffer()` and
                // NOT under `array_data.buffers()[0]`
                {
                    let num_bytes = bit_util::ceil(array_data.len(), 8);
                    let next_buffer_offset = self
                        .dynamic_meta()
                        .buffers
                        .get(this_buffer_index + 1)
                        .map_or_else(|| self.dynamic_meta().data_length, |v| v.offset);
                    let new_padding = padding::maybe_new_dynamic_pad(
                        this_buffer_offset,
                        num_bytes,
                        next_buffer_offset,
                    );
                    // Safety: A null buffer is always followed by another buffer
                    if let Some(b) = array_data.null_buffer().as_ref() {
                        buffer_actions.push(meta::BufferAction::Ref {
                            index: this_buffer_index,
                            offset: this_buffer_offset,
                            padding: new_padding,
                            buffer: b,
                        });
                    } else {
                        // We know all values must be valid.
                        // Hence we have to make a homogeneous
                        // null buffer corresponding to valid values
                        let buffer = vec![255_u8; num_bytes];

                        buffer_actions.push(meta::BufferAction::Owned {
                            index: this_buffer_index,
                            offset: this_buffer_offset,
                            padding: new_padding,
                            buffer,
                        });
                    }

                    this_buffer_index += 1;
                    let total_buffer_length = num_bytes + new_padding;
                    this_buffer_offset += total_buffer_length;
                }

                // Go over offset/data buffers (these are not null buffers)
                // Have to do `meta.buffer_counts[i] - 1` because the null buffer is
                // separate
                debug_assert_eq!(
                    meta.buffer_counts[i] - 1,
                    array_data.non_null_buffer_count(),
                    "Number of buffers in metadata does not match actual number of buffers"
                );
                // TODO: when adding datatypes with no null buffer (the null datatype), then this
                //   convention does not work
                (0..meta.buffer_counts[i] - 1).for_each(|j| {
                    let buffer = array_data.buffer(j);
                    let new_len = buffer.len();
                    let next_buffer_offset = self
                        .dynamic_meta()
                        .buffers
                        .get(this_buffer_index + 1)
                        .map_or_else(|| self.dynamic_meta().data_length, |v| v.offset);
                    let new_padding = padding::maybe_new_dynamic_pad(
                        this_buffer_offset,
                        new_len,
                        next_buffer_offset,
                    );
                    buffer_actions.push(meta::BufferAction::Ref {
                        index: this_buffer_index,
                        offset: this_buffer_offset,
                        padding: new_padding,
                        buffer,
                    });
                    this_buffer_offset += new_len + new_padding;
                    this_buffer_index += 1;
                });
            });
        });

        // There can be buffers at the end which have not been
        // attended to yet. Create actions for them too and use
        // the chance to update final data length
        let last_buffer_index = self.static_meta().get_padding_meta().len() - 1;
        self.dynamic_meta_mut().data_length = push_non_modify_actions(
            &mut buffer_actions,
            this_buffer_index,
            last_buffer_index,
            this_buffer_offset,
            self.dynamic_meta(),
        );
        let data_length = self.dynamic_meta().data_length;
        // Resize memory if needed
        let change = self.segment_mut().set_data_length(data_length)?;
        debug_assert_eq!(
            self.dynamic_meta().data_length,
            self.segment().get_data_buffer()?.len(),
            "Size of new data to write and size of data buffer must be equal, because we just \
             resized the data buffer"
        );

        // Iterate backwards over every buffer action and perform them
        // Also update offset information in `self.dynamic_meta`
        buffer_actions
            .into_iter()
            .rev()
            .try_for_each(|action| match action {
                meta::BufferAction::Move {
                    old_offset,
                    old_total_length,
                    new_offset,
                    first_index,
                    last_index,
                } => {
                    // We shouldn't be left-shifting buffers
                    debug_assert!(
                        old_offset <= new_offset,
                        "Flush shouldn't left-shift buffers"
                    );
                    (first_index..=last_index).for_each(|j| {
                        // To avoid the modular nature of unsigned int subtraction:
                        self.dynamic_meta_mut().buffers[j].offset += new_offset;
                        self.dynamic_meta_mut().buffers[j].offset -= old_offset;
                    });

                    self.segment_mut().copy_in_data_buffer_unchecked(
                        old_offset,
                        new_offset,
                        old_total_length,
                    )
                }
                meta::BufferAction::Owned {
                    index,
                    offset,
                    padding,
                    buffer,
                } => {
                    let dynamic_meta = self.dynamic_meta_mut();
                    dynamic_meta.buffers[index].offset = offset;
                    dynamic_meta.buffers[index].padding = padding;
                    dynamic_meta.buffers[index].length = buffer.len();
                    self.segment_mut()
                        .overwrite_in_data_buffer_unchecked_nonoverlapping(offset, &buffer)
                }
                meta::BufferAction::Ref {
                    index,
                    offset,
                    padding,
                    buffer,
                } => {
                    let dynamic_meta = self.dynamic_meta_mut();
                    dynamic_meta.buffers[index].offset = offset;
                    dynamic_meta.buffers[index].padding = padding;
                    dynamic_meta.buffers[index].length = buffer.len();
                    self.segment_mut()
                        .overwrite_in_data_buffer_unchecked_nonoverlapping(offset, buffer.as_ref())
                }
            })?;

        // Update `FieldNode` data with null_count/element count values
        node_changes.into_iter().for_each(|(i, n)| {
            self.dynamic_meta_mut().nodes[i] = n;
        });

        // Write `self.dynamic_meta` in Arrow format into the `meta_buffer` in `self.memory`
        let dynamic_meta = self.dynamic_meta();
        let new_data_length =
            dynamic_meta.buffers[dynamic_meta.buffers.len() - 1].get_next_offset();
        debug_assert!(
            self.static_meta().validate_lengths(self.dynamic_meta()),
            "New dynamic metadata row count is inconsistent with existing static metadata"
        );
        let change = change.combine(self.segment_mut().set_data_length(new_data_length)?);
        let meta_buffer = self.dynamic_meta().get_flatbuffers()?;
        let change = change.combine(self.segment_mut().set_metadata(&meta_buffer)?);

        if cfg!(debug_assertions) {
            self.segment().validate_markers()?;
        }
        Ok(change)
    }
}

/// Add an action for buffer(s) whose data is not changed but might have to be moved
fn push_non_modify_actions(
    buffer_actions: &mut Vec<meta::BufferAction>,
    first_index: usize,
    last_index: usize,
    mut this_buffer_offset: usize,
    dynamic_meta: &meta::DynamicMetadata,
) -> usize {
    if first_index > last_index {
        // No non-modify actions needed
        return this_buffer_offset;
    }

    let first_buffer = &dynamic_meta.buffers[first_index];
    let last_buffer = &dynamic_meta.buffers[last_index];

    if first_buffer.offset == this_buffer_offset {
        // The buffer can remain in the same place
        this_buffer_offset = last_buffer.offset + last_buffer.length + last_buffer.padding;
    } else {
        let length =
            last_buffer.offset - first_buffer.offset + last_buffer.length + last_buffer.padding;
        buffer_actions.push(meta::BufferAction::Move {
            old_offset: first_buffer.offset,
            old_total_length: length,
            new_offset: this_buffer_offset,
            first_index,
            last_index,
        });
        this_buffer_offset += length;
    }
    this_buffer_offset
}

/// This function performs a depth-first pre-order (i.e. it searches first the root node and then
/// all the subtrees from left-to-right) traversal of the nodes (this is as per the
/// [Arrow specification](https://arrow.apache.org/docs/format/Columnar.html)).
fn gather_array_datas_depth_first<D: GrowableArrayData>(data: &D) -> Vec<&D> {
    let mut ret = vec![data];
    // Depth-first get all nodes
    data.child_data().iter().for_each(|v| {
        ret.append(&mut gather_array_datas_depth_first(v));
    });
    ret
}
