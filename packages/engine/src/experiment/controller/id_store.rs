use std::{collections::HashMap, sync::Arc, time::Duration};

use tokio::{
    sync::{oneshot, RwLock},
    time,
};

use super::{Error, Result};
use crate::proto::{SimulationRegisteredID, SimulationShortID};

enum SendersOrID {
    Senders(Vec<oneshot::Sender<SimulationRegisteredID>>),
    ID(SimulationRegisteredID),
}

#[derive(Clone, Default)]
pub struct SimIdStore {
    inner: Arc<RwLock<HashMap<SimulationShortID, SendersOrID>>>,
}

impl SimIdStore {
    pub async fn get_registered_id_with_timeout(
        &self,
        short_id: SimulationShortID,
        timeout_ms: usize,
    ) -> Result<SimulationRegisteredID> {
        time::timeout(
            Duration::from_millis(timeout_ms as u64),
            self.get_registered_id(short_id),
        )
        .await?
    }

    async fn get_registered_id(
        &self,
        short_id: SimulationShortID,
    ) -> Result<SimulationRegisteredID> {
        let mut inner = self.inner.write().await;
        let value = inner.get_mut(&short_id);
        return if let Some(senders_or_id) = value {
            match senders_or_id {
                SendersOrID::Senders(senders) => {
                    let (sender, receiver) = oneshot::channel();
                    senders.push(sender);
                    drop(inner); // Ensure we release lock
                    Ok(receiver.await?)
                }
                SendersOrID::ID(id) => Ok(id.clone()),
            }
        } else {
            let (sender, receiver) = oneshot::channel();
            inner.insert(short_id, SendersOrID::Senders(vec![sender]));
            drop(inner); // Ensure we release lock
            Ok(receiver.await?)
        };
    }

    pub(super) async fn set_registered_id(
        &mut self,
        short_id: SimulationShortID,
        registered_id: SimulationRegisteredID,
    ) -> Result<()> {
        let mut inner = self.inner.write().await;
        let value = inner.get_mut(&short_id);
        return if let Some(senders_or_id) = value {
            match senders_or_id {
                SendersOrID::Senders(senders) => {
                    let senders = std::mem::replace(senders, vec![]);
                    for sender in senders {
                        sender.send(registered_id.clone());
                    }
                    *senders_or_id = SendersOrID::ID(registered_id);
                    Ok(())
                }
                SendersOrID::ID(id) => {
                    if !id.eq(&registered_id) {
                        Err(Error::from(format!("Simulation already registered with different id. Original: {}, new: {}", id, registered_id)))
                    } else {
                        Ok(())
                    }
                }
            }
        } else {
            inner.insert(short_id, SendersOrID::ID(registered_id));
            Ok(())
        };
    }
}
