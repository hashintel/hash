#![allow(clippy::cast_sign_loss, clippy::cast_ptr_alignment)]

use std::{borrow::Cow, mem, sync::Arc};

use arrow2::array::Array;
use bytemuck::cast_slice;
use memory::{
    arrow::{
        flush::GrowableArrayData,
        meta::{self, Buffer, Node, NodeMapping},
        record_batch::RecordBatch,
        util::bit_util,
    },
    shared_memory::{padding, MemoryId, Segment},
};
use stateful::{
    agent::{AgentBatch, AgentSchema},
    message::{MessageBatch, MessageSchema},
};
use tracing::trace;

use crate::command::{Error, Result};

type Offset = i32;

static EMPTY_OFFSET_BUFFER: [u8; 4] = [0, 0, 0, 0];

pub type RemoveAction = IndexAction;
pub type CopyAction = IndexAction;
pub type CreateAction = IndexAction;

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct IndexAction {
    pub val: usize,
}

impl PartialOrd for IndexAction {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.val.cmp(&other.val))
    }
}

impl Ord for IndexAction {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.val.cmp(&other.val)
    }
}

#[derive(Debug, Clone)]
pub struct RowActions {
    pub remove: Vec<RemoveAction>,
    pub copy: Vec<(usize, Vec<CopyAction>)>,
    pub create: Vec<CreateAction>,
}

#[derive(Debug, Clone)]
pub struct InnerMoveAction {
    pub byte_offset: usize,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone)]
/// TODO: doc
pub enum InnerCreateAction<'a> {
    Data {
        byte_offset: usize,
        data: &'a [u8],
    },
    Offset {
        // offset values
        data: &'a [i32],
        offset_shift: i32,
        /// new index of the base offset, relative to the start of the buffer
        base_offset_index: usize,
    },
}

#[derive(Debug, Clone)]
pub enum InnerShiftAction {
    /// Move a slice of existing buffer by an offset `offset` is the start byte index of the
    /// sub-buffer inside the old buffer. `len` is the length of the sub-buffer. `dest_offset` is
    /// the relative location inside the old buffer where this sub-buffer will be inserted.
    Data {
        offset: usize,
        len: usize,
        dest_offset: usize,
    },
    /// Markers need to be shifted if data is deleted, indices are per i32 index.
    Offset {
        // Starting old index relative to the offset of the old buffer
        from: usize,
        len: usize,
        // amount by which to decrement the data to be copied
        offset_value_dec: i32,
        // new index of the base offset, relative to the start of the buffer
        base_offset_index: usize,
    },
}

impl InnerShiftAction {
    fn get_buffer_length(&self) -> usize {
        match self {
            InnerShiftAction::Data {
                offset: _,
                len,
                dest_offset,
            } => dest_offset + len,
            InnerShiftAction::Offset {
                from: _,
                len,
                offset_value_dec: _,
                base_offset_index,
            } => (len + base_offset_index) * mem::size_of::<Offset>(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum BufferActionVariant<'a> {
    Replace {
        data: Vec<u8>,
    },
    Tweak {
        // Shift actions are the results of removing data.
        // shift_actions.len() == (remove_actions.len() || remove_actions.len() + 1)
        shift: Vec<InnerShiftAction>,
        copy: Option<InnerMoveAction>,
        create: Option<Vec<InnerCreateAction<'a>>>,
    },
}

#[derive(Debug, Clone)]
pub struct BufferAction<'a> {
    variant: BufferActionVariant<'a>,
    old_offset: usize,
    old_length: usize,
}

#[derive(Debug, Clone)]
pub struct BufferActions<'a> {
    pub actions: Vec<BufferAction<'a>>,
    pub new_dynamic_meta: meta::DynamicMetadata,
}

#[derive(Debug, Clone)]
struct NextState {
    node_index: usize,
    buffer_index: usize,
    buffer_offset: usize,
    node_index_in_column: usize,
}

impl<'a> BufferActions<'a> {
    pub fn new_batch(
        &self,
        agent_schema: &Arc<AgentSchema>,
        message_schema: &Arc<MessageSchema>,
        agent_memory_id: MemoryId,
        message_memory_id: MemoryId,
        worker_index: usize,
    ) -> Result<(AgentBatch, MessageBatch)> {
        let mut memory = AgentBatch::get_prepared_memory_for_data(
            agent_schema,
            &self.new_dynamic_meta,
            agent_memory_id,
        )?;
        self.flush_memory(&mut memory)?;

        let agent_batch =
            AgentBatch::from_segment(memory, Some(agent_schema.as_ref()), Some(worker_index))?;
        let message_batch =
            MessageBatch::empty_from_agent_batch(&agent_batch, message_schema, message_memory_id)?;

        Ok((agent_batch, message_batch))
    }

    #[allow(clippy::too_many_lines)]
    pub fn flush_memory(&self, memory: &mut Segment) -> Result<()> {
        let buffer_count = self.new_dynamic_meta.buffers.len();
        debug_assert_eq!(buffer_count, self.actions.len());
        let data_buffer = memory.get_mut_data_buffer()?;
        // Iterate backwards over actions (as we never left-shift buffers)
        (0..buffer_count)
            .rev()
            .try_for_each::<_, Result<()>>(|buffer_index| {
                let action = &self.actions[buffer_index];
                let variant = &action.variant;
                let old_offset = action.old_offset;
                let old_length = action.old_length;
                let (new_offset, new_length) = {
                    let meta = &self.new_dynamic_meta.buffers[buffer_index];
                    (meta.offset, meta.length)
                };

                match variant {
                    BufferActionVariant::Replace { data } => {
                        data_buffer[new_offset..new_offset + data.len()].copy_from_slice(data);
                    }
                    BufferActionVariant::Tweak {
                        shift,
                        copy,
                        create,
                    } => {
                        // Perform shifts (i.e. deletions)
                        let base_right_shift = new_offset - old_offset;
                        if base_right_shift == 0 {
                            // Iterate left to right because we know that
                            // we're not right-shifting inside the buffer
                            shift.iter().for_each(|shift_action| match shift_action {
                                InnerShiftAction::Data {
                                    offset,
                                    len,
                                    dest_offset,
                                } => {
                                    let start_offset = old_offset + *offset;
                                    let end_offset = start_offset + *len;
                                    let dest_offset = new_offset + *dest_offset;
                                    data_buffer.copy_within(start_offset..end_offset, dest_offset);
                                }
                                InnerShiftAction::Offset {
                                    from,
                                    len,
                                    offset_value_dec,
                                    base_offset_index,
                                } => {
                                    // As we're not shifting the first sub-buffer
                                    // then we can ignore it.
                                    if *len != 0 && *from != 0 {
                                        let offset_size = mem::size_of::<Offset>();
                                        let start_offset = old_offset + *from * offset_size;
                                        let byte_len = len * offset_size;
                                        // TODO: SAFETY
                                        let old_offsets = unsafe {
                                            data_buffer[start_offset..start_offset + byte_len]
                                                .align_to::<i32>()
                                                .1
                                        };
                                        let new_start_offset =
                                            new_offset + *base_offset_index * offset_size;
                                        debug_assert!(start_offset >= new_start_offset);
                                        let decrement = offset_value_dec;
                                        // We are going left-to-right so we can at most change the
                                        // same value we're inspecting
                                        // TODO: SAFETY
                                        let new_offsets = unsafe {
                                            let ptr: *const u8 = &data_buffer[new_start_offset];
                                            let ptr = ptr as *mut Offset;
                                            std::slice::from_raw_parts_mut(ptr, *len)
                                        };
                                        new_offsets.iter_mut().enumerate().for_each(
                                            |(i, offset_value)| {
                                                *offset_value = old_offsets[i] - decrement;
                                            },
                                        );
                                    }
                                }
                            });
                        } else if base_right_shift + new_length >= old_length {
                            // Iterate right to left because we know that
                            // we're not left-shifting inside the buffer
                            shift
                                .iter()
                                .rev()
                                .for_each(|shift_action| match shift_action {
                                    InnerShiftAction::Data {
                                        offset,
                                        len,
                                        dest_offset,
                                    } => {
                                        let start_offset = old_offset + *offset;
                                        let end_offset = start_offset + *len;
                                        let dest_offset = new_offset + *dest_offset;
                                        data_buffer
                                            .copy_within(start_offset..end_offset, dest_offset);
                                    }
                                    InnerShiftAction::Offset {
                                        from,
                                        len,
                                        offset_value_dec,
                                        base_offset_index,
                                    } => {
                                        let offset_size = mem::size_of::<Offset>();
                                        let start_offset = old_offset + *from * offset_size;
                                        let byte_len = len * offset_size;
                                        // TODO: SAFETY (same as above?)
                                        let old_offsets = unsafe {
                                            data_buffer[start_offset..start_offset + byte_len]
                                                .align_to::<i32>()
                                                .1
                                        };
                                        let new_start_offset =
                                            new_offset + *base_offset_index * offset_size;

                                        let decrement = offset_value_dec;
                                        // TODO: SAFETY (same as above?)
                                        let new_offsets = unsafe {
                                            let ptr = &data_buffer[new_start_offset] as *const u8;
                                            let ptr = ptr as *mut Offset;
                                            std::slice::from_raw_parts_mut(ptr, *len)
                                        };
                                        new_offsets.iter_mut().enumerate().rev().for_each(
                                            |(i, offset_value)| {
                                                *offset_value = old_offsets[i] - decrement;
                                            },
                                        );
                                    }
                                });
                        } else {
                            // We're both right and left shifting, this has
                            // no good ordering, so perform a clone and overwrite
                            // in full
                            let target_length = shift
                                .last()
                                .ok_or(Error::EmptyShiftActionVector)?
                                .get_buffer_length();

                            let mut temporary_buffer = vec![0; target_length];
                            shift.iter().for_each(|shift_action| match shift_action {
                                InnerShiftAction::Data {
                                    offset,
                                    len,
                                    dest_offset,
                                } => {
                                    let start_offset = old_offset + *offset;
                                    let end_offset = start_offset + *len;
                                    let dest_temp_offset = *dest_offset;
                                    let slice = &data_buffer[start_offset..end_offset];
                                    temporary_buffer[dest_temp_offset..dest_temp_offset + *len]
                                        .copy_from_slice(slice);
                                }
                                InnerShiftAction::Offset {
                                    from,
                                    len,
                                    offset_value_dec,
                                    base_offset_index,
                                } => {
                                    if *len != 0 {
                                        let offset_size = mem::size_of::<Offset>();
                                        let start_offset = old_offset + *from * offset_size;
                                        let byte_len = len * offset_size;
                                        // TODO: SAFETY (same as above?)
                                        let old_offsets = unsafe {
                                            data_buffer[start_offset..start_offset + byte_len]
                                                .align_to::<i32>()
                                                .1
                                        };
                                        let new_temp_start_offset =
                                            *base_offset_index * offset_size;
                                        let decrement = offset_value_dec;
                                        // TODO: SAFETY (same as above?)
                                        let new_offsets = unsafe {
                                            temporary_buffer
                                                [new_temp_start_offset..new_temp_start_offset + len]
                                                .align_to_mut::<i32>()
                                                .1
                                        };
                                        new_offsets.iter_mut().enumerate().for_each(
                                            |(i, offset_value)| {
                                                *offset_value = old_offsets[i] - decrement;
                                            },
                                        );
                                    }
                                }
                            });
                            // Finally, copy temporary buffer into data buffer
                            data_buffer[new_offset..new_offset + temporary_buffer.len()]
                                .copy_from_slice(&temporary_buffer);
                        }

                        // Perform moves
                        if let Some(move_action) = copy {
                            let target_offset = new_offset + move_action.byte_offset;
                            data_buffer[target_offset..target_offset + move_action.data.len()]
                                .copy_from_slice(&move_action.data);
                        }
                        let mut is_offset = false;
                        // Perform create
                        if let Some(create_actions) = create {
                            create_actions
                                .iter()
                                .for_each(|create_action| match create_action {
                                    InnerCreateAction::Data { byte_offset, data } => {
                                        let offset = new_offset + byte_offset;
                                        debug_assert!(byte_offset + data.len() <= new_length);
                                        data_buffer[offset..offset + data.len()]
                                            .copy_from_slice(data);
                                    }
                                    InnerCreateAction::Offset {
                                        data,
                                        offset_shift,
                                        base_offset_index,
                                    } => {
                                        let start_offset = new_offset
                                            + base_offset_index * mem::size_of::<Offset>();
                                        let end_offset =
                                            start_offset + data.len() * mem::size_of::<Offset>();
                                        // TODO: SAFETY (same as above?)
                                        let new_offsets = unsafe {
                                            data_buffer[start_offset..end_offset]
                                                .align_to_mut::<i32>()
                                                .1
                                        };
                                        new_offsets.iter_mut().enumerate().for_each(
                                            |(index, offset_value)| {
                                                *offset_value = data[index] + *offset_shift;
                                            },
                                        );
                                        is_offset = true;
                                    }
                                });
                        }
                    }
                }
                Ok(())
            })?;

        Ok(())
    }

    pub fn flush(&self, agent_batch: &mut AgentBatch) -> Result<()> {
        let batch = &mut agent_batch.batch;
        // TODO: Replace unversioned access to batch with higher-level access
        //       (checking loaded and persisted metaversions) and ideally
        //       rearrange modules so migration doesn't have access to
        //       internal batch traits.
        debug_assert!(
            batch.is_persisted(),
            "Can't flush migration changes when haven't loaded latest persisted agent batch"
        );
        debug_assert!(
            offsets_start_at_zero(batch.segment(), batch.static_meta(), batch.dynamic_meta())
                .is_ok(),
            "Can't flush migration changes, because agent batch already contains invalid offsets"
        );

        let change = batch
            .segment_mut()
            .set_data_length(self.new_dynamic_meta.data_length)?;
        batch.loaded_metaversion_mut().increment_with(&change);
        self.flush_memory(batch.segment_mut())?;
        let loaded = batch.loaded_metaversion();
        batch.segment_mut().persist_metaversion(loaded);

        // Overwrite the Arrow Batch Metadata in memory
        let change = agent_batch.flush_dynamic_meta_unchecked(&self.new_dynamic_meta)?;
        debug_assert!(!change.resized() && !change.shifted());
        debug_assert!(
            offsets_start_at_zero(
                agent_batch.batch.segment(),
                agent_batch.batch.static_meta(),
                agent_batch.batch.dynamic_meta(),
            )?,
            "Agent batch contains invalid offsets after flushing migration changes"
        );

        // Reload RecordBatch from memory
        agent_batch.batch.reload_record_batch()?;
        Ok(())
    }

    #[allow(clippy::too_many_lines, clippy::too_many_arguments)]
    // this is necessary, because GrowableArrayData is implemented for Box<dyn Array> but not
    // &dyn Array
    #[allow(clippy::borrowed_box)]
    fn traverse_nodes<'b>(
        mut next_state: NextState,
        children_meta: &NodeMapping,
        column_meta: &meta::Column,
        static_meta: &meta::StaticMetadata,
        dynamic_meta: Option<&meta::DynamicMetadata>,
        parent_range_actions: &RangeActions,
        agent_batch: Option<&AgentBatch>,
        agent_batches: &[&AgentBatch],
        new_agents: Option<&'b Box<dyn Array>>,
        actions: &mut Vec<BufferAction<'b>>,
        buffer_metas: &mut Vec<Buffer>,
        node_metas: &mut Vec<Node>,
    ) -> Result<NextState> {
        trace!(
            "started traversing nodes (corresponding batch id: {})",
            if let Some(b) = agent_batch {
                b.batch.segment().id()
            } else {
                "none"
            }
        );
        // Iterate over all buffers
        let node_static_meta = &static_meta.get_node_meta()[next_state.node_index];
        let unit_multiplier = node_static_meta.get_unit_multiplier();
        debug_assert!(parent_range_actions.is_well_ordered_remove());
        #[allow(clippy::redundant_closure)] // Not able to elide static lifetime
        let node_dynamic_meta = dynamic_meta.map_or_else(
            || Node::null(),
            |dynamic_meta| &dynamic_meta.nodes[next_state.node_index],
        );

        let (mut updated_range_actions, length) = if unit_multiplier > 1 {
            let mut range_actions = parent_range_actions.clone();
            range_actions.scale(unit_multiplier);
            let length = range_actions.total_size(node_dynamic_meta.length);
            (Some(range_actions), length)
        } else {
            (
                None,
                parent_range_actions.total_size(node_dynamic_meta.length),
            )
        };
        let buffer_count = column_meta.buffer_counts[next_state.node_index_in_column];
        debug_assert_eq!(node_static_meta.get_data_types().len(), buffer_count);
        let mut null_count = 0;

        for (i, buffer_index) in
            (next_state.buffer_index..next_state.buffer_index + buffer_count).enumerate()
        {
            #[allow(clippy::redundant_closure)] // Not able to elide static lifetime
            let buffer_meta = dynamic_meta.map_or_else(
                || Buffer::null(),
                |dynamic_meta| &dynamic_meta.buffers[buffer_index],
            );

            let buffer_data_type = &node_static_meta.get_data_types()[i];
            let buffer_size = match buffer_data_type {
                meta::BufferType::BitMap { is_null_bitmap } => {
                    // Here we don't modify range actions
                    let range_actions = updated_range_actions
                        .as_ref()
                        .unwrap_or(parent_range_actions);
                    // Currently the implementation for bitmaps is to
                    // rewrite them from ground up.
                    // The reason we do this is because of the high
                    // complexity of shifting bits in LSB numbered
                    // byte arrays
                    let original_length = node_dynamic_meta.length;
                    let target_unit_count = range_actions.total_size(original_length);
                    let target_buffer_size = bit_util::ceil(target_unit_count, 8);

                    let mut next_bit_index = 0;

                    let mut unset_bit_count = 0;

                    // REMOVE ACTIONS

                    let mut bytes = vec![0_u8; target_buffer_size];
                    let mut cur_length = if let Some(agent_batch) = agent_batch {
                        let start_index = buffer_meta.offset;
                        let end_index = start_index + buffer_meta.length;

                        if start_index == end_index {
                            0
                        } else {
                            let data = &agent_batch.batch.segment().get_data_buffer()?
                                [start_index..end_index];

                            debug_assert_eq!(data, agent_batch.get_buffer(buffer_index).unwrap());
                            debug_assert!(range_actions.is_well_ordered_remove());
                            let mut removed_count = 0;
                            range_actions.remove().iter().for_each(|range| {
                                debug_assert!(
                                    range.next_index() <= data.len() * 8,
                                    "assertion failed: range.next_index() <= data.len() * 8
                                    note: range.next_index() = {} and data.len() * 8 = {}",
                                    range.next_index(),
                                    data.len() * 8
                                );
                                debug_assert!(
                                    range.index >= next_bit_index,
                                    "range.index {} >!= next_bit_index {}",
                                    range.index,
                                    next_bit_index
                                );
                                unset_bit_count += copy_bits_unchecked(
                                    data,
                                    &mut bytes,
                                    next_bit_index,
                                    range.index - next_bit_index,
                                    next_bit_index - removed_count,
                                );
                                next_bit_index = range.next_index();
                                removed_count += range.len;
                            });
                            // Also translate final slice
                            unset_bit_count += copy_bits_unchecked(
                                data,
                                &mut bytes,
                                next_bit_index,
                                original_length - next_bit_index,
                                next_bit_index - removed_count,
                            );
                            node_dynamic_meta.length - removed_count
                        }
                    } else {
                        0
                    };
                    // next_bit_index <= bit_capacity as we've only removed bits

                    // MOVE ACTIONS
                    range_actions.copy().iter().try_for_each::<_, Result<()>>(
                        |(current_agent_batch_index, v)| {
                            let src_buffer = agent_batches[*current_agent_batch_index]
                                .get_buffer(buffer_index)?;

                            v.iter().for_each(|range| {
                                if src_buffer.is_empty() {
                                    return;
                                }
                                unset_bit_count += copy_bits_unchecked(
                                    src_buffer,
                                    &mut bytes,
                                    range.index,
                                    range.len,
                                    cur_length,
                                );
                                cur_length += range.len;
                            });
                            Ok(())
                        },
                    )?;

                    // CREATE ACTIONS
                    if let Some(agent_data) = &new_agents {
                        let maybe_buffer = if i == 0 {
                            agent_data.null_buffer()
                        } else {
                            Some(agent_data.buffer(i - 1))
                        };

                        if let Some(buffer) = maybe_buffer.as_ref() {
                            let src_buffer = buffer;
                            range_actions.create().iter().for_each(|range| {
                                unset_bit_count += copy_bits_unchecked(
                                    src_buffer,
                                    &mut bytes,
                                    range.index,
                                    range.len,
                                    cur_length,
                                );
                                cur_length += range.len;
                            });
                        } else {
                            // All values are valid
                            range_actions.create().iter().for_each(|range| {
                                let ptr = bytes.as_mut_ptr();
                                debug_assert!(
                                    bytes.len() * 8 >= cur_length + range.len,
                                    "{}*8 >!= {} + {}",
                                    bytes.len(),
                                    cur_length,
                                    range.len
                                );
                                if range.len > 0 {
                                    // TODO: SAFETY
                                    unsafe {
                                        for i in cur_length..(cur_length + range.len) {
                                            bit_util::set_bit_raw(ptr, i);
                                        }
                                    }
                                }
                                cur_length += range.len;
                            })
                        }
                    }

                    // Final procedures:
                    if *is_null_bitmap {
                        null_count = unset_bit_count;
                    }

                    let variant = BufferActionVariant::Replace { data: bytes };
                    let action = BufferAction {
                        variant,
                        old_offset: buffer_meta.offset,
                        old_length: buffer_meta.length,
                    };
                    actions.push(action);
                    target_buffer_size
                }

                meta::BufferType::Offset => {
                    // Here we modify range_actions
                    let mut range_actions =
                        updated_range_actions.unwrap_or_else(|| parent_range_actions.clone());
                    debug_assert!({ range_actions.is_well_ordered_remove() });
                    let buffer = agent_batch.map_or_else(
                        || Ok(&EMPTY_OFFSET_BUFFER[..]),
                        |batch| batch.get_buffer(buffer_index),
                    )?;

                    // Markers are always n + 1 long
                    let original_length = node_dynamic_meta.length + 1;
                    let original_last_index = node_dynamic_meta.length;
                    let target_unit_count = range_actions.total_size(original_length);
                    let target_buffer_size = target_unit_count * mem::size_of::<Offset>();

                    // REMOVE ACTIONS

                    let mut removed_count = 0;
                    // Next i32 index (*not* byte)
                    let mut next_index = 0;
                    let mut next_offset_value = 0;
                    let mut next_offset_index = 0;

                    let mut total_remove_len = 0;
                    let removed_offsets_count = range_actions.remove.0;
                    let mut shift_actions = range_actions
                        .remove_mut()
                        .iter_mut()
                        .map(|range| {
                            // TODO: SAFETY
                            let (from, to, start_offset_value) = unsafe {
                                (
                                    get_offset_by_index(buffer, range.index),
                                    get_offset_by_index(buffer, range.next_index()),
                                    get_offset_by_index(buffer, next_index),
                                )
                            };
                            let offset_value_dec = start_offset_value - next_offset_value;
                            let action = InnerShiftAction::Offset {
                                from: next_index,
                                len: range.index - next_index,
                                offset_value_dec,
                                base_offset_index: next_offset_index,
                            };

                            next_index = range.next_index();
                            removed_count += range.len;
                            next_offset_value += from - start_offset_value;
                            next_offset_index = next_index - removed_count;

                            // Update the range value here, so next access is in the right place
                            range.index = from as usize;
                            range.len = (to - from) as usize;
                            total_remove_len += range.len;

                            action
                        })
                        .collect::<Vec<_>>();

                    range_actions.remove.0 = total_remove_len;
                    debug_assert!(next_index <= original_last_index);
                    debug_assert_eq!(next_offset_index, next_index - removed_count);
                    // TODO: SAFETY
                    let start_offset_value = unsafe { get_offset_by_index(buffer, next_index) };
                    let offset_value_dec = start_offset_value - next_offset_value;
                    let last_remove_action = InnerShiftAction::Offset {
                        from: next_index,
                        // +1 to also move the very last index
                        len: original_last_index - next_index + 1,
                        offset_value_dec,
                        base_offset_index: next_offset_index,
                    };
                    next_offset_index = original_length - removed_count;
                    // TODO: SAFETY (same as above?)
                    let end_offset_value =
                        unsafe { get_offset_by_index(buffer, original_last_index) };
                    let mut last_offset_value = end_offset_value - offset_value_dec;

                    shift_actions.push(last_remove_action);

                    debug_assert_eq!(removed_count, removed_offsets_count);

                    let byte_size_after_remove = (next_offset_index) * mem::size_of::<Offset>();

                    // MOVE ACTION
                    let move_action = if range_actions.copy.0 > 0 {
                        let mut move_bytes: Vec<u8> =
                            Vec::with_capacity(range_actions.copy.0 * mem::size_of::<Offset>());

                        let mut total_move_len = 0;

                        range_actions
                            .copy_mut()
                            .iter_mut()
                            .try_for_each::<_, Result<()>>(
                                |(current_agent_batch_index, ranges)| {
                                    // TODO: SAFETY
                                    let src_buffer = unsafe {
                                        agent_batches[*current_agent_batch_index]
                                            .get_buffer(buffer_index)?
                                            .align_to::<i32>()
                                            .1
                                    };
                                    ranges.iter_mut().for_each(|range| {
                                        let first_offset = src_buffer[range.index];
                                        let last_offset = src_buffer[range.next_index()];
                                        let offset_diff = last_offset_value - first_offset;
                                        (range.index + 1..=range.index + range.len).for_each(|k| {
                                            let new_offset = src_buffer[k] + offset_diff;
                                            // Assumes little endian
                                            // TODO: SAFETY
                                            let slice = unsafe {
                                                std::slice::from_raw_parts(
                                                    &new_offset as *const i32 as *const _,
                                                    mem::size_of::<Offset>(),
                                                )
                                            };
                                            move_bytes.extend_from_slice(slice);
                                        });
                                        let added_unit_count = last_offset - first_offset;
                                        last_offset_value += added_unit_count;
                                        next_offset_index += range.len;

                                        // Update the range value here, so next access is in the
                                        // right place
                                        range.index = first_offset as usize;
                                        range.len = (added_unit_count) as usize;
                                        total_move_len += range.len;
                                    });
                                    Ok(())
                                },
                            )?;

                        range_actions.copy.0 = total_move_len;

                        Some(InnerMoveAction {
                            byte_offset: byte_size_after_remove,
                            data: move_bytes,
                        })
                    } else {
                        None
                    };

                    // CREATE ACTIONS
                    let create_actions = new_agents.as_ref().map(|agent_data| {
                        let buffer = &agent_data.buffer(i - 1);

                        let src_buffer: &[i32] = cast_slice(buffer);

                        let mut total_create_len = 0;
                        let ret = range_actions
                            .create_mut()
                            .iter_mut()
                            .map(|range| {
                                // We take n + 1 values because we care about the lengths
                                let data = &src_buffer[range.index..=range.next_index()];
                                let first_offset = data[0];
                                let offset_shift = last_offset_value - first_offset;
                                let action = InnerCreateAction::Offset {
                                    // Don't include the first element, because
                                    // that's incorporated in `offset_shift`
                                    data: &data[1..],
                                    base_offset_index: next_offset_index,
                                    offset_shift,
                                };
                                let added_unit_count = data[data.len() - 1] - data[0];
                                last_offset_value += added_unit_count;
                                next_offset_index += range.len;
                                debug_assert_eq!(
                                    last_offset_value,
                                    data[data.len() - 1] + offset_shift
                                );
                                // Update the range value here, so next access is in the right place
                                range.index = data[0] as usize;
                                range.len = added_unit_count as usize;
                                total_create_len += range.len;

                                action
                            })
                            .collect();
                        range_actions.create.0 = total_create_len;

                        ret
                    });

                    // Final procedures:
                    debug_assert!(range_actions.is_well_ordered_remove());
                    updated_range_actions = Some(range_actions);

                    let variant = BufferActionVariant::Tweak {
                        shift: shift_actions,
                        copy: move_action,
                        create: create_actions,
                    };
                    let action = BufferAction {
                        variant,
                        old_offset: buffer_meta.offset,
                        old_length: buffer_meta.length,
                    };
                    actions.push(action);

                    // The target size is the same
                    debug_assert_eq!(
                        target_buffer_size,
                        (next_offset_index) * mem::size_of::<Offset>()
                    );

                    target_buffer_size
                }
                meta::BufferType::Data { unit_byte_size } => {
                    // Here we don't modify range actions
                    let range_actions = updated_range_actions
                        .as_ref()
                        .unwrap_or(parent_range_actions);

                    let original_length = buffer_meta.length / unit_byte_size;
                    let target_unit_count = range_actions.total_size(original_length);
                    let target_buffer_size = target_unit_count * unit_byte_size;

                    let mut next_old_unit_index = 0;

                    // REMOVE ACTIONS
                    let mut removed_count = 0;

                    let mut shift_actions = Vec::with_capacity(range_actions.remove().len() + 1);

                    range_actions.remove().iter().for_each(|range| {
                        let action = InnerShiftAction::Data {
                            offset: next_old_unit_index * unit_byte_size,
                            len: (range.index - next_old_unit_index) * unit_byte_size,
                            dest_offset: (next_old_unit_index - removed_count) * unit_byte_size,
                        };

                        next_old_unit_index = range.next_index();
                        removed_count += range.len;
                        shift_actions.push(action);
                    });

                    // Also shift final slice
                    if next_old_unit_index != original_length {
                        shift_actions.push(InnerShiftAction::Data {
                            offset: next_old_unit_index * unit_byte_size,
                            len: (original_length - next_old_unit_index) * unit_byte_size,
                            dest_offset: (next_old_unit_index - removed_count) * unit_byte_size,
                        });
                    }
                    let mut next_unit_index = original_length - removed_count;

                    // MOVE ACTIONS
                    let move_action = if range_actions.copy.0 > 0 {
                        let mut move_bytes: Vec<u8> =
                            Vec::with_capacity(range_actions.copy.0 * unit_byte_size);

                        range_actions.copy().iter().try_for_each::<_, Result<()>>(
                            |(current_agent_batch_index, v)| {
                                let src_buffer = agent_batches[*current_agent_batch_index]
                                    .get_buffer(buffer_index)?;
                                v.iter().for_each(|range| {
                                    let from = range.index * unit_byte_size;
                                    let to = range.next_index() * unit_byte_size;
                                    let slice = &src_buffer[from..to];
                                    move_bytes.extend_from_slice(slice);
                                });
                                Ok(())
                            },
                        )?;

                        let move_bytes_len = move_bytes.len();
                        debug_assert_eq!(move_bytes_len, range_actions.copy.0 * unit_byte_size);

                        let move_action = InnerMoveAction {
                            byte_offset: next_unit_index * unit_byte_size,
                            data: move_bytes,
                        };
                        next_unit_index += range_actions.copy.0;
                        Some(move_action)
                    } else {
                        None
                    };

                    // CREATE ACTIONS
                    let create_actions = new_agents.map(|agent_data| {
                        let buffer = &agent_data.buffer(i - 1);

                        let src_buffer = cast_slice(buffer);
                        range_actions
                            .create()
                            .iter()
                            .map(|range| {
                                let slice = &src_buffer[range.index * unit_byte_size
                                    ..range.next_index() * unit_byte_size];

                                let action = InnerCreateAction::Data {
                                    byte_offset: next_unit_index * unit_byte_size,
                                    data: slice,
                                };
                                next_unit_index += range.len;
                                action
                            })
                            .collect()
                    });

                    debug_assert_eq!(next_unit_index, target_unit_count);

                    let variant = BufferActionVariant::Tweak {
                        shift: shift_actions,
                        copy: move_action,
                        create: create_actions,
                    };

                    let action = BufferAction {
                        variant,
                        old_offset: buffer_meta.offset,
                        old_length: buffer_meta.length,
                    };

                    actions.push(action);

                    target_buffer_size
                }
                meta::BufferType::LargeOffset => unimplemented!(),
            };

            let old_next_offset = dynamic_meta.map_or(0, |meta| {
                meta.buffers
                    .get(buffer_index + 1)
                    .map_or(meta.data_length, |v| v.offset)
            });

            let padding = padding::maybe_new_dynamic_pad(
                next_state.buffer_offset,
                buffer_size,
                old_next_offset,
            );

            buffer_metas.push(Buffer::new(next_state.buffer_offset, buffer_size, padding));
            next_state.buffer_index += 1;
            next_state.buffer_offset += buffer_size + padding;
        }

        node_metas.push(Node::new(length, null_count));
        next_state.node_index += 1;
        next_state.node_index_in_column += 1;
        let range_actions = updated_range_actions
            .as_ref()
            .unwrap_or(parent_range_actions);
        debug_assert!(range_actions.is_well_ordered_remove());

        // Now iterate over children depth-first
        for (child_index, child) in children_meta.0.iter().enumerate() {
            next_state = Self::traverse_nodes(
                next_state,
                child,
                column_meta,
                static_meta,
                dynamic_meta,
                range_actions,
                agent_batch,
                agent_batches,
                new_agents.map(|parent| &parent.child_data()[child_index]),
                actions,
                buffer_metas,
                node_metas,
            )?;
        }

        // There are 3 cases with remove actions:
        // 1) No buffer shift -> commit inner actions left to right
        // 2) Buffer shift to the right, new rightmost index >= old rightmost index
        //    -> commit right to left
        // 3) Buffer shift to the right, new rightmost index < old rightmost index
        //    -> build separately

        Ok(next_state)
    }

    #[allow(clippy::too_many_lines)]
    pub fn from(
        agent_batches: &[&AgentBatch],
        batch_index: Option<usize>,
        base_range_actions: RangeActions,
        static_meta: &meta::StaticMetadata,
        new_agents: Option<&'a RecordBatch>,
    ) -> Result<BufferActions<'a>> {
        let agent_batch = batch_index.map(|index| agent_batches[index]);
        let dynamic_meta = batch_index.map(|index| agent_batches[index].batch.dynamic_meta());
        let mut next_indices = NextState {
            node_index: 0,
            buffer_index: 0,
            buffer_offset: 0,
            node_index_in_column: 0,
        };
        let mut actions = Vec::with_capacity(static_meta.get_buffer_count());
        // Iterate over all columns
        let mut buffer_metas = Vec::with_capacity(static_meta.get_buffer_count());
        let mut node_metas = Vec::with_capacity(static_meta.get_node_count());
        for (column_index, column) in static_meta.get_column_meta().iter().enumerate() {
            let new_agents_data_ref =
                new_agents.map(|record_batch| record_batch.column(column_index));
            let range_actions = Cow::Borrowed(&base_range_actions);
            next_indices = Self::traverse_nodes(
                next_indices,
                &column.root_node_mapping,
                column,
                static_meta,
                dynamic_meta,
                range_actions.as_ref(),
                agent_batch,
                agent_batches,
                new_agents_data_ref,
                &mut actions,
                &mut buffer_metas,
                &mut node_metas,
            )?;
            next_indices.node_index_in_column = 0;
        }
        debug_assert_eq!(actions.len(), static_meta.get_buffer_count());
        debug_assert_eq!(buffer_metas.len(), static_meta.get_buffer_count());
        debug_assert_eq!(node_metas.len(), static_meta.get_node_count());
        debug_assert!(!node_metas.is_empty() && !buffer_metas.is_empty());

        let num_agents = node_metas.get(0).ok_or(Error::NodeMetadataExpected)?.length;
        let data_length = buffer_metas
            .last()
            .ok_or(Error::BufferMetadataExpected)?
            .get_next_offset();

        debug_assert!({
            let mut last = buffer_metas.first().unwrap().get_next_offset();
            buffer_metas[1..].iter().all(|b| {
                let val = b.offset == last;
                last = b.get_next_offset();
                val
            })
        });
        let new_dynamic_meta =
            meta::DynamicMetadata::new(num_agents, data_length, node_metas, buffer_metas);

        let bufferactions = BufferActions {
            actions,
            new_dynamic_meta,
        };

        Ok(bufferactions)
    }
}

// Assumes alignment
unsafe fn get_offset_by_index(data: &[u8], index: usize) -> i32 {
    let i32_size = std::mem::size_of::<Offset>();
    let offset = index * i32_size;
    let ptr: *const u8 = &data[offset];

    // Assuming little endian
    *(ptr as *const i32)
}

fn copy_bits_unchecked(
    src: &[u8],
    dest: &mut [u8],
    src_bit_index: usize,
    bit_len: usize,
    dest_bit_index: usize,
) -> usize {
    let mut unset_bit_count = 0; // i.e. null count
    (src_bit_index..src_bit_index + bit_len)
        .enumerate()
        .for_each(|(j, i)| {
            if bit_util::get_bit(src, i) {
                bit_util::set_bit(dest, dest_bit_index + j);
            } else {
                unset_bit_count += 1;
            }
        });
    unset_bit_count
}

#[derive(Debug, Clone)]
pub struct IndexRange {
    index: usize,
    len: usize,
}

impl IndexRange {
    pub fn new(index: usize, len: usize) -> IndexRange {
        IndexRange { index, len }
    }

    fn next_index(&self) -> usize {
        self.index + self.len
    }

    fn scale(&mut self, multiplier: usize) {
        self.index *= multiplier;
        self.len *= multiplier;
    }
}

#[derive(Debug, Clone)]
pub struct RangeActions {
    // How many units the buffer at hand is increased
    // or decreased by
    remove: (usize, Vec<IndexRange>),
    // First index refers to the src batch index
    copy: (usize, Vec<(usize, Vec<IndexRange>)>),
    create: (usize, Vec<IndexRange>),
}

impl RangeActions {
    pub fn new(
        remove: (usize, Vec<IndexRange>),
        copy: (usize, Vec<(usize, Vec<IndexRange>)>),
        create: (usize, Vec<IndexRange>),
    ) -> RangeActions {
        RangeActions {
            remove,
            copy,
            create,
        }
    }

    fn remove(&self) -> &Vec<IndexRange> {
        &self.remove.1
    }

    fn remove_mut(&mut self) -> &mut Vec<IndexRange> {
        &mut self.remove.1
    }

    fn copy(&self) -> &Vec<(usize, Vec<IndexRange>)> {
        &self.copy.1
    }

    fn copy_mut(&mut self) -> &mut Vec<(usize, Vec<IndexRange>)> {
        &mut self.copy.1
    }

    fn create(&self) -> &Vec<IndexRange> {
        &self.create.1
    }

    fn create_mut(&mut self) -> &mut Vec<IndexRange> {
        &mut self.create.1
    }

    fn total_size(&self, original_length: usize) -> usize {
        original_length - self.remove.0 + self.copy.0 + self.create.0
    }

    fn scale(&mut self, unit_multiplier: usize) {
        self.remove.0 *= unit_multiplier;
        self.remove
            .1
            .iter_mut()
            .for_each(|v| v.scale(unit_multiplier));

        self.copy.0 *= unit_multiplier;
        self.copy
            .1
            .iter_mut()
            .for_each(|(_, vec)| vec.iter_mut().for_each(|v| v.scale(unit_multiplier)));

        self.create.0 *= unit_multiplier;
        self.create
            .1
            .iter_mut()
            .for_each(|v| v.scale(unit_multiplier));
    }

    fn is_well_ordered_remove(&self) -> bool {
        let mut last_i = 0;
        for action in self.remove() {
            if action.index < last_i {
                tracing::error!(
                    "Remove range actions are not ordered correctly: {} < {}",
                    action.index,
                    last_i
                );
                return false;
            } else {
                last_i = action.index;
            }
        }
        true
    }

    pub fn collect_indices(actions: &[IndexAction]) -> (usize, Vec<IndexRange>) {
        let size = actions.len();
        // Gather all indices, merging adjacent ones
        let ranges: Vec<IndexRange> = actions.iter().fold(vec![], |mut v, action| {
            if let Some(last) = v.last_mut() {
                if last.next_index() == action.val {
                    last.len += 1;
                    return v;
                }
            }
            v.push(IndexRange::new(action.val, 1));
            v
        });
        (size, ranges)
    }

    pub fn from_actions<K: AsRef<Vec<CopyAction>>>(
        remove: &[RemoveAction],
        copy: &[(usize, K)],
        create: &[CreateAction],
    ) -> RangeActions {
        let mut move_size = 0;
        // Gather all indices to be added, merging adjacent ones
        let copy: Vec<(usize, Vec<IndexRange>)> = copy
            .iter()
            .map(|actions| {
                move_size += actions.1.as_ref().len();
                (
                    actions.0,
                    actions.1.as_ref().iter().fold::<Vec<IndexRange>, _>(
                        vec![],
                        |mut v, action| {
                            if let Some(last) = v.last_mut() {
                                if last.next_index() == action.val {
                                    last.len += 1;
                                    return v;
                                }
                            }
                            v.push(IndexRange::new(action.val, 1));
                            v
                        },
                    ),
                )
            })
            .collect();

        RangeActions::new(
            Self::collect_indices(remove),
            (move_size, copy),
            Self::collect_indices(create),
        )
    }
}

impl From<&RowActions> for RangeActions {
    // Assumes that all actions are properly ordered
    fn from(row_actions: &RowActions) -> RangeActions {
        Self::from_actions(&row_actions.remove, &row_actions.copy, &row_actions.create)
    }
}

/// Return true if every offset buffer in the Arrow record batch in `memory` starts with 0.
///
/// The first offset of an Arrow offset buffer should always be 0, because there can't be any
/// elements before the first element of the corresponding Arrow data buffer.
///
/// Columns that don't contain any offset buffers are skipped.
///
/// # Errors
/// `memory` doesn't have a data buffer, so it can't contain an Arrow record batch.
fn offsets_start_at_zero(
    segment: &Segment,
    static_meta: &meta::StaticMetadata,
    dynamic_meta: &meta::DynamicMetadata,
) -> Result<bool> {
    let data = segment.get_data_buffer()?;

    let mut buffer_index = 0;
    let mut starts_at_zero = true;
    static_meta.get_node_meta().iter().for_each(|meta| {
        meta.get_data_types().iter().for_each(|data_type| {
            match data_type {
                meta::BufferType::Offset => {
                    let buffer_meta = &dynamic_meta.buffers[buffer_index];
                    let offset_of_offsets = buffer_meta.offset;

                    // SAFETY: We know that this is an offset buffer. Offset buffers always contain
                    //         at least one offset, because there are at least 0 rows and offset
                    //         buffers contain `num_rows + 1` offsets. Also, we know that this
                    //         isn't a `LargeOffset` buffer, so the offset type is `i32`.
                    let first_offset =
                        unsafe { *(&data[offset_of_offsets] as *const u8 as *const i32) };

                    let offset_starts_at_zero = first_offset == 0;
                    if !offset_starts_at_zero {
                        tracing::warn!(
                            "Does not start at zero! {buffer_index}, {meta:?}, value: \
                             {first_offset}"
                        );
                    }
                    starts_at_zero = starts_at_zero && offset_starts_at_zero;
                }
                meta::BufferType::LargeOffset => unimplemented!(),
                _ => (),
            }
            buffer_index += 1;
        });
    });
    Ok(starts_at_zero)
}

#[cfg(all(test, not(miri)))]
pub(super) mod test {
    use execution::package::experiment::ExperimentId;
    use rand::Rng;
    use serde::{Deserialize, Serialize};
    use stateful::{
        agent::{arrow::PREVIOUS_INDEX_FIELD_KEY, IntoAgents},
        message::MessageSchema,
    };

    use super::*;
    use crate::tests::test_utils::gen_schema_and_test_agents;

    #[derive(Serialize, Deserialize)]
    pub struct Foo {
        bar: bool,
        baz: Vec<f64>,
        qux: [f64; 4],
        quux: Option<[String; 16]>,
    }

    fn rand_string() -> String {
        let mut rng = rand::thread_rng();
        let count = rng.gen_range(0..64);
        String::from_utf8(
            std::iter::repeat(())
                .map(|()| rng.sample(rand::distributions::Alphanumeric))
                .take(count)
                .collect::<Vec<u8>>(),
        )
        .unwrap()
    }

    impl Default for Foo {
        fn default() -> Foo {
            let mut rng = rand::thread_rng();
            Foo {
                bar: rng.gen(),
                baz: (0..rng.gen_range(0..8)).map(|_| rng.gen()).collect(),
                qux: rng.gen(),
                quux: {
                    if rng.gen_bool(0.7) {
                        Some(arr_macro::arr![rand_string(); 16])
                    } else {
                        None
                    }
                },
            }
        }
    }

    #[derive(Serialize, Deserialize)]
    pub struct Complex {
        position: [f64; 2],
        abc: Vec<[Foo; 6]>,
    }

    impl Default for Complex {
        fn default() -> Complex {
            let mut rng = rand::thread_rng();
            Complex {
                position: rng.gen(),
                abc: (0..rng.gen_range(0..8))
                    .map(|_| Default::default())
                    .collect(),
            }
        }
    }

    #[test]
    fn test_migration_remove() -> Result<()> {
        let experiment_id = ExperimentId::generate();
        let msg_schema = Arc::new(MessageSchema::new());
        let remove_indices = [3, 5, 7, 8, 9, 12, 45, 46, 55];
        let num_agents = 100;

        let (agent_schema, json_agents) = gen_schema_and_test_agents(num_agents, 0)?;

        let agents = AgentBatch::from_agent_states(
            json_agents.as_slice(),
            &agent_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;
        let agents_clone = AgentBatch::duplicate_from(
            &agents,
            &agent_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        let mut pool = vec![agents];
        let batch_index = Some(0);

        let row_actions = RowActions {
            remove: remove_indices
                .iter()
                .map(|i| RemoveAction { val: *i })
                .collect(),
            copy: vec![],
            create: vec![],
        };

        // Remove indices should be less than the length
        debug_assert!(batch_index.map_or(true, |index| {
            row_actions
                .remove
                .iter()
                .all(|v| v.val < pool[index].num_agents())
        }));

        // Go through migrations
        let buffer_actions = super::BufferActions::from(
            &pool.iter().collect::<Vec<_>>(),
            batch_index,
            (&row_actions).into(),
            &agent_schema.static_meta,
            None,
        )?;
        buffer_actions.flush(&mut pool[0])?;

        let empty_message_batch = MessageBatch::empty_from_agent_batch(
            &pool[0],
            &msg_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        let new_json_agents = (&pool[0], &empty_message_batch).to_agent_states(None)?;

        let new_empty_message_batch = MessageBatch::empty_from_agent_batch(
            &agents_clone,
            &msg_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        // Do on JSON
        let mut json_agents = (&agents_clone, &new_empty_message_batch).to_agent_states(None)?;
        remove_indices.iter().rev().for_each(|i| {
            json_agents.remove(*i);
        });
        let agents = AgentBatch::from_agent_states(
            json_agents.as_slice(),
            &agent_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        assert!(agents.num_agents() > 1);
        assert_eq!(new_json_agents, json_agents);
        Ok(())
    }

    #[test]
    fn test_migration_create() -> Result<()> {
        let experiment_id = ExperimentId::generate();
        let msg_schema = Arc::new(MessageSchema::new());

        let num_agents = 150;
        let num_create_agents = 150;

        let (schema, json_agents) = gen_schema_and_test_agents(num_agents, 0)?;
        let (_, mut json_create_agents) =
            gen_schema_and_test_agents(num_create_agents, num_agents as u64)?;

        let agents = AgentBatch::from_agent_states(
            json_agents.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;
        let agents_clone =
            AgentBatch::duplicate_from(&agents, &schema, MemoryId::new(experiment_id.as_uuid()))?;
        let create_agents = AgentBatch::from_agent_states(
            json_create_agents.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        let mut pool = vec![agents];
        let batch_index = Some(0);

        let row_actions = RowActions {
            remove: vec![],
            copy: vec![],
            create: (0..num_create_agents)
                .map(|i| CreateAction { val: i })
                .collect(),
        };
        // Remove indices should be less than the length
        debug_assert!(batch_index.map_or(true, |index| {
            row_actions
                .remove
                .iter()
                .all(|v| v.val < pool[index].num_agents())
        }));

        // Go through migrations
        let buffer_actions = super::BufferActions::from(
            &pool.iter().collect::<Vec<_>>(),
            batch_index,
            (&row_actions).into(),
            &schema.static_meta,
            Some(create_agents.batch.record_batch()?),
        )?;
        buffer_actions.flush(&mut pool[0])?;

        let empty_message_batch = MessageBatch::empty_from_agent_batch(
            &pool[0],
            &msg_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        let mut new_json_agents = (&pool[0], &empty_message_batch).to_agent_states(None)?;

        let new_empty_message_batch = MessageBatch::empty_from_agent_batch(
            &agents_clone,
            &msg_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;
        // Do on JSON
        let mut json_agents = (&agents_clone, &new_empty_message_batch).to_agent_states(None)?;
        json_agents.append(&mut json_create_agents);
        let agents = AgentBatch::from_agent_states(
            json_agents.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        assert!(agents.num_agents() > 1);
        json_agents.iter_mut().for_each(|v| {
            v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
        });
        new_json_agents.iter_mut().for_each(|v| {
            v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
        });
        assert_eq!(json_agents, new_json_agents);
        Ok(())
    }

    #[test]
    fn test_migration_move() -> Result<()> {
        let experiment_id = ExperimentId::generate();
        let msg_schema = Arc::new(MessageSchema::new());

        let num_agents = 150;
        let num_agents_2 = 150;
        let select_indices = [0, 2, 4, 5, 6, 7, 10, 56, 57, 58, 60, 62, 64, 78, 88];

        let (schema, json_agents) = gen_schema_and_test_agents(num_agents, 0)?;
        let (_, json_agents_2) = gen_schema_and_test_agents(num_agents_2, num_agents as u64)?;

        let agents = AgentBatch::from_agent_states(
            json_agents.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;
        let agents_clone =
            AgentBatch::duplicate_from(&agents, &schema, MemoryId::new(experiment_id.as_uuid()))?;
        let agents_2 = AgentBatch::from_agent_states(
            json_agents_2.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        let mut pool = vec![agents, agents_2];
        let batch_index = Some(0);

        let row_actions = RowActions {
            remove: vec![],
            copy: vec![(
                1,
                select_indices
                    .iter()
                    .map(|i| CopyAction { val: *i })
                    .collect(),
            )],
            create: vec![],
        };
        let now = std::time::Instant::now();
        // Remove indices should be less than the length
        debug_assert!(batch_index.map_or(true, |index| {
            row_actions
                .remove
                .iter()
                .all(|v| v.val < pool[index].num_agents())
        }));

        // Go through migrations
        let buffer_actions = super::BufferActions::from(
            &pool.iter().collect::<Vec<_>>(),
            batch_index,
            (&row_actions).into(),
            &schema.static_meta,
            None,
        )?;
        buffer_actions.flush(&mut pool[0])?;
        println!("Migration took: {} us", now.elapsed().as_micros());

        let empty_message_batch = MessageBatch::empty_from_agent_batch(
            &pool[0],
            &msg_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        let mut new_json_agents = (&pool[0], &empty_message_batch).to_agent_states(None)?;

        let new_empty_message_batch = MessageBatch::empty_from_agent_batch(
            &agents_clone,
            &msg_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;
        // Do on JSON
        let mut json_agents = (&agents_clone, &new_empty_message_batch).to_agent_states(None)?;
        select_indices
            .iter()
            .for_each(|i| json_agents.push(json_agents_2[*i].clone()));
        let agents = AgentBatch::from_agent_states(
            json_agents.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        assert!(agents.num_agents() > 1);

        json_agents.iter_mut().for_each(|v| {
            v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
        });
        new_json_agents.iter_mut().for_each(|v| {
            v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
        });
        assert_eq!(json_agents, new_json_agents);
        Ok(())
    }

    #[test]
    fn test_migration_all() -> Result<()> {
        let experiment_id = ExperimentId::generate();
        let msg_schema = Arc::new(MessageSchema::new());

        let num_agents = 150;
        let num_create_agents = 150;
        let num_agents_2 = 150;
        let select_indices = [2, 4, 5, 6, 7, 10, 56, 57, 58, 60, 62, 64, 78, 88, 149];
        let remove_indices = [0, 3, 5, 7, 8, 9, 12, 45, 46, 55, 148];

        let (schema, json_agents) = gen_schema_and_test_agents(num_agents, 0)?;
        let (_, mut json_create_agents) =
            gen_schema_and_test_agents(num_create_agents, num_agents as u64)?;
        let (_, json_agents_2) =
            gen_schema_and_test_agents(num_agents_2, (num_agents + num_create_agents) as u64)?;

        let agents = AgentBatch::from_agent_states(
            json_agents.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;
        let agents_clone =
            AgentBatch::duplicate_from(&agents, &schema, MemoryId::new(experiment_id.as_uuid()))?;
        let agents_2 = AgentBatch::from_agent_states(
            json_agents_2.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;
        let create_agents = AgentBatch::from_agent_states(
            json_create_agents.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        let mut pool = vec![agents, agents_2];
        let batch_index = Some(0);

        let row_actions = RowActions {
            remove: remove_indices
                .iter()
                .map(|i| RemoveAction { val: *i })
                .collect(),
            copy: vec![(
                1,
                select_indices
                    .iter()
                    .map(|i| CopyAction { val: *i })
                    .collect(),
            )],
            create: (0..num_create_agents)
                .map(|i| CreateAction { val: i })
                .collect(),
        };
        // Remove indices should be less than the length
        debug_assert!(batch_index.map_or(true, |index| {
            row_actions
                .remove
                .iter()
                .all(|v| v.val < pool[index].num_agents())
        }));

        // Go through migrations
        let buffer_actions = super::BufferActions::from(
            &pool.iter().collect::<Vec<_>>(),
            batch_index,
            (&row_actions).into(),
            &schema.static_meta,
            Some(create_agents.batch.record_batch()?),
        )?;
        buffer_actions.flush(&mut pool[0])?;

        let empty_message_batch = MessageBatch::empty_from_agent_batch(
            &pool[0],
            &msg_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        let mut new_json_agents = (&pool[0], &empty_message_batch).to_agent_states(None)?;

        let new_empty_message_batch = MessageBatch::empty_from_agent_batch(
            &agents_clone,
            &msg_schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;
        // Do on JSON
        let mut json_agents = (&agents_clone, &new_empty_message_batch).to_agent_states(None)?;
        remove_indices.iter().rev().for_each(|i| {
            json_agents.remove(*i);
        });
        select_indices
            .iter()
            .for_each(|i| json_agents.push(json_agents_2[*i].clone()));
        json_agents.append(&mut json_create_agents);
        let agents = AgentBatch::from_agent_states(
            json_agents.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )?;

        assert!(agents.num_agents() > 1);

        new_json_agents.iter_mut().for_each(|v| {
            v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
        });
        json_agents.iter_mut().for_each(|v| {
            v.delete_custom(PREVIOUS_INDEX_FIELD_KEY);
        });
        assert_eq!(json_agents, new_json_agents);
        Ok(())
    }
}
