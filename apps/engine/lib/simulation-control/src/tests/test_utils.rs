use std::sync::Arc;

use execution::{
    package::{
        experiment::{
            basic::{BasicExperimentConfig, SingleRunExperimentConfig},
            ExperimentPackageConfig,
        },
        simulation::{
            init::{InitialState, InitialStateName},
            PackageInitConfig, SimulationId,
        },
    },
    worker_pool::{WorkerAllocation, WorkerPoolConfig},
};
use experiment_structure::{
    ExperimentConfig, ExperimentRun, PackageConfig, PackageConfigBuilder, PackageCreators,
    SimulationRunConfig, SimulationSource,
};
use rand::{prelude::StdRng, Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use stateful::{
    agent::{Agent, AgentId, AgentSchema, AgentStateField},
    field::{
        FieldScope, FieldSource, FieldSpec, FieldSpecMap, FieldType, FieldTypeVariant,
        RootFieldSpec, RootFieldSpecCreator,
    },
    global::Globals,
};

use crate::command::Error;

fn test_field_specs() -> FieldSpecMap {
    let mut map = FieldSpecMap::default();
    map.try_extend([RootFieldSpec {
        inner: FieldSpec::last_state_index_key(),
        source: FieldSource::Engine,
        scope: FieldScope::Hidden,
    }])
    .unwrap();
    map.try_extend([RootFieldSpec {
        inner: FieldSpec {
            name: "fixed_of_variable".to_string(),
            field_type: FieldType::new(
                FieldTypeVariant::FixedLengthArray {
                    field_type: Box::new(FieldType::new(
                        FieldTypeVariant::VariableLengthArray(Box::new(FieldType::new(
                            FieldTypeVariant::Number,
                            false,
                        ))),
                        false,
                    )),
                    len: 2,
                },
                false,
            ),
        },
        scope: FieldScope::Agent,
        source: FieldSource::Engine,
    }])
    .unwrap();
    map.try_extend([RootFieldSpec {
        inner: FieldSpec {
            name: "seed".to_string(),
            field_type: FieldType::new(FieldTypeVariant::Number, false),
        },
        scope: FieldScope::Agent,
        source: FieldSource::Engine,
    }])
    .unwrap();
    map.try_extend([RootFieldSpec {
        inner: FieldSpec {
            name: "complex".to_string(),
            field_type: FieldType::new(
                FieldTypeVariant::Struct(vec![
                    FieldSpec {
                        name: "position".to_string(),
                        field_type: FieldType::new(
                            FieldTypeVariant::FixedLengthArray {
                                field_type: Box::new(FieldType::new(
                                    FieldTypeVariant::Number,
                                    false,
                                )),
                                len: 2,
                            },
                            false,
                        ),
                    },
                    FieldSpec {
                        name: "abc".to_string(),
                        field_type: FieldType::new(
                            FieldTypeVariant::VariableLengthArray(Box::new(FieldType::new(
                                FieldTypeVariant::FixedLengthArray {
                                    field_type: Box::new(FieldType::new(
                                        FieldTypeVariant::Struct(vec![
                                            FieldSpec {
                                                name: "bar".to_string(),
                                                field_type: FieldType::new(
                                                    FieldTypeVariant::Boolean,
                                                    false,
                                                ),
                                            },
                                            FieldSpec {
                                                name: "baz".to_string(),
                                                field_type: FieldType::new(
                                                    FieldTypeVariant::VariableLengthArray(
                                                        Box::new(FieldType::new(
                                                            FieldTypeVariant::Number,
                                                            false,
                                                        )),
                                                    ),
                                                    false,
                                                ),
                                            },
                                            FieldSpec {
                                                name: "qux".to_string(),
                                                field_type: FieldType::new(
                                                    FieldTypeVariant::FixedLengthArray {
                                                        field_type: Box::new(FieldType::new(
                                                            FieldTypeVariant::Number,
                                                            false,
                                                        )),
                                                        len: 4,
                                                    },
                                                    false,
                                                ),
                                            },
                                            FieldSpec {
                                                name: "quux".to_string(),
                                                field_type: FieldType::new(
                                                    FieldTypeVariant::FixedLengthArray {
                                                        field_type: Box::new(FieldType::new(
                                                            FieldTypeVariant::String,
                                                            false,
                                                        )),
                                                        len: 16,
                                                    },
                                                    true,
                                                ),
                                            },
                                        ]),
                                        false,
                                    )),
                                    len: 6,
                                },
                                false,
                            ))),
                            false,
                        ),
                    },
                ]),
                false,
            ),
        },
        scope: FieldScope::Agent,
        source: FieldSource::Engine,
    }])
    .unwrap();
    map
}

pub fn root_field_spec_from_agent_field(field: AgentStateField) -> Result<RootFieldSpec, Error> {
    Ok(RootFieldSpec {
        inner: FieldSpec {
            name: field.name().into(),
            field_type: field.try_into()?,
        },
        scope: FieldScope::Agent,
        source: FieldSource::Engine,
    })
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
    let id = AgentId::generate();
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

pub fn dummy_sim_run_config() -> SimulationRunConfig {
    let package_init = PackageInitConfig {
        initial_state: InitialState {
            name: InitialStateName::InitJson,
            src: "{}".to_string(),
        },
        behaviors: Vec::new(),
        packages: Vec::new(),
    };

    let globals = Globals::default();

    let package_config = PackageConfigBuilder::new()
        .set_init_packages([])
        .set_context_packages([])
        .set_state_packages([])
        .set_output_packages([])
        .build()
        .unwrap();

    let package_creators = PackageCreators::from_config(&package_config, &package_init).unwrap();

    let schema = package_creators
        .create_schema(&package_init, &globals)
        .unwrap();

    let simulation = SimulationSource {
        name: "project_name".to_string(),
        globals_src: "{}".to_string(),
        experiments_src: None,
        datasets: Vec::new(),
        package_init,
    };

    let experiment_config = Arc::new(ExperimentConfig {
        packages: Arc::new(PackageConfig {
            init: Vec::new(),
            context: Vec::new(),
            state: Vec::new(),
            output: Vec::new(),
        }),
        experiment_run: Arc::new(ExperimentRun::new(
            "experiment_name".to_string().into(),
            simulation,
            ExperimentPackageConfig::Basic(BasicExperimentConfig::SingleRun(
                SingleRunExperimentConfig { num_steps: 1 },
            )),
        )),
        target_max_group_size: 100_000,
        worker_pool: Arc::new(WorkerPoolConfig {
            worker_config: Default::default(),
            num_workers: 0,
        }),
        base_globals: globals.clone(),
    });

    let persistence_config = package_creators
        .create_persistent_config(&experiment_config, &globals)
        .unwrap();
    SimulationRunConfig::new(
        Arc::clone(&experiment_config),
        SimulationId::new(0),
        globals,
        WorkerAllocation::default(),
        schema,
        persistence_config,
        0,
    )
}

/// Creates a FieldSpecMap, vec of dummy Agent states for testing, and accompanying AgentSchema
pub fn gen_schema_and_test_agents(
    num_agents: usize,
    seed: u64,
) -> Result<(Arc<AgentSchema>, Vec<Agent>), Error> {
    let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    let mut field_spec_map = FieldSpecMap::empty();
    field_spec_map.try_extend([field_spec_creator.create(
        "age".to_string(),
        FieldType {
            variant: FieldTypeVariant::Number,
            nullable: false,
        },
        FieldScope::Agent,
    )])?;
    field_spec_map
        .try_extend(RootFieldSpec::base_agent_fields().map_err(|err| {
            Error::from(format!("Failed to add base agent field specs: {err}"))
        })?)?;

    field_spec_map.try_extend(test_field_specs().drain_field_specs())?;

    let schema = Arc::new(AgentSchema::new(field_spec_map)?);

    let mut agents = Vec::with_capacity(num_agents);
    for i in 0..num_agents {
        let agent_seed = (seed as usize + i) as u64;
        agents.push(make_dummy_agent(agent_seed)?);
    }

    Ok((schema, agents))
}
