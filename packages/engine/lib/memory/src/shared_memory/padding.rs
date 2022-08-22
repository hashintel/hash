// This file is the single source of truth for padding between Arrow buffers.
//
// We hold RecordBatch data in sequential memory for IPC, these we call
// Shared Batches.
//
// By default, Arrow just adds minimal padding (for SIMD-alignment and
// prefetcher optimizations to minimize cache conflicts and hence the time
// spent on traversing different layers of memory) between buffers, because
// the data contained in them in not expected to be mutated.
//
// We, however, do mutate data. This means that we want additional padding
// between buffers in order to minimize the time spent on moving adjacent
// buffers to accommodate increases in actual buffer data size.
//
//
// There are two *periods* during a simulation step when a shared batch is mutated:
// 1) Behavior Execution:
//      Happens during behavior execution, every agent has the chance to modify
//      its own state.
//
//      In terms of padding, there are two types of buffers inside record batches:
//      * Dynamically sized (1)
//           - e.g. the data buffer for a column containing strings. This is because strings can be
//             dynamically resized
//      * Statically sized (2)
//           - e.g. the offsets buffer for a column containing lists of floats. This is because
//             there are n agents and hence n+1 offsets
// 2) Creating/Removing/Moving Agents:
//      This happens when:
//          - "create_agent" and "remove_agent" messages are gathered from agents
//          - the behavior profile of an agent differs from the other agents in the batch and it
//            needs to be moved to another batch
//
//      In terms of padding, here, every buffer is the same type:
//      * Dynamically sized (3)
//           - This is because the number of agents can change
//
//
// In conclusion, all buffers (see (3)) are technically dynamically sized. This
// means that they should all have some extra padding. So the current solution is
// to pad all buffers to the next power of two.
//
// The only exception are the buffers of the Context Shared Batch, which are not
// intented to be mutated.
//

#![allow(clippy::cast_sign_loss)]

use crate::arrow::util::alignment::ALIGNMENT;

#[must_use]
pub(crate) fn _get_static_buffer_length(len: usize) -> usize {
    len + pad_to_sys_align(len)
}

#[must_use]
pub(crate) fn get_static_buffer_pad(len: usize) -> usize {
    pad_to_sys_align(len)
}

/// New size of buffer such that it's the next power of 2
#[must_use]
pub fn get_dynamic_buffer_length(len: usize) -> usize {
    if len == 0 {
        0
    } else {
        let u64_len = len as u64;
        let growable_size = (1 << (64 - (u64_len - 1).leading_zeros())) as usize;
        growable_size + pad_to_sys_align(growable_size)
    }
}

/// Padding required to reach the next power of 2
#[must_use]
pub(crate) fn get_dynamic_buffer_pad(len: usize) -> usize {
    if len == 0 {
        0
    } else {
        let u64_len = len as u64;
        let growable_size = (1 << (64 - (u64_len - 1).leading_zeros())) as usize;
        let total_size = growable_size + pad_to_sys_align(growable_size);
        total_size - len
    }
}

#[must_use]
pub fn maybe_new_dynamic_pad(
    buffer_new_offset: usize,
    buffer_length: usize,
    next_buffer_old_offset: usize,
) -> usize {
    let old_buffer_space_accommodates_new =
        buffer_new_offset + buffer_length <= next_buffer_old_offset;

    let new_padding = if old_buffer_space_accommodates_new {
        next_buffer_old_offset - buffer_new_offset - buffer_length
    } else {
        get_dynamic_buffer_pad(buffer_length)
    };
    // No left-shifts here
    debug_assert!(next_buffer_old_offset <= buffer_new_offset + buffer_length + new_padding);
    new_padding
}

// TODO: UNUSED: Needs triage
#[must_use]
pub(crate) fn _maybe_new_dynamic_length(
    buffer_new_offset: usize,
    buffer_length: usize,
    next_buffer_old_offset: usize,
) -> usize {
    let old_buffer_space_accommodates_new =
        buffer_new_offset + buffer_length <= next_buffer_old_offset;

    let new_length = if old_buffer_space_accommodates_new {
        next_buffer_old_offset - buffer_new_offset
    } else {
        get_dynamic_buffer_length(buffer_length)
    };
    // No left-shifts here
    debug_assert!(next_buffer_old_offset <= buffer_new_offset + new_length);
    new_length
}

// ADD: Added padding for for SIMD-alignment and
// prefetcher optimizations
#[must_use]
const fn pad_to_sys_align(len: usize) -> usize {
    match len % ALIGNMENT {
        0 => 0,
        v => ALIGNMENT - v,
    }
}

// COPY: ::ipc::writer.rs
// MOD: made public
/// Calculate an 8-byte boundary and return the number of bytes needed to pad to 8 bytes
#[must_use]
pub(crate) const fn pad_to_8(len: usize) -> usize {
    match len % 8 {
        0 => 0,
        v => 8 - v,
    }
}

#[cfg(test)]
mod test {
    use super::*;

    const TEST_VALS: [usize; 7] = [5, 8, 15, 16, 356, 2048, 2049];

    #[test]
    fn dynamic_buffer_padding() {
        TEST_VALS.iter().for_each(|i| {
            assert_eq!(
                get_dynamic_buffer_length(*i) - get_dynamic_buffer_pad(*i),
                *i
            );
        })
    }

    #[test]
    fn static_buffer_padding() {
        TEST_VALS.iter().for_each(|i| {
            assert_eq!(
                _get_static_buffer_length(*i) - get_static_buffer_pad(*i),
                *i
            );
        })
    }
}
