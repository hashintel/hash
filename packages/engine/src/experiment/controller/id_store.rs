use std::{collections::HashMap, sync::Arc, time::Duration};

use tokio::{
    sync::{oneshot, RwLock},
    time,
};

use super::{Error, Result};
use crate::proto::{SimulationRegisteredId, SimulationShortId};

enum SendersOrId {
    Senders(Vec<oneshot::Sender<SimulationRegisteredId>>),
    ID(SimulationRegisteredId),
}

#[derive(Clone, Default)]
pub struct SimIdStore {
    inner: Arc<RwLock<HashMap<SimulationShortId, SendersOrId>>>,
}

impl SimIdStore {
    pub async fn get_registered_id_with_timeout(
        &self,
        short_id: SimulationShortId,
        timeout_ms: usize,
    ) -> Result<SimulationRegisteredId> {
        time::timeout(
            Duration::from_millis(timeout_ms as u64),
            self.get_registered_id(short_id),
        )
        .await?
    }

    async fn get_registered_id(
        &self,
        short_id: SimulationShortId,
    ) -> Result<SimulationRegisteredId> {
        let mut inner = self.inner.write().await;
        let value = inner.get_mut(&short_id);
        return if let Some(senders_or_id) = value {
            match senders_or_id {
                SendersOrId::Senders(senders) => {
                    let (sender, receiver) = oneshot::channel();
                    senders.push(sender);
                    drop(inner); // Ensure we release lock
                    Ok(receiver.await?)
                }
                SendersOrId::ID(id) => Ok(id.clone()),
            }
        } else {
            let (sender, receiver) = oneshot::channel();
            inner.insert(short_id, SendersOrId::Senders(vec![sender]));
            drop(inner); // Ensure we release lock
            Ok(receiver.await?)
        };
    }

    pub(super) async fn set_registered_id(
        &mut self,
        short_id: SimulationShortId,
        registered_id: SimulationRegisteredId,
    ) -> Result<()> {
        let mut inner = self.inner.write().await;
        let value = inner.get_mut(&short_id);
        return if let Some(senders_or_id) = value {
            match senders_or_id {
                SendersOrId::Senders(senders) => {
                    let senders = std::mem::take(senders);
                    for sender in senders {
                        sender.send(registered_id.clone())?;
                    }
                    *senders_or_id = SendersOrId::ID(registered_id);
                    Ok(())
                }
                SendersOrId::ID(id) => {
                    if !(&*id).eq(&registered_id) {
                        Err(Error::from(format!(
                            "Simulation already registered with different id. Original: {}, new: \
                             {}",
                            id, registered_id
                        )))
                    } else {
                        Ok(())
                    }
                }
            }
        } else {
            inner.insert(short_id, SendersOrId::ID(registered_id));
            Ok(())
        };
    }
}
