extern crate test;

use execution::package::experiment::ExperimentId;
use memory::shared_memory::MemoryId;
use stateful::agent::AgentBatch;
use test::Bencher;

use crate::tests::test_utils::gen_schema_and_test_agents;

#[bench]
#[cfg_attr(miri, ignore)]
fn agent_batch_from_states(b: &mut Bencher) {
    let num_agents = 100;
    let (schema, agents) = gen_schema_and_test_agents(num_agents, 0).unwrap();
    let experiment_id = ExperimentId::generate();
    b.iter(|| {
        let _agent_batch = AgentBatch::from_agent_states(
            agents.as_slice(),
            &schema,
            MemoryId::new(experiment_id.as_uuid()),
        )
        .unwrap();
    });
}
