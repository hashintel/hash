use std::sync::Arc;

use rand::{prelude::StdRng, Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    config::{
        EngineConfig, Globals, PackageConfig, PersistenceConfig, StoreConfig, WorkerPoolConfig,
    },
    datastore::{
        error::Error,
        schema::{
            state::AgentSchema, FieldScope, FieldSource, FieldSpecMap, FieldType, FieldTypeVariant,
            RootFieldSpecCreator,
        },
    },
    hash_types::state::{Agent, AgentStateField},
    proto::{ExperimentRunBase, InitialState, InitialStateName, ProjectBase},
    simulation::package::creator::{get_base_agent_fields, PackageCreators},
    ExperimentConfig, SimRunConfig, SimulationConfig,
};

lazy_static::lazy_static! {
    pub static ref JSON_KEYS: serde_json::Value = serde_json::json!({
        "defined": {
            "foo": {
                "bar": "boolean",
                "baz": "[number]",
                "qux": "[number; 4]",
                "quux": "[string; 16]?",
            }
        },
        "keys": {
            "complex": {
                "position": "[number; 2]",
                "abc": "[[foo; 6]]"
            },
            "fixed_of_variable" : "[[number]; 2]",
            "seed": "number"
        }
    });
}

#[derive(Serialize, Deserialize)]
pub struct Foo {
    bar: bool,
    baz: Vec<f64>,
    qux: [f64; 4],
    quux: Option<[String; 16]>,
}

fn rand_string(seed: u64) -> String {
    let mut rng = StdRng::seed_from_u64(seed);
    let count = rng.gen_range(0..64);
    String::from_utf8(
        std::iter::repeat(())
            .map(|()| rng.sample(rand::distributions::Alphanumeric))
            .take(count)
            .collect::<Vec<u8>>(),
    )
    .unwrap()
}

impl Foo {
    fn new(seed: u64) -> Foo {
        let mut rng = StdRng::seed_from_u64(seed);
        Foo {
            bar: rng.gen(),
            baz: (0..rng.gen_range(0..8)).map(|_| rng.gen()).collect(),
            qux: rng.gen(),
            quux: {
                if rng.gen_bool(0.7) {
                    Some(arr_macro::arr![rand_string(seed); 16])
                } else {
                    None
                }
            },
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct Complex {
    position: [f64; 2],
    abc: Vec<[Foo; 6]>,
}

impl Complex {
    fn new(seed: u64) -> Complex {
        let mut rng = StdRng::seed_from_u64(seed);

        Complex {
            position: rng.gen(),
            abc: (0..rng.gen_range(0..8))
                .map(|_| arr_macro::arr![Foo::new(seed); 6])
                .collect(),
        }
    }
}

fn make_dummy_agent(seed: u64) -> Result<Agent, Error> {
    let mut rng = StdRng::seed_from_u64(seed);

    let mut agent = Agent::empty();
    let id = uuid::Uuid::new_v4().to_hyphenated().to_string();
    agent.set(AgentStateField::AgentId.name(), &id)?;
    // We do an implicit conversion to f64 for number types so for testing need to ensure
    // manually created agents only have f64
    agent.set("age", Some(rng.gen::<f64>()))?;
    agent.set(AgentStateField::AgentName.name(), rand_string(seed))?;

    let rand_vec1 = (0..rng.gen_range(0..14))
        .map(|_| rng.gen_range(-10_f64..13.5))
        .collect::<Vec<_>>();
    let rand_vec2 = (0..rng.gen_range(0..23))
        .map(|_| rng.gen_range(-2.6_f64..12.5))
        .collect::<Vec<_>>();
    agent.set("fixed_of_variable", vec![rand_vec1, rand_vec2])?;
    agent.set("complex", Complex::new(seed))?;
    // see above per f64
    agent.set("seed", Some(seed as f64))?;

    Ok(agent)
}

pub fn dummy_sim_run_config() -> SimRunConfig {
    let project_base = ProjectBase {
        name: "project_name".to_string(),
        initial_state: InitialState {
            name: InitialStateName::InitJson,
            src: "{}".to_string(),
        },
        globals_src: "{}".to_string(),
        experiments_src: None,
        behaviors: Vec::new(),
        datasets: Vec::new(),
        packages: Vec::new(),
    };
    let base = ExperimentRunBase {
        name: "experiment_name".to_string().into(),
        id: Uuid::new_v4(),
        project_base,
    };
    let globals: Globals = Default::default();

    let exp_config = Arc::new(ExperimentConfig {
        packages: Arc::new(PackageConfig {
            init: Vec::new(),
            context: Vec::new(),
            state: Vec::new(),
            output: Vec::new(),
        }),
        run: Arc::new(base.into()),
        worker_pool: Arc::new(WorkerPoolConfig {
            worker_base_config: Default::default(),
            num_workers: 0,
        }),
        base_globals: globals.clone(),
    });

    // We can't use `PackageCreators::from_config` as it will initialise the global static
    // `SyncOnceCell`s multiple times (thus erroring) if we run multiple tests at once
    let package_creators = PackageCreators::new(Vec::new(), Vec::new(), Vec::new(), Vec::new());

    SimRunConfig {
        exp: exp_config.clone(),
        sim: Arc::new(SimulationConfig {
            id: 0,
            globals: Arc::default(),
            store: Arc::new(
                StoreConfig::new_sim(&exp_config, &globals, &package_creators).unwrap(),
            ),
            engine: Arc::new(EngineConfig {
                worker_allocation: Vec::new(),
                num_workers: 0,
            }),
            max_num_steps: 0,
            persistence: PersistenceConfig::new_sim(&exp_config, &globals, &package_creators)
                .unwrap(),
        }),
    }
}

/// Creates a FieldSpecMap, vec of dummy Agent states for testing, and accompanying AgentSchema
pub fn gen_schema_and_test_agents(
    num_agents: usize,
    seed: u64,
) -> Result<(Arc<AgentSchema>, Vec<Agent>), Error> {
    let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    let mut field_spec_map = FieldSpecMap::empty();
    field_spec_map.add(field_spec_creator.create(
        "age".to_string(),
        FieldType {
            variant: FieldTypeVariant::Number,
            nullable: false,
        },
        FieldScope::Agent,
    ))?;
    field_spec_map
        .add_multiple(get_base_agent_fields().map_err(|err| {
            Error::from(format!("Failed to add base agent field specs: {err}"))
        })?)?;

    field_spec_map.union(FieldSpecMap::from_short_json(
        JSON_KEYS.clone(),
        FieldSource::Engine,
        FieldScope::Agent,
    )?)?;

    let schema = Arc::new(AgentSchema::new(field_spec_map)?);

    let mut agents = Vec::with_capacity(num_agents);
    for i in 0..num_agents {
        let agent_seed = (seed as usize + i) as u64;
        agents.push(make_dummy_agent(agent_seed)?);
    }

    Ok((schema, agents))
}
