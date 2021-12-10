use crate::datastore::{
    arrow::{meta_conversion::get_dynamic_meta_flatbuffers, padding},
    error::Result,
    prelude::*,
};

pub trait GrowableArrayData: Sized + std::fmt::Debug {
    fn _len(&self) -> usize;
    fn _null_count(&self) -> usize;
    fn _null_buffer(&self) -> Option<&[u8]>;
    fn _get_buffer(&self, index: usize) -> &[u8];
    fn _get_non_null_buffer_count(&self) -> usize;
    fn _child_data(&self) -> &[Self];
}

pub trait GrowableColumn<D: GrowableArrayData> {
    fn get_column_index(&self) -> usize;
    fn get_data(&self) -> &D;
}

pub trait GrowableBatch<C: GrowableColumn<D>, D: GrowableArrayData> {
    fn take_changes(&mut self) -> Vec<C>;
    fn static_meta(&self) -> &StaticMeta;
    fn dynamic_meta(&self) -> &DynamicMeta;
    fn mut_dynamic_meta(&mut self) -> &mut DynamicMeta;
    fn memory(&self) -> &Memory;
    fn mut_memory(&mut self) -> &mut Memory;
    /// All changes that have been added into `self.changes` are commited into memory.
    /// Calculates all moves, copies and resizes required to commit the changes.
    #[allow(clippy::too_many_lines)]
    fn flush_changes(&mut self) -> Result<bool> {
        let mut changes = self.take_changes();
        // Sort the changes by the order in which the columns are
        changes.sort_by_key(|a| a.get_column_index());

        let column_metas = self.static_meta().get_column_meta();

        let mut buffer_actions = Vec::with_capacity(self.dynamic_meta().buffers.len());
        let mut node_changes = vec![];

        let mut this_buffer_index = 0;
        let mut this_buffer_offset = 0;

        // Go over all of the pending changes, calculate target locations for those buffers
        // and neighbouring buffers if they need to be moved.
        changes.iter().for_each(|array_data| {
            let column_index = array_data.get_column_index();
            // `meta` contains the information about where to look in `self.dynamic_meta` for
            // current offset/node information
            let meta = &column_metas[column_index];

            let buffer_start = meta.buffer_start;
            // Depth-first is required, because this is the order in which
            // nodes are written into memory, see `write_static_array_data` in ./arrow/ipc.rs
            let array_datas = gather_array_datas_depth_first(array_data.get_data());

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
                node_changes.push((node_index, Node {
                    null_count: array_data._null_count(),
                    length: array_data._len(),
                }));

                // Null buffer calculation.
                // The null buffer is always the first buffer in a column,
                // it is found under `array_data.null_buffer()` and
                // NOT under `array_data.buffers()[0]`
                {
                    let num_bytes = arrow_bit_util::ceil(array_data._len(), 8);
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
                    if let Some(b) = array_data._null_buffer() {
                        buffer_actions.push(BufferAction::Ref {
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

                        buffer_actions.push(BufferAction::Owned {
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
                // Have to do `meta.buffer_counts[i] - 1` because the null buffer is separate
                debug_assert_eq!(
                    meta.buffer_counts[i] - 1,
                    array_data._get_non_null_buffer_count()
                );
                // todo: when adding datatypes with no null buffer (the null datatype), then this
                //   convention does not work
                (0..meta.buffer_counts[i] - 1).for_each(|j| {
                    let buffer = array_data._get_buffer(j);
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
                    buffer_actions.push(BufferAction::Ref {
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
        self.mut_dynamic_meta().data_length = push_non_modify_actions(
            &mut buffer_actions,
            this_buffer_index,
            last_buffer_index,
            this_buffer_offset,
            self.dynamic_meta(),
        );
        let data_length = self.dynamic_meta().data_length;
        // Resize memory if needed
        let change = self.mut_memory().set_data_length(data_length)?;

        debug_assert!(self.dynamic_meta().data_length == self.memory().get_data_buffer()?.len());

        // Iterate backwards over every buffer action and perform them
        // Also update offset information in `self.dynamic_meta`
        buffer_actions
            .into_iter()
            .rev()
            .try_for_each(|action| match action {
                BufferAction::Move {
                    old_offset,
                    old_total_length,
                    new_offset,
                    first_index,
                    last_index,
                } => {
                    // We shouldn't be left-shifting buffers
                    debug_assert!(old_offset <= new_offset);
                    (first_index..=last_index).for_each(|j| {
                        // To avoid the modular nature of unsigned int subtraction:
                        self.mut_dynamic_meta().buffers[j].offset += new_offset;
                        self.mut_dynamic_meta().buffers[j].offset -= old_offset;
                    });

                    self.mut_memory().copy_in_data_buffer_unchecked(
                        old_offset,
                        new_offset,
                        old_total_length,
                    )
                }
                BufferAction::Owned {
                    index,
                    offset,
                    padding,
                    buffer,
                } => {
                    let dynamic_meta = self.mut_dynamic_meta();
                    dynamic_meta.buffers[index].offset = offset;
                    dynamic_meta.buffers[index].padding = padding;
                    dynamic_meta.buffers[index].length = buffer.len();
                    self.mut_memory()
                        .overwrite_in_data_buffer_unchecked_nonoverlapping(offset, &buffer)
                }
                BufferAction::Ref {
                    index,
                    offset,
                    padding,
                    buffer,
                } => {
                    let dynamic_meta = self.mut_dynamic_meta();
                    dynamic_meta.buffers[index].offset = offset;
                    dynamic_meta.buffers[index].padding = padding;
                    dynamic_meta.buffers[index].length = buffer.len();
                    self.mut_memory()
                        .overwrite_in_data_buffer_unchecked_nonoverlapping(offset, buffer)
                }
            })?;

        // Update `FieldNode` data with null_count/element count values
        node_changes.into_iter().for_each(|(i, n)| {
            self.mut_dynamic_meta().nodes[i] = n;
        });

        // Write `self.dynamic_meta` in Arrow format into the `meta_buffer` in `self.memory`
        let dynamic_meta = self.dynamic_meta();
        let new_data_length =
            dynamic_meta.buffers[dynamic_meta.buffers.len() - 1].get_next_offset();
        debug_assert!(self.static_meta().validate_lengths(self.dynamic_meta()));
        self.mut_memory().set_data_length(new_data_length)?;
        let meta_buffer = get_dynamic_meta_flatbuffers(self.dynamic_meta())?;
        self.mut_memory().set_metadata(&meta_buffer)?;
        debug_assert!(self.memory().validate_markers());
        Ok(change.resized())
    }
}

/// Add an action for buffer(s) whose data is not changed but might have to be moved
fn push_non_modify_actions(
    buffer_actions: &mut Vec<BufferAction>,
    first_index: usize,
    last_index: usize,
    mut this_buffer_offset: usize,
    dynamic_meta: &DynamicMeta,
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
        buffer_actions.push(BufferAction::Move {
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

fn gather_array_datas_depth_first<'a, D: GrowableArrayData>(array_ref: &'a D) -> Vec<&'a D> {
    let mut ret = vec![array_ref];
    // Depth-first get all nodes
    array_ref._child_data().iter().for_each(|v| {
        ret.append(&mut gather_array_datas_depth_first(v));
    });
    ret
}
