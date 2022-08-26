//! This module contains functions which convert the Rust engine state into the appropriate
//! JavaScript values.

use memory::shared_memory::Segment;
use stateful::{agent::AgentBatch, field::PackageId, message::MessageBatch};

use super::{error::JavaScriptResult, utils::new_js_string, Object, Value};
use crate::{
    package::simulation::SimulationId,
    runner::JavaScriptError,
    task::{PartialSharedState, SharedState, TaskSharedStore},
};

pub(in crate::runner::javascript) fn sim_id_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    sim_id: SimulationId,
) -> Value<'s> {
    v8::Number::new(scope, sim_id.as_f64()).into()
}

pub(in crate::runner::javascript) fn pkg_id_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    pkg_id: PackageId,
) -> Value<'s> {
    v8::Number::new(scope, pkg_id.as_usize().get() as f64).into()
}

pub(in crate::runner::javascript) fn new_js_array_from_usizes<'s>(
    scope: &mut v8::HandleScope<'s>,
    values: &[usize],
) -> JavaScriptResult<Value<'s>> {
    let a = v8::Array::new(scope, values.len() as i32);
    for (i, idx) in values.iter().enumerate() {
        let js_idx = v8::Number::new(scope, *idx as u32 as f64);
        a.set_index(scope, i as u32, js_idx.into()).ok_or_else(|| {
            JavaScriptError::V8(format!("Couldn't set value at index {idx} on JS array"))
        })?;
    }

    Ok(a.into())
}

pub(in crate::runner::javascript) fn current_step_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    current_step: usize,
) -> Value<'s> {
    v8::Number::new(scope, current_step as f64).into()
}

/// This enum is returned from [`batches_from_shared_store`]. We want to return a single type which
/// implements [`Iterator`], however, this is difficult because depending on the shared
/// store in question we might return any of four different iterators. To make one type from the
/// four, we use an `enum` here, and then implement [`Iterator`] for it, calling the
/// [`Iterator::next`] method on the underlying iterator.
pub(in crate::runner::javascript) enum EmptyOrNonEmpty<OUTPUT, I1, I2, I3, I4> {
    Empty(std::iter::Empty<OUTPUT>),
    Read(I1),
    Write(I2),
    PartialRead(I3),
    PartialWrite(I4),
}

impl<OUTPUT, I1, I2, I3, I4> Iterator for EmptyOrNonEmpty<OUTPUT, I1, I2, I3, I4>
where
    I1: Iterator<Item = OUTPUT>,
    I2: Iterator<Item = OUTPUT>,
    I3: Iterator<Item = OUTPUT>,
    I4: Iterator<Item = OUTPUT>,
{
    type Item = OUTPUT;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            EmptyOrNonEmpty::Empty(empty) => empty.next(),
            EmptyOrNonEmpty::Write(non_empty) => non_empty.next(),
            EmptyOrNonEmpty::Read(non_empty) => non_empty.next(),
            EmptyOrNonEmpty::PartialRead(i) => i.next(),
            EmptyOrNonEmpty::PartialWrite(i) => i.next(),
        }
    }
}

pub(in crate::runner::javascript) fn batches_from_shared_store(
    shared_store: &TaskSharedStore,
) -> JavaScriptResult<(
    impl Iterator<Item = &AgentBatch>,
    impl Iterator<Item = &MessageBatch>,
    Vec<usize>,
)> {
    // TODO: Remove duplication between read and write access
    Ok(match &shared_store.state {
        SharedState::None => (
            EmptyOrNonEmpty::Empty(std::iter::empty()),
            EmptyOrNonEmpty::Empty(std::iter::empty()),
            vec![],
        ),
        SharedState::Write(state) => (
            EmptyOrNonEmpty::Write(state.agent_pool().batches_iter()),
            EmptyOrNonEmpty::Write(state.message_pool().batches_iter()),
            (0..state.agent_pool().len()).collect(),
        ),
        SharedState::Read(state) => (
            EmptyOrNonEmpty::Read(state.agent_pool().batches_iter()),
            EmptyOrNonEmpty::Read(state.message_pool().batches_iter()),
            (0..state.agent_pool().len()).collect(),
        ),
        SharedState::Partial(partial) => {
            match partial {
                PartialSharedState::Read(partial) => (
                    EmptyOrNonEmpty::PartialRead(partial.state_proxy.agent_pool().batches_iter()),
                    EmptyOrNonEmpty::PartialRead(partial.state_proxy.message_pool().batches_iter()),
                    partial.group_indices.clone(), // TODO: Avoid cloning?
                ),
                PartialSharedState::Write(partial) => (
                    EmptyOrNonEmpty::PartialWrite(partial.state_proxy.agent_pool().batches_iter()),
                    EmptyOrNonEmpty::PartialWrite(
                        partial.state_proxy.message_pool().batches_iter(),
                    ),
                    partial.group_indices.clone(), // TODO: Avoid cloning?
                ),
            }
        }
    })
}

pub(in crate::runner::javascript) fn mem_batch_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    batch_id: &str,
    mem: Object<'s>,
) -> JavaScriptResult<Value<'s>> {
    let batch = v8::Object::new(scope);
    let batch_id = new_js_string(scope, batch_id);

    let id_field = new_js_string(scope, "id");
    let mem_field = new_js_string(scope, "mem");

    batch
        .set(scope, id_field.into(), batch_id.into())
        .ok_or_else(|| JavaScriptError::V8("Could not set id field on batch".to_string()))?;
    batch
        .set(scope, mem_field.into(), mem.into())
        .ok_or_else(|| JavaScriptError::V8("Could not set mem field on batch".to_string()))?;

    Ok(batch.into())
}

pub(in crate::runner::javascript) fn batch_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    segment: &Segment,
) -> JavaScriptResult<Value<'s>> {
    // The memory is owned by the shared memory, we don't want JS or Rust to try to de-allocate it
    unsafe extern "C" fn no_op(_: *mut std::ffi::c_void, _: usize, _: *mut std::ffi::c_void) {}

    // https://github.com/denoland/rusty_v8/pull/926
    //
    // SAFETY: `mem.data` points to valid memory and is valid for `mem.size` bytes `no_op` will not
    //         try to de-allocate share memory.
    // TODO: Investigate to make sure that this does not have any implications on reading/writing.
    //       It's also not 100% clear what `ArrayBuffer` expects, is it ok to read/write while the
    //       `ArrayBuffer` exists?)
    //       https://app.asana.com/0/1199548034582004/1202024534527158/f
    let backing_store = unsafe {
        v8::ArrayBuffer::new_backing_store_from_ptr(
            segment.data.as_ptr().cast(),
            segment.size,
            no_op,
            std::ptr::null_mut(),
        )
    };
    let array_buffer = v8::ArrayBuffer::with_backing_store(scope, &backing_store.make_shared());

    let batch_id = segment.id();
    mem_batch_to_js(scope, batch_id, array_buffer.into())
}

pub(in crate::runner::javascript) fn state_to_js<'s, 'a>(
    scope: &mut v8::HandleScope<'s>,
    mut agent_batches: impl Iterator<Item = &'a AgentBatch>,
    mut message_batches: impl Iterator<Item = &'a MessageBatch>,
) -> JavaScriptResult<(Value<'s>, Value<'s>)> {
    let js_agent_batches = v8::Array::new(scope, 0);
    let js_message_batches = v8::Array::new(scope, 0);

    for (i_batch, (agent_batch, message_batch)) in agent_batches
        .by_ref()
        .zip(message_batches.by_ref())
        .enumerate()
    {
        let agent_batch = batch_to_js(scope, agent_batch.batch.segment())?;
        js_agent_batches
            .set_index(scope, i_batch as u32, agent_batch)
            .ok_or_else(|| {
                JavaScriptError::V8(format!(
                    "Couldn't set agent batch at index {i_batch} on batch array"
                ))
            })?;

        let message_batch = batch_to_js(scope, message_batch.batch.segment())?;
        js_message_batches
            .set_index(scope, i_batch as u32, message_batch)
            .ok_or_else(|| {
                JavaScriptError::V8(format!(
                    "Could not set message batch at index {i_batch} on message batch array"
                ))
            })?;
    }

    // There is no stable way of ensuring the length of an iterator, `zip` will stop as soon as one
    // iterator returns None, thus if both iterators has no elements left, they had the same length.
    debug_assert!(
        agent_batches.next().is_none() && message_batches.next().is_none(),
        "Agent batches and message batches needs to have the same size"
    );

    Ok((js_agent_batches.into(), js_message_batches.into()))
}

pub(in crate::runner::javascript) fn bytes_to_js<'s>(
    scope: &mut v8::HandleScope<'s>,
    bytes: &[u8],
) -> Value<'s> {
    let buffer = v8::ArrayBuffer::new(scope, bytes.len());

    if !bytes.is_empty() {
        // # Safety
        //
        // `bytes` is a slice so it can be read for `bytes.len()`
        // `buffer` was created with `bytes.len()` bytes so can be written to for `bytes.len()`
        // and they are properly aligned as bytes have are always correctly aligned
        unsafe {
            std::ptr::copy(
                bytes.as_ptr(),
                buffer
                    .get_backing_store()
                    .data()
                    .expect("bytes to not be empty")
                    .as_ptr()
                    .cast(),
                bytes.len(),
            );
        }
    }

    buffer.into()
}
