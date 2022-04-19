#[cfg(test)]
mod tests {
    extern crate test;

    use memory::shared_memory::MemoryId;
    use stateful::agent::AgentBatch;
    use test::Bencher;
    use uuid::Uuid;

    use crate::datastore::test_utils::gen_schema_and_test_agents;

    #[bench]
    fn agent_batch_from_states(b: &mut Bencher) {
        let num_agents = 100;
        let (schema, agents) = gen_schema_and_test_agents(num_agents, 0).unwrap();
        let experiment_id = Uuid::new_v4();
        b.iter(|| {
            let _agent_batch = AgentBatch::from_agent_states(
                agents.as_slice(),
                &schema,
                MemoryId::new(experiment_id),
            )
            .unwrap();
        });
    }
}
