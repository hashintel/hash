use std::sync::Arc;

use memory::shared_memory::MemoryId;
use parking_lot::RwLock;
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};
use stateful::{
    agent, message,
    message::arrow::record_batch::MessageLoader,
    proxy::{BatchPool, BatchWriteProxy, Pool, PoolReadProxy},
};

use crate::{
    config::SimRunConfig,
    datastore::{
        batch::{AgentBatch, MessageBatch},
        error::{Error, Result},
        UUID_V4_LEN,
    },
    proto::ExperimentRunTrait,
};

/// A collection of [`Batch`]es which contain the current (outbound) messages of agents.
///
/// This is kept separate to the [`AgentPool`], because while agents can be removed between steps,
/// messages are still sent out in the next step (including the ones by deleted agents) — this
/// removes the need for making copies of the pool.
#[derive(Clone)]
pub struct MessagePool {
    batches: Vec<Arc<RwLock<MessageBatch>>>,
}

impl Pool<MessageBatch> for MessagePool {
    fn new(batches: Vec<Arc<RwLock<MessageBatch>>>) -> Self {
        Self { batches }
    }

    fn get_batches(&self) -> &[Arc<RwLock<MessageBatch>>] {
        &self.batches
    }

    fn get_batches_mut(&mut self) -> &mut Vec<Arc<RwLock<MessageBatch>>> {
        &mut self.batches
    }
}

impl MessagePool {
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
    pub fn reset(
        &mut self,
        agent_proxies: &PoolReadProxy<AgentBatch>,
        sim_config: &SimRunConfig,
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
            let experiment_id = &sim_config.exp.run.base().id;
            let message_schema = &sim_config.sim.store.message_schema;

            self.reserve(agent_proxies.len() - self.len());
            for agent_proxy in &agent_proxies[self.len()..] {
                let inbox = MessageBatch::empty_from_agent_batch(
                    agent_proxy,
                    &message_schema.arrow,
                    message_schema.static_meta.clone(),
                    MemoryId::new(*experiment_id),
                )?;
                self.push(inbox);
            }
        }
        Ok(())
    }
}

pub fn get_reader(
    message_pool_proxy: &PoolReadProxy<MessageBatch>,
) -> memory::Result<MessageReader<'_>> {
    let loaders: memory::Result<_> = message_pool_proxy
        .batches_iter()
        .map(|batch| {
            batch
                .batch
                .record_batch()
                .map(message::arrow::record_batch::message_loader)
        })
        .collect();
    Ok(MessageReader { loaders: loaders? })
}

pub fn recipient_iter_all<'b: 'r, 'r>(
    message_pool_proxy: &'b PoolReadProxy<MessageBatch>,
) -> impl ParallelIterator<Item = (Vec<&'b str>, agent::MessageReference)> + 'r {
    message_pool_proxy
        .batches
        .par_iter()
        .enumerate()
        .flat_map(|(i, group)| {
            let record_batch = group.batch.record_batch().unwrap(); // TODO: unwrap --> err
            message::arrow::record_batch::message_recipients_par_iter(record_batch)
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

pub struct MessageReader<'a> {
    loaders: Vec<MessageLoader<'a>>,
}

impl<'a> MessageReader<'a> {
    pub fn get_loader(&self, batch_index: usize) -> Result<&MessageLoader<'a>> {
        self.loaders
            .get(batch_index)
            .ok_or_else(|| Error::from("Invalid batch index for message reader"))
    }
}

impl MessageReader<'_> {
    pub fn type_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [agent::MessageReference],
    ) -> impl IndexedParallelIterator<Item = &'b str> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index]
                .get_type(reference.agent_index, reference.message_index)
        })
    }

    pub fn data_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [agent::MessageReference],
    ) -> impl IndexedParallelIterator<Item = &'b str> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index]
                .get_data(reference.agent_index, reference.message_index)
        })
    }

    pub fn from_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [agent::MessageReference],
    ) -> impl IndexedParallelIterator<Item = &'b [u8; UUID_V4_LEN]> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index].get_from(reference.agent_index)
        })
    }
}
