use std::sync::Arc;

use parking_lot::RwLock;
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};

use super::BatchPool;
use crate::{
    datastore::{
        batch,
        prelude::*,
        table::{
            pool::proxy::{PoolReadProxy, PoolWriteProxy},
            proxy::{BatchReadProxy, BatchWriteProxy},
            references::AgentMessageReference,
        },
        UUID_V4_LEN,
    },
    proto::ExperimentRunTrait,
    SimRunConfig,
};

/// TODO: DOC
#[derive(Clone)]
pub struct MessagePool {
    batches: Vec<Arc<RwLock<MessageBatch>>>,
}

impl MessagePool {
    pub fn new(batches: Vec<Arc<RwLock<MessageBatch>>>) -> MessagePool {
        MessagePool { batches }
    }

    pub fn empty() -> MessagePool {
        MessagePool {
            batches: Default::default(),
        }
    }

    pub fn len(&self) -> usize {
        self.batches.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn push(&mut self, batch: MessageBatch) {
        self.batches.push(Arc::new(RwLock::new(batch)))
    }

    pub fn remove(&mut self, index: usize) -> Result<BatchReadProxy<MessageBatch>> {
        BatchReadProxy::new(&self.batches.remove(index))
    }
}

impl BatchPool<MessageBatch> for MessagePool {
    fn read_proxy(&self) -> Result<PoolReadProxy<MessageBatch>> {
        self.batches.iter().map(BatchReadProxy::new).collect()
    }

    fn partial_read_proxy(&self, indices: &[usize]) -> Result<PoolReadProxy<MessageBatch>> {
        self.batches
            .iter()
            .enumerate()
            .filter(|(index, _)| indices.contains(index))
            .map(|(_, b)| BatchReadProxy::new(b))
            .collect()
    }

    fn write_proxy(&mut self) -> Result<PoolWriteProxy<MessageBatch>> {
        self.batches.iter().map(BatchWriteProxy::new).collect()
    }

    fn partial_write_proxy(&self, indices: &[usize]) -> Result<PoolWriteProxy<MessageBatch>> {
        self.batches
            .iter()
            .enumerate()
            .filter(|(index, _)| indices.contains(index))
            .map(|(_, b)| BatchWriteProxy::new(b))
            .collect()
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
        agent_pool: &PoolReadProxy<AgentBatch>,
        sim_config: &SimRunConfig,
    ) -> Result<()> {
        let message_schema = &sim_config.sim.store.message_schema;
        let experiment_id = &sim_config.exp.run.base().id;
        let mut removed = vec![];
        // Reversing sequence to remove from the back
        for batch_index in (0..self.len()).rev() {
            if let Some(dynamic_batch) = agent_pool.batch(batch_index) {
                self[batch_index].reset(dynamic_batch)?;
            } else {
                let batch = message_pool.remove(batch_index)?;
                removed.push(batch.get_batch_id().to_string());
            }
        }
        if agent_pool.len() > self.len() {
            for batch in &agent_pool[self.len()..] {
                let inbox = MessageBatch::empty_from_agent_batch(
                    batch,
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
