use std::sync::Arc;

use parking_lot::RwLock;
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};

use super::BatchPool;
use crate::{
    datastore::{
        batch::{self, AgentBatch, MessageBatch},
        table::{
            pool::proxy::{PoolReadProxy, PoolWriteProxy},
            references::AgentMessageReference,
        },
        Error, Result, UUID_V4_LEN,
    },
    proto::ExperimentRunTrait,
    SimRunConfig,
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

impl super::Pool<MessageBatch> for MessagePool {
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

impl PoolReadProxy<MessageBatch> {
    pub fn get_reader(&self) -> MessageReader<'_> {
        MessageReader {
            loaders: self
                .batches_iter()
                .map(MessageBatch::message_loader)
                .collect(),
        }
    }

    pub fn recipient_iter_all<'b: 'r, 'r>(
        &'b self,
    ) -> impl ParallelIterator<Item = (Vec<&'b str>, AgentMessageReference)> + 'r {
        self.batches.par_iter().enumerate().flat_map(|(i, batch)| {
            batch
                .message_recipients_par_iter()
                .zip_eq(batch.message_usize_index_iter(i))
                .flat_map(|(recipients, references)| {
                    let res = recipients.collect::<Vec<_>>();
                    let refs = references.collect::<Vec<_>>();
                    res.into_par_iter().zip(refs.into_par_iter())
                })
        })
    }
}

pub struct MessageReader<'a> {
    loaders: Vec<batch::message::MessageLoader<'a>>,
}

impl<'a> MessageReader<'a> {
    pub fn get_loader(&self, batch_index: usize) -> Result<&batch::message::MessageLoader<'a>> {
        self.loaders
            .get(batch_index)
            .ok_or_else(|| Error::from("Invalid batch index for message reader"))
    }
}

impl MessageReader<'_> {
    pub fn type_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [AgentMessageReference],
    ) -> impl IndexedParallelIterator<Item = &'b str> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index]
                .get_type(reference.agent_index, reference.message_index)
        })
    }

    pub fn data_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [AgentMessageReference],
    ) -> impl IndexedParallelIterator<Item = &'b str> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index]
                .get_data(reference.agent_index, reference.message_index)
        })
    }

    pub fn from_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [AgentMessageReference],
    ) -> impl IndexedParallelIterator<Item = &'b [u8; UUID_V4_LEN]> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index].get_from(reference.agent_index)
        })
    }

    // TODO: UNUSED: Needs triage
    pub fn raw_msg_iter<'b: 'r, 'r>(
        &'b self,
        message_references: &'r [AgentMessageReference],
    ) -> impl IndexedParallelIterator<Item = batch::message::Raw<'b>> + 'r {
        message_references.par_iter().map(move |reference| {
            self.loaders[reference.batch_index]
                .get_raw_message(reference.agent_index, reference.message_index)
        })
    }
}

impl PoolWriteProxy<MessageBatch> {
    /// Clears all message columns in the pool and resizes them as necessary to accommodate new
    /// messages according to the provided [`agent_pool`].
    ///
    /// This can result in the number of batches being changed if more/less are now needed.
    pub fn reset(
        &mut self,
        message_pool: &mut MessagePool,
        agent_proxies: &PoolReadProxy<AgentBatch>,
        sim_config: &SimRunConfig,
    ) -> Result<()> {
        let message_schema = &sim_config.sim.store.message_schema;
        let experiment_id = &sim_config.exp.run.base().id;
        let mut removed = vec![];
        // Reversing sequence to remove from the back if there are
        // fewer agent batches than message batches
        for batch_index in (0..self.len()).rev() {
            if let Some(dynamic_batch) = agent_proxies.batch(batch_index) {
                self[batch_index].reset(dynamic_batch)?;
            } else {
                removed.push(message_pool.remove(batch_index));
            }
        }
        if agent_proxies.len() > self.len() {
            // Add message batches if there are more agent batches than message batches
            for agent_proxy in &agent_proxies[self.len()..] {
                let inbox = MessageBatch::empty_from_agent_batch(
                    agent_proxy,
                    &message_schema.arrow,
                    message_schema.static_meta.clone(),
                    experiment_id,
                )?;
                message_pool.push(inbox);
            }
        }
        Ok(())
    }
}
