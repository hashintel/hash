use arrow2::array::Array;

use super::{arrow2_growable_array_data::child_data, ArrowBatch};
use crate::{
    arrow::{
        batch::arrow2_growable_array_data::{buffer, non_null_buffer_count, null_buffer},
        len, meta, null_count,
        util::bit_util,
        ColumnChange,
    },
    error::Result,
    shared_memory::{padding, BufferChange},
};

impl ArrowBatch {
    pub fn flush_column_changes(
        &mut self,
        mut column_changes: Vec<ColumnChange>,
    ) -> Result<BufferChange> {
        tracing::trace!("flushing column changes");
        // Sort the changes by the order in which the columns are
        column_changes.sort_by_key(|c| c.index);

        let column_metas = self.static_meta().get_column_meta();

        let mut buffer_actions = Vec::with_capacity(self.dynamic_meta().buffers.len());
        let mut node_changes = vec![];

        let mut this_buffer_index = 0;
        let mut this_buffer_offset = 0;

        // Go over all of the pending changes, calculate target locations for those buffers
        // and neighbouring buffers if they need to be moved.
        column_changes.iter().for_each(|column_change| {
            let column_index = column_change.index;
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
            array_datas
                .into_iter()
                .enumerate()
                // note: the explicit type is here because this was previously
                // the source of a number of lifetime problems
                .for_each(|(i, array_data): (usize, &Box<dyn Array>)| {
                    let node_index = meta.node_start + i;
                    // Update Node information
                    node_changes.push((node_index, meta::Node {
                        null_count: null_count(array_data.as_ref()),
                        length: len(array_data.as_ref()),
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
                        if let Some(b) = null_buffer(array_data.as_ref()).as_ref() {
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
                        non_null_buffer_count(array_data.as_ref()),
                        "Number of buffers in metadata does not match actual number of buffers"
                    );
                    // TODO: when adding datatypes with no null buffer (the null datatype), then
                    // this   convention does not work
                    (0..meta.buffer_counts[i] - 1).for_each(|j| {
                        let buffer = buffer(array_data.as_ref(), j);
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
fn gather_array_datas_depth_first(data: &Box<dyn Array>) -> Vec<&Box<dyn Array>> {
    let mut ret = vec![data];
    // Depth-first get all nodes
    child_data(data).iter().for_each(|v| {
        ret.append(&mut gather_array_datas_depth_first(v));
    });
    ret
}
