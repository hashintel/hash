use std::{
    collections::{hash_map::Entry, HashMap},
    ops::Deref,
};

use rayon::iter::ParallelIterator;

use crate::{
    agent,
    error::Result,
    message::{recipient_iter_all, MessageBatch},
    proxy::PoolReadProxy,
};

/// A mapping from recipient to message reference.
/// Used in combination with `MessageReader`.
pub struct MessageMap {
    inner: HashMap<String, Vec<agent::MessageReference>>,
}

impl MessageMap {
    pub fn new(pool: &PoolReadProxy<MessageBatch>) -> Result<MessageMap> {
        let iter = recipient_iter_all(pool);
        let inner = iter
            .fold(
                HashMap::<String, Vec<agent::MessageReference>>::new,
                |mut acc, (recipients, message_ref)| {
                    recipients.iter().for_each(|recipient| {
                        // TODO: OS - (decide) currently if message has duplicate recipients then
                        //   agents can get duplicate messages (filtering is expensive)
                        if let Some(entry) = acc.get_mut(*recipient) {
                            entry.push(message_ref.clone())
                        } else {
                            acc.insert(recipient.to_string(), vec![message_ref.clone()]);
                        }
                    });
                    acc
                },
            )
            .reduce(HashMap::new, |mut a, b| {
                b.into_iter().for_each(|(name, mut value)| {
                    match a.entry(name) {
                        Entry::Occupied(mut entry) => {
                            entry.get_mut().append(&mut value);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(value);
                        }
                    };
                });
                a
            });

        Ok(MessageMap { inner })
    }

    pub fn get_msg_refs(&self, recipient: &str) -> &[agent::MessageReference] {
        self.inner.get(recipient).map(Deref::deref).unwrap_or(&[])
    }
}
