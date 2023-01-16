use std::{borrow::Borrow, sync::Arc};

use memory::shared_memory::MemoryId;
use parking_lot::RwLock;
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};
use uuid::Uuid;

use crate::{
    agent::AgentBatch,
    field::UUID_V4_LEN,
    message,
    message::{MessageBatch, MessageLoader, MessageSchema},
    proxy::{BatchPool, BatchReadProxy, BatchWriteProxy, PoolReadProxy, PoolWriteProxy},
    state::MessageReference,
    Error, Result,
};

/// A collection of [`MessageBatch`]es which contain the current (outbound) messages of agents.
///
/// This is kept separate to the [`AgentBatchPool`], because while agents can be removed between
/// steps, messages are still sent out in the next step (including the ones by deleted agents) —
/// this removes the need for making copies of the pool.
///
/// [`AgentBatchPool`]: crate::agent::AgentBatchPool
#[derive(Clone)]
pub struct MessageBatchPool {
    batches: Vec<Arc<RwLock<MessageBatch>>>,
}

impl MessageBatchPool {
    /// Creates a new pool from [`MessageBatch`]es.
    ///
    /// Because of the way `BatchPools` are organized it's required that the [`MessageBatch`]es are
    /// stored inside an [`RwLock`] behind an [`Arc`]. This is subject to change.
    pub fn new(batches: Vec<Arc<RwLock<MessageBatch>>>) -> Self {
        Self { batches }
    }

    /// Creates a new empty pool.
    pub fn empty() -> Self
    where
        Self: Sized,
    {
        Self::new(Vec::new())
    }

    pub fn reserve(&mut self, additional: usize) {
        self.batches.reserve(additional);
    }

    pub fn push(&mut self, batch: MessageBatch) {
        self.batches.push(Arc::new(RwLock::new(batch)))
    }

    /// Clears all message columns in the pool and resizes them as necessary to accommodate new
    /// messages according to the provided `agent_proxies`.
    ///
    /// This can result in the number of batches being changed if more/less are now needed.
    ///
    /// # Panics
    ///
    /// If batches in the message pool are currently borrowed elsewhere.
    pub fn reset<Id: Borrow<Uuid>>(
        &mut self,
        agent_proxies: &PoolReadProxy<AgentBatch>,
        memory_id: Id,
        message_schema: &MessageSchema,
    ) -> Result<()> {
        // Reversing sequence to remove from the back if there are fewer agent batches than message
        // batches
        for batch_index in (0..self.len()).rev() {
            if let Some(dynamic_batch) = agent_proxies.batch(batch_index) {
                let mut write_proxy = BatchWriteProxy::new(&self.batches[batch_index])
                    .unwrap_or_else(|err| {
                        panic!("Failed to reset Batch at index {batch_index}: {err}");
                    });
                write_proxy.reset(dynamic_batch)?;
            } else {
                // TODO: We possibly need to propagate the IDs of these batches to the runners, so
                //       they can be freed.
                //       https://app.asana.com/0/1199548034582004/1201940767289027/f
                self.remove(batch_index);
            }
        }

        // Add message batches if there are more agent batches than message batches
        if agent_proxies.len() > self.len() {
            self.reserve(agent_proxies.len() - self.len());
            for agent_proxy in &agent_proxies[self.len()..] {
                let inbox = MessageBatch::empty_from_agent_batch(
                    agent_proxy,
                    message_schema,
                    MemoryId::new(*memory_id.borrow()),
                )?;
                self.push(inbox);
            }
        }
        Ok(())
    }
}

impl BatchPool for MessageBatchPool {
    type Batch = MessageBatch;

    fn len(&self) -> usize {
        self.batches.len()
    }

    fn push(&mut self, batch: MessageBatch) {
        self.batches.push(Arc::new(RwLock::new(batch)))
    }

    fn remove(&mut self, index: usize) -> Self::Batch {
        match Arc::try_unwrap(self.batches.remove(index)) {
            Ok(rw_lock) => rw_lock.into_inner(),
            Err(batch_arc) => {
                let batch_arc = Arc::try_unwrap(batch_arc).unwrap_err();
                panic!(
                    "Failed to remove Batch at index {index} - there should be only one strong \
                     reference to the data (actual reference count: {}).",
                    Arc::strong_count(&batch_arc)
                )
            }
        }
    }

    fn swap_remove(&mut self, index: usize) -> Self::Batch {
        match Arc::try_unwrap(self.batches.swap_remove(index)) {
            Ok(rw_lock) => rw_lock.into_inner(),
            Err(batch_arc) => {
                panic!(
                    "Failed to swap remove Batch at index {index}, more than one strong reference \
                     (count: {}) to the Batch existed (arc memory address: {})",
                    Arc::strong_count(&batch_arc),
                    Arc::as_ptr(&batch_arc) as usize
                )
            }
        }
    }

    fn read_proxies(&self) -> Result<PoolReadProxy<Self::Batch>> {
        self.batches.iter().map(BatchReadProxy::new).collect()
    }

    fn partial_read_proxies(&self, indices: &[usize]) -> Result<PoolReadProxy<Self::Batch>> {
        indices
            .iter()
            .map(|i| BatchReadProxy::new(&self.batches[*i]))
            .collect()
    }

    fn write_proxies(&mut self) -> Result<PoolWriteProxy<Self::Batch>> {
        self.batches.iter().map(BatchWriteProxy::new).collect()
    }

    fn partial_write_proxies(&mut self, indices: &[usize]) -> Result<PoolWriteProxy<Self::Batch>> {
        indices
            .iter()
            .map(|i| BatchWriteProxy::new(&self.batches[*i]))
            .collect()
    }
}

pub fn recipient_iter_all<'b: 'r, 'r>(
    message_pool_proxy: &'b PoolReadProxy<MessageBatch>,
) -> impl ParallelIterator<Item = (Vec<&str>, MessageReference)> + 'r {
    message_pool_proxy
        .batches
        .par_iter()
        .enumerate()
        .flat_map(|(i, group)| {
            let record_batch = group.batch.record_batch().unwrap(); // TODO: unwrap --> err
            message::arrow::record_batch::message_recipients_iter(record_batch)
                .zip_eq(message::arrow::record_batch::message_usize_index_iter(
                    record_batch,
                    i,
                ))
                .flat_map(|(recipients, references)| {
                    let res = recipients.collect::<Vec<_>>();
                    let refs = references.collect::<Vec<_>>();
                    res.into_par_iter().zip_eq(refs.into_par_iter())
                })
        })
}

/// Loads messages from multiple [`MessageBatch`]es.
pub struct MessageReader<'a> {
    loaders: Vec<MessageLoader<'a>>,
}

impl<'a> MessageReader<'a> {
    pub fn from_message_pool(message_pool_proxy: &'a PoolReadProxy<MessageBatch>) -> Result<Self> {
        let loaders = message_pool_proxy
            .batches_iter()
            .map(MessageLoader::from_batch)
            .collect::<Result<_>>()?;
        Ok(Self { loaders })
    }

    pub fn get_loader(&self, batch_index: usize) -> Result<&MessageLoader<'a>> {
        self.loaders
            .get(batch_index)
            .ok_or_else(|| Error::from("Invalid batch index for message reader"))
    }
}

impl MessageReader<'_> {
    pub fn type_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [MessageReference],
    ) -> impl IndexedParallelIterator<Item = &'b str> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index]
                .get_type(reference.agent_index, reference.message_index)
        })
    }

    pub fn data_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [MessageReference],
    ) -> impl IndexedParallelIterator<Item = &'b str> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index]
                .get_data(reference.agent_index, reference.message_index)
        })
    }

    #[allow(clippy::wrong_self_convention)]
    pub fn from_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [MessageReference],
    ) -> impl IndexedParallelIterator<Item = &'b [u8; UUID_V4_LEN]> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index].get_from(reference.agent_index)
        })
    }
}
