//! The `datastore` module includes logic about handling creation, modification, and access of
//! simulation data that's shared across the engine and runtimes.
//!
//! It contains the logic relating to storing data within Arrow, which allows us to efficiently
//! share large quantities of data between runtimes. It also includes the functionalities we use to
//! dynamically initialize data from schemas, and logic around data access and safety.
// TODO: DOC improve wording of above, and signpost the key modules
pub mod arrow;
pub mod batch;
mod error;
pub mod schema;
pub mod shared_store;
pub mod store;
pub mod table;
#[cfg(test)]
pub mod test_utils;

pub use self::error::{Error, Result};

/// We store Agent IDs in the UUID-byte format (not string bytes).
/// This means their length is 128 bits i.e. 16 bytes
pub const UUID_V4_LEN: usize = 16;
pub const POSITION_DIM: usize = 3;

#[cfg(test)]
pub mod tests {
    use std::{borrow::Cow, sync::Arc};

    use ::arrow::array::{Array, BooleanBuilder, FixedSizeListBuilder};
    use rand::Rng;

    #[allow(clippy::wildcard_imports)] // Desigend as test-prelude
    use crate::datastore::test_utils::*;
    use crate::datastore::{
        arrow::batch_conversion::IntoAgents,
        batch::{iterators, AgentBatch},
        error::Result,
        table::state::State,
        UUID_V4_LEN,
    };

    #[test]
    pub fn growable_array_modification() -> Result<()> {
        pub fn modify_name(shmem_os_id: &str) -> Result<Vec<Option<String>>> {
            let mut state_batch = *AgentBatch::from_shmem_os_id(shmem_os_id)?;
            let record_batch = state_batch.batch.record_batch()?;
            let mut column = iterators::record_batch::get_agent_name(record_batch)?;
            // `targets` values will be checked against shared memory data
            // in order to check if changes were flushed properly
            let mut targets = Vec::with_capacity(column.len());
            for entry in &mut column {
                let mut rng = rand::thread_rng();
                if rng.gen_bool(0.1) {
                    *entry = None;
                    targets.push(None);
                } else if rng.gen_bool(0.8) {
                    let count = rng.gen_range(0..1000);
                    let string = String::from_utf8(
                        std::iter::repeat(())
                            .map(|()| rng.sample(rand::distributions::Alphanumeric))
                            .take(count)
                            .collect::<Vec<u8>>(),
                    )?;
                    targets.push(Some(string.clone()));
                    *entry = Some(Cow::Owned(string));
                } else {
                    match entry {
                        Some(v) => targets.push(Some(v.to_string())),
                        None => targets.push(None),
                    }
                }
            }
            let change = iterators::record_batch::agent_name_as_array(record_batch, column)?;
            state_batch.batch.queue_change(change)?;
            state_batch.batch.flush_changes()?;
            Ok(targets)
        }

        let num_agents = 1000;

        let (schema, agents) = gen_schema_and_test_agents(num_agents, 0)?;

        let mut state = State::from_agent_states(&agents, Arc::new(dummy_sim_run_config()))
            .expect("Couldn't turn `Vec<Agent>` into `State`");

        // get the ID of the shared-memory segment for the first batch of agents
        let shmem_id = state
            .read()?
            .agent_pool()
            .batch(0)
            .unwrap()
            .batch
            .segment()
            .id()
            .to_owned();

        // Run "behavior"
        let targets = modify_name(&shmem_id)?;

        // TODO: This actually shows that converting to and from a batch id is a way to mutate a
        //       batch without acquiring a write lock (by creating a write proxy).
        let _unlocked_batch = AgentBatch::from_shmem_os_id(&shmem_id)?;

        state
            .write()?
            .agent_pool_mut()
            .batch_mut(0)
            .unwrap()
            .batch
            .maybe_reload()?;

        let state_proxy = state.read()?;
        let batch_proxy: &AgentBatch = state_proxy.agent_pool().batch(0).unwrap();
        let record_batch = batch_proxy.batch.record_batch()?;

        let names = iterators::record_batch::get_agent_name(record_batch)?;
        let agent_states = record_batch.into_agent_states(Some(&schema))?;

        targets.into_iter().enumerate().for_each(|(i, t)| match t {
            Some(v) => {
                assert_eq!(v, agent_states[i].agent_name.as_ref().unwrap().0);
                assert_eq!(v, names[i].as_deref().unwrap());
            }
            None => {
                assert!(agent_states[i].agent_name.is_none());
                assert!(names[i].as_deref().is_none());
            }
        });

        Ok(())
    }

    #[test]
    pub fn uuid_v4_len() {
        let uuid = uuid::Uuid::new_v4();
        let bytes = uuid.as_bytes();
        assert_eq!(bytes.len(), UUID_V4_LEN);
    }

    #[test]
    fn test_print_boolean_array() -> Result<()> {
        let boolean_builder = BooleanBuilder::new(100);
        let mut fixed_size_list_builder = FixedSizeListBuilder::new(boolean_builder, 3);

        for _ in 0..10 {
            fixed_size_list_builder
                .values()
                .append_slice(&[true, false, false])?;
            fixed_size_list_builder.append(true)?;
        }

        let array = fixed_size_list_builder.finish();
        dbg!(&array.data_ref().child_data()[0].buffers()[0]);
        dbg!(&array.value(3).data_ref());
        // 0100 1001 | 1001 0010 | 0010 0100 | 0000 1001
        Ok(())
    }
}
