mod action;
mod batch;
mod command;
mod distribution;
mod inbound;
mod plan;
mod planner;

pub use plan::MigrationPlan;
pub use planner::CreateRemovePlanner;

use crate::datastore::prelude::*;

type BehaviorChain = Vec<u16>;
type ChainIndex = usize;

type AgentIndex = crate::datastore::batch::migration::IndexAction;
type BatchIndex = usize;
type WorkerIndex = usize;

use std::collections::HashMap;

pub(self) fn behavior_list_to_indices(
    behaviors: &Vec<&[u8]>,
    map: &HashMap<Vec<u8>, u16>,
) -> Result<Vec<u16>> {
    behaviors
        .iter()
        .map(|bytes| {
            map.get(*bytes).map(|index| *index).ok_or_else(|| {
                let name = String::from_utf8(bytes.to_vec());
                log::error!("Couldn't find {:?}", name);
                map.iter().for_each(|(left, right)| {
                    log::info!(
                        "{} <-> {}",
                        String::from_utf8(left.to_vec()).unwrap(),
                        *right
                    );
                });
                match name {
                    Ok(name) => Error::InvalidBehaviorName(name),
                    Err(_) => Error::InvalidBehaviorNameUtf8,
                }
            })
        })
        .collect()
}
