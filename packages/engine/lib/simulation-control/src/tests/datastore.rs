use std::borrow::Cow;

use execution::package::experiment::ExperimentId;
use rand::Rng;
use stateful::{
    agent::{AgentBatch, IntoAgents},
    field::UUID_V4_LEN,
    state::State,
};

use crate::command::Result;
#[allow(clippy::wildcard_imports)] // Desigend as test-prelude
use crate::tests::test_utils::*;

#[test]
#[cfg_attr(miri, ignore)]
pub fn growable_array_modification() -> Result<()> {
    pub fn modify_name(shmem_os_id: &str) -> Result<Vec<Option<String>>> {
        let mut state_batch = *AgentBatch::from_shmem_os_id(shmem_os_id)?;
        let mut column = state_batch.names()?;
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
        let change = state_batch.name_changes(&column)?;
        state_batch.batch.queue_change(change)?;
        state_batch.batch.flush_changes()?;
        Ok(targets)
    }

    let num_agents = 1000;

    let (schema, agents) = gen_schema_and_test_agents(num_agents, 0)?;

    let mut state =
        State::from_agent_states(&agents, dummy_sim_run_config().to_state_create_parameters())
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

    let names = batch_proxy.names()?;
    let agent_states = batch_proxy.to_agent_states(Some(&schema))?;

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
    let uuid = ExperimentId::generate();
    let bytes = uuid.as_bytes();
    assert_eq!(bytes.len(), UUID_V4_LEN);
}
