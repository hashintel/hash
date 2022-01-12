use std::{ops::Deref, sync::Arc};

use parking_lot::{RwLock, RwLockReadGuard};
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};

use super::{agent::AgentPool, BatchPool};
use crate::{
    datastore::{batch, prelude::*, table::references::AgentMessageReference, UUID_V4_LEN},
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

    fn batches(&self) -> &Vec<Arc<RwLock<MessageBatch>>> {
        &self.batches
    }

    fn batches_mut(&mut self) -> &mut Vec<Arc<RwLock<MessageBatch>>> {
        &mut self.batches
    }

    pub fn read_batches(&self) -> Result<Vec<RwLockReadGuard<'_, MessageBatch>>> {
        self.batches()
            .iter()
            .map(|a| {
                a.try_read()
                    .ok_or_else(|| Error::from("failed to read batches"))
            })
            .collect::<Result<_>>()
    }

    pub fn read(&self) -> Result<MessagePoolRead<'_>> {
        let read_batches = self
            .batches()
            .iter()
            .map(|batch| {
                batch
                    .try_read()
                    .ok_or_else(|| Error::from("Failed to acquire read lock"))
            })
            .collect::<Result<_>>()?;
        Ok(MessagePoolRead {
            batches: read_batches,
        })
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

    pub fn reset(&mut self, agent_pool: &AgentPool, sim_config: &SimRunConfig) -> Result<()> {
        let message_schema = &sim_config.sim.store.message_schema;
        let experiment_id = &sim_config.exp.id;
        let mut removed = vec![];
        (0..self.batches.len())
            .rev()
            .try_for_each::<_, Result<()>>(|batch_index| {
                if let Some(dynamic_batch) = agent_pool.get_batch_at_index(batch_index)? {
                    let inbox_batch = &mut self.batches[batch_index]
                        .try_write()
                        .ok_or_else(|| Error::from("Failed to acquire write lock"))?;
                    inbox_batch.reset(&dynamic_batch)?
                } else {
                    let batch_arc = self.batches.remove(batch_index);
                    let batch = batch_arc
                        .try_read()
                        .ok_or_else(|| Error::from("Failed to acquire read lock"))?;
                    removed.push(batch.get_batch_id().to_string());
                }
                Ok(())
            })?;
        if agent_pool.len() > self.len() {
            agent_pool.batches()[self.len()..]
                .iter()
                .try_for_each::<_, Result<()>>(|batch| {
                    let inbox = MessageBatch::empty_from_agent_batch(
                        batch
                            .try_read()
                            .ok_or_else(|| Error::from("Failed to acquire read lock"))?
                            .deref(),
                        &message_schema.arrow,
                        message_schema.static_meta.clone(),
                        experiment_id,
                    )?;
                    self.batches_mut().push(Arc::new(RwLock::new(inbox)));
                    Ok(())
                })?;
        }
        Ok(())
    }
}

// TODO: (clarity) Replace with MessageReader<'a> or rename ?
pub struct MessagePoolRead<'a> {
    batches: Vec<RwLockReadGuard<'a, MessageBatch>>,
}

impl<'a> MessagePoolRead<'a> {
    pub fn get_reader(&'a self) -> MessageReader<'a> {
        let mut loaders = Vec::with_capacity(self.batches.len());
        for batch in &self.batches {
            loaders.push(batch.message_loader());
        }

        MessageReader { loaders }
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

impl BatchPool<MessageBatch> for MessagePool {
    fn batches(&self) -> &[Arc<RwLock<MessageBatch>>] {
        &self.batches
    }

    fn mut_batches(&mut self) -> &mut Vec<Arc<RwLock<MessageBatch>>> {
        &mut self.batches
    }
}
