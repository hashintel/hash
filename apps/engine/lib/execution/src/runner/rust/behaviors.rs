#[macro_use]
pub mod accessors;
mod error;

use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use accessors::{Accessors, OptionNativeColumnExt};

pub use self::error::{Error, Result};
use super::{
    behavior_execution::BehaviorId,
    context::AgentContext,
    error::{Error, Result},
    neighbor::Neighbor,
    state::{AgentState, GroupState},
};
use crate::{
    datastore::batch::AgentBatch, experiment::SharedBehavior, hash_types::Vec3,
    worker::runner::rust::Column,
};

// TODO: Change Rust behaviors to make these type aliases unnecessary.
type State<'s> = AgentState<'s>;
type Context<'c> = AgentContext<'c>;

// Engine:

accessors!(
    usize, // TODO: Correct type?
    BehaviorIndexColumn,
    __i_behavior,
    __i_behavior_set,
    __i_behavior_mut,
    __i_behavior_load,
    __i_behavior_commit
);

accessors!(
    Vec<BehaviorId>,
    BehaviorIdsColumn,
    __behaviors,
    __behaviors_set,
    __behaviors_mut,
    __behaviors_load,
    __behaviors_commit
);

accessors!(
    Vec<String>,
    BehaviorsColumn,
    behaviors,
    behaviors_set,
    behaviors_mut,
    behaviors_load,
    behaviors_commit
);

accessors!(
    Option<Vec3>,
    PositionColumn,
    position,
    position_set,
    position_mut,
    position_load,
    position_commit
);

accessors!(
    Option<Vec3>,
    DirectionColumn,
    direction,
    direction_set,
    direction_mut,
    direction_load,
    direction_commit
);

// Behaviors:

pub mod age;
accessors!(
    Option<f64>,
    AgeColumn,
    age,
    age_set,
    age_mut,
    age_load,
    age_commit
);

pub mod conway;
accessors!(
    bool,
    AliveColumn,
    alive,
    alive_set,
    alive_mut,
    alive_load,
    alive_commit
);

pub mod counter;
accessors!(
    Option<f64>,
    CounterColumn,
    counter,
    counter_set,
    counter_mut,
    counter_load,
    counter_commit
);
accessors!(
    Option<f64>,
    CounterIncrementColumn,
    counter_increment,
    counter_increment_set,
    counter_increment_mut,
    counter_increment_load,
    counter_increment_commit
);
accessors!(
    Option<f64>,
    CounterResetAtColumn,
    counter_reset_at,
    counter_reset_at_set,
    counter_reset_at_mut,
    counter_reset_at_load,
    counter_reset_at_commit
);
accessors!(
    Option<f64>,
    CounterResetToColumn,
    counter_reset_to,
    counter_reset_to_set,
    counter_reset_to_mut,
    counter_reset_to_load,
    counter_reset_to_commit
);

pub mod create_agents;
pub mod create_grids;
pub mod create_scatters;
pub mod create_stacks;
accessors!(
    Option<serde_json::Value>,
    AgentsColumn,
    agents,
    agents_set,
    agents_mut,
    agents_load,
    agents_commit
);
accessors!(
    Option<serde_json::Value>,
    GridTemplatesColumn,
    grid_templates,
    grid_templates_set,
    grid_templates_mut,
    grid_templates_load,
    grid_templates_commit
);
accessors!(
    Option<serde_json::Value>,
    ScatterTemplatesColumn,
    scatter_templates,
    scatter_templates_set,
    scatter_templates_mut,
    scatter_templates_load,
    scatter_templates_commit
);
accessors!(
    Option<serde_json::Value>,
    StackTemplatesColumn,
    stack_templates,
    stack_templates_set,
    stack_templates_mut,
    stack_templates_load,
    stack_templates_commit
);

pub mod decay;
accessors!(
    bool,
    DecayedColumn,
    decayed,
    decayed_set,
    decayed_mut,
    decayed_load,
    decayed_commit
);
accessors!(
    Option<f64>,
    DecayChanceColumn,
    decay_chance,
    decay_chance_set,
    decay_chance_mut,
    decay_chance_load,
    decay_chance_commit
);
accessors!(
    Option<serde_json::Value>,
    DecayEffectColumn,
    decay_effect,
    decay_effect_set,
    decay_effect_mut,
    decay_effect_load,
    decay_effect_commit
);

// pub mod diffusion;
accessors!(
    Option<f64>,
    DiffusionCoefColumn,
    diffusion_coef,
    diffusion_coef_set,
    diffusion_coef_mut,
    diffusion_coef_load,
    diffusion_coef_commit
);
accessors!(
    Option<serde_json::Value>,
    DiffusionTargetsColumn,
    diffusion_targets,
    diffusion_targets_set,
    diffusion_targets_mut,
    diffusion_targets_load,
    diffusion_targets_commit
);

pub mod move_in_direction;

// pub mod orient_toward_value;
accessors!(
    Option<String>,
    OrientTowardValueColumn,
    orient_toward_value,
    orient_toward_value_set,
    orient_toward_value_mut,
    orient_toward_value_load,
    orient_toward_value_commit
);
accessors!(
    Option<bool>,
    OrientTowardValueUphillColumn,
    orient_toward_value_uphill,
    orient_toward_value_uphill_set,
    orient_toward_value_uphill_mut,
    orient_toward_value_uphill_load,
    orient_toward_value_uphill_commit
);
accessors!(
    Option<bool>,
    OrientTowardValueCumulativeColumn,
    orient_toward_value_cumulative,
    orient_toward_value_cumulative_set,
    orient_toward_value_cumulative_mut,
    orient_toward_value_cumulative_load,
    orient_toward_value_cumulative_commit
);

pub mod physics;
accessors!(
    f64,
    MassColumn,
    mass,
    mass_set,
    mass_mut,
    mass_load,
    mass_commit
);
accessors!(
    Vec3,
    VelocityColumn,
    velocity,
    velocity_set,
    velocity_mut,
    velocity_load,
    velocity_commit
);
accessors!(
    Vec3,
    ForceColumn,
    force,
    force_set,
    force_mut,
    force_load,
    force_commit
);

pub mod random_away_movement;

pub mod random_movement;
accessors!(
    Option<f64>,
    RandomMovementStepSizeColumn,
    random_movement_step_size,
    random_movement_step_size_set,
    random_movement_step_size_mut,
    random_movement_step_size_load,
    random_movement_step_size_commit
);
accessors!(
    Option<f64>,
    RandomMovementSeekMinNeighborsColumn,
    random_movement_seek_min_neighbors,
    random_movement_seek_min_neighbors_set,
    random_movement_seek_min_neighbors_mut,
    random_movement_seek_min_neighbors_load,
    random_movement_seek_min_neighbors_commit
);
accessors!(
    Option<f64>,
    RandomMovementSeekMaxNeighborsColumn,
    random_movement_seek_max_neighbors,
    random_movement_seek_max_neighbors_set,
    random_movement_seek_max_neighbors_mut,
    random_movement_seek_max_neighbors_load,
    random_movement_seek_max_neighbors_commit
);

pub mod remove_self;

pub mod reproduce;
accessors!(
    Option<f64>,
    ReproductionRateColumn,
    reproduction_rate,
    reproduction_rate_set,
    reproduction_rate_mut,
    reproduction_rate_load,
    reproduction_rate_commit
);
accessors!(
    Option<serde_json::Value>,
    ReproductionChildValuesColumn,
    reproduction_child_values,
    reproduction_child_values_set,
    reproduction_child_values_mut,
    reproduction_child_values_load,
    reproduction_child_values_commit
);

// pub mod viral_spread;
accessors!(
    Option<f64>,
    InfectionChanceColumn,
    infection_chance,
    infection_chance_set,
    infection_chance_mut,
    infection_chance_load,
    infection_chance_commit
);
accessors!(
    Option<f64>,
    RecoveryChanceColumn,
    recovery_chance,
    recovery_chance_set,
    recovery_chance_mut,
    recovery_chance_load,
    recovery_chance_commit
);
accessors!(
    Option<bool>,
    ImmunityExistsColumn,
    immunity_exists,
    immunity_exists_set,
    immunity_exists_mut,
    immunity_exists_load,
    immunity_exists_commit
);
accessors!(
    Option<bool>,
    ImmuneColumn,
    immune,
    immune_set,
    immune_mut,
    immune_load,
    immune_commit
);
accessors!(
    Option<bool>,
    InfectedColumn,
    infected,
    infected_set,
    infected_mut,
    infected_load,
    infected_commit
);

pub mod collision;
// pub mod forces;
// pub mod gravity;
// pub mod spring;

use crate::datastore::arrow::util as arrow_util;
pub const BEHAVIOR_NAMES: [(&str, &str, &str); 21] = [
    ("age", "age.rs", "@hash/age/age.rs"),
    ("conway", "conway.rs", "@hash/conway/conway.rs"),
    ("counter", "counter.rs", "@hash/counter/counter.rs"),
    (
        "create_agents",
        "create_agents.rs",
        "@hash/create-agents/create_agents.rs",
    ),
    (
        "create_grids",
        "create_grids.rs",
        "@hash/create-grids/create_grids.rs",
    ),
    (
        "create_scatters",
        "create_scatters.rs",
        "@hash/create-scatters/create_scatters.rs",
    ),
    (
        "create_stacks",
        "create_stacks.rs",
        "@hash/create-stacks/create_stacks.rs",
    ),
    ("decay", "decay.rs", "@hash/decay/decay.rs"),
    ("diffusion", "diffusion.rs", "@hash/diffusion/diffusion.rs"),
    (
        "move_in_direction",
        "move_in_direction.rs",
        "@hash/move-in-direction/move_in_direction.rs",
    ),
    (
        "orient_toward_value",
        "orient_toward_value.rs",
        "@hash/orient-toward-value/orient_toward_value.rs",
    ),
    ("physics", "physics.rs", "@hash/physics/physics.rs"),
    (
        "random_away_movement",
        "random_away_movement.rs",
        "@hash/random-away-movement/random_away_movement.rs",
    ),
    (
        "random_movement",
        "random_movement.rs",
        "@hash/random-movement/random_movement.rs",
    ),
    (
        "remove_self",
        "remove_self.rs",
        "@hash/remove-self/remove_self.rs",
    ),
    ("reproduce", "reproduce.rs", "@hash/reproduce/reproduce.rs"),
    (
        "viral_spread",
        "viral_spread.rs",
        "@hash/viral-spread/viral_spread.rs",
    ),
    ("collision", "collision.rs", "@hash/physics/collision.rs"),
    ("forces", "forces.rs", "@hash/physics/forces.rs"),
    ("gravity", "gravity.rs", "@hash/physics/gravity.rs"),
    ("spring", "spring.rs", "@hash/physics/spring.rs"),
];

#[derive(Debug, Clone, Default)]
pub struct NativeColumn<T> {
    index: usize,
    data: Vec<T>,
    set: bool,
}

#[derive(Debug, Clone, Default)]
pub struct NativeState {
    // Engine:
    __i_behavior: Option<NativeColumn<usize>>,
    __behaviors: Option<NativeColumn<BehaviorId>>,
    behaviors: Option<NativeColumn<Vec<String>>>,
    position: Option<NativeColumn<Vec3>>,
    direction: Option<NativeColumn<Vec3>>,
    // Behaviors:
    age: Option<NativeColumn<Option<f64>>>,
    agents: Option<NativeColumn<Option<serde_json::Value>>>,
    alive: Option<NativeColumn<bool>>,
    counter: Option<NativeColumn<Option<f64>>>,
    counter_increment: Option<NativeColumn<Option<f64>>>,
    counter_reset_at: Option<NativeColumn<Option<f64>>>,
    counter_reset_to: Option<NativeColumn<Option<f64>>>,
    decay_chance: Option<NativeColumn<Option<f64>>>,
    decay_effect: Option<NativeColumn<Option<serde_json::Value>>>,
    decayed: Option<NativeColumn<bool>>,
    diffusion_coef: Option<NativeColumn<Option<f64>>>,
    diffusion_targets: Option<NativeColumn<Option<serde_json::Value>>>,
    grid_templates: Option<NativeColumn<Option<serde_json::Value>>>,
    scatter_templates: Option<NativeColumn<Option<serde_json::Value>>>,
    stack_templates: Option<NativeColumn<Option<serde_json::Value>>>,
    orient_toward_value: Option<NativeColumn<Option<String>>>,
    orient_toward_value_uphill: Option<NativeColumn<Option<bool>>>,
    orient_toward_value_cumulative: Option<NativeColumn<Option<bool>>>,
    mass: Option<NativeColumn<f64>>,
    velocity: Option<NativeColumn<Vec3>>,
    force: Option<NativeColumn<Vec3>>,
    random_movement_step_size: Option<NativeColumn<Option<f64>>>,
    random_movement_seek_min_neighbors: Option<NativeColumn<Option<f64>>>,
    random_movement_seek_max_neighbors: Option<NativeColumn<Option<f64>>>,
    reproduction_rate: Option<NativeColumn<Option<f64>>>,
    reproduction_child_values: Option<NativeColumn<Option<serde_json::Value>>>,
    infection_chance: Option<NativeColumn<Option<f64>>>,
    recovery_chance: Option<NativeColumn<Option<f64>>>,
    immunity_exists: Option<NativeColumn<Option<bool>>>,
    immune: Option<NativeColumn<Option<bool>>>,
    infected: Option<NativeColumn<Option<bool>>>,
}

macro_rules! match_native_column {
    ($column:expr, $index:ident, $state:ident, $batch:ident, $($name:ident),*) => {
        match $column.as_ref() {
            $(
                stringify!($name) => {
                    $state.$name = Some($name($index, $batch)?)
                }
            ),*
            _ => return Err(Error::InvalidRustColumn($column.to_string()))
        }
    };
}

impl NativeState {
    pub fn from_column_set(
        columns: &HashSet<String>,
        schema: &Arc<arrow2::datatypes::Schema>,
        agent_batch: &AgentBatch,
    ) -> Result<NativeState> {
        let mut state = NativeState::default();
        for column in columns {
            let index = schema
                .index_of(column)
                .map_err(|_| Error::InvalidRustColumn(column.to_string()))?;

            match_native_column!(
                column,
                index,
                state,
                agent_batch,
                // All column names:
                age,
                agents,
                alive,
                counter,
                counter_increment,
                counter_reset_at,
                counter_reset_to,
                decay_chance,
                decay_effect,
                decayed,
                diffusion_coef,
                diffusion_targets,
                grid_templates,
                scatter_templates,
                stack_templates,
                orient_toward_value,
                orient_toward_value_uphill,
                orient_toward_value_cumulative,
                mass,
                velocity,
                force,
                random_movement_step_size,
                random_movement_seek_min_neighbors,
                random_movement_seek_max_neighbors,
                reproduction_rate,
                reproduction_child_values,
                infection_chance,
                recovery_chance,
                immunity_exists,
                immune,
                infected
            )
        }
        Ok(state)
    }
}

pub fn is_built_in(name: &str) -> bool {
    for (short_name, file_name, full_name) in BEHAVIOR_NAMES.iter() {
        if name == *short_name
            || name == *full_name
            || name == *file_name
            || name == format!("@hash/{}", file_name)
        {
            return true;
        }
    }
    return false;
}

pub fn get_full_name(name: &str) -> Result<&str> {
    for (short_name, file_name, full_name) in BEHAVIOR_NAMES.iter() {
        if name == *short_name
            || name == *full_name
            || name == *file_name
            || name == format!("@hash/{}", file_name)
        {
            return Ok(full_name);
        }
    }
    Err(Error::InvalidRustBuiltIn(name.to_string()))
}

pub fn get_built_in(
    name: &str,
) -> Result<Box<dyn Fn(&mut AgentState, &AgentContext) -> Result<()> + Send + Sync + 'static>> {
    for (short_name, file_name, full_name) in BEHAVIOR_NAMES.iter() {
        if name == *short_name
            || name == *full_name
            || name == *file_name
            || name == format!("@hash/{}", file_name)
        {
            match *file_name {
                "age.rs" => return Ok(Box::new(age::behavior)),
                "conway.rs" => return Ok(Box::new(conway::behavior)),
                "counter.rs" => return Ok(Box::new(counter::behavior)),
                "create_agents.rs" => return Ok(Box::new(create_agents::behavior)),
                "create_grid.rs" => return Ok(Box::new(create_grids::behavior)),
                "create_scatter.rs" => return Ok(Box::new(create_scatters::behavior)),
                "create_stacks.rs" => return Ok(Box::new(create_stacks::behavior)),
                "decay.rs" => return Ok(Box::new(decay::behavior)),
                // "diffusion.rs" => return Ok(Box::new(diffusion::behavior)),
                "move_in_direction.rs" => return Ok(Box::new(move_in_direction::behavior)),
                // "orient_toward_value.rs" => return Ok(Box::new(orient_toward_value::behavior)),
                "physics.rs" => return Ok(Box::new(physics::behavior)),
                "random_away_movement.rs" => return Ok(Box::new(random_away_movement::behavior)),
                "random_movement.rs" => return Ok(Box::new(random_movement::behavior)),
                "remove_self.rs" => return Ok(Box::new(remove_self::behavior)),
                "reproduce.rs" => return Ok(Box::new(reproduce::behavior)),
                // "viral_spread.rs" => return Ok(Box::new(viral_spread::behavior)),
                // "collision.rs" => return Ok(Box::new(collision::behavior)),
                // "forces.rs" => return Ok(Box::new(forces::behavior)),
                // "gravity.rs" => return Ok(Box::new(gravity::behavior)),
                // TODO: "spring.rs" => return Ok(Box::new(spring::behavior)),
                _ => return Err(Error::InvalidRustBuiltIn(name.to_string())),
            }
        }
    }
    return Err(Error::InvalidRustBuiltIn(name.to_string()));
}

pub fn get_built_in_columns(name: &str) -> Result<HashMap<String, Box<dyn Column>>> {
    let mut map = HashMap::new();

    map.insert(
        "behaviors".to_string(),
        Box::new(BehaviorsColumn {}) as Box<dyn Column>,
    );
    map.insert(
        "position".to_string(),
        Box::new(PositionColumn {}) as Box<dyn Column>,
    );
    map.insert(
        "direction".to_string(),
        Box::new(DirectionColumn {}) as Box<dyn Column>,
    );

    for (short_name, file_name, full_name) in BEHAVIOR_NAMES.iter() {
        if name == *short_name
            || name == *full_name
            || name == *file_name
            || name == format!("@hash/{}", file_name)
        {
            match *file_name {
                "age.rs" => {
                    map.insert("age".to_string(), Box::new(AgeColumn {}) as Box<dyn Column>);
                }
                "conway.rs" => {
                    map.insert(
                        "alive".to_string(),
                        Box::new(AliveColumn {}) as Box<dyn Column>,
                    );
                }
                "counter.rs" => {
                    map.insert(
                        "counter".to_string(),
                        Box::new(CounterColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "counter_increment".to_string(),
                        Box::new(CounterIncrementColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "counter_reset_at".to_string(),
                        Box::new(CounterResetAtColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "counter_reset_to".to_string(),
                        Box::new(CounterResetToColumn {}) as Box<dyn Column>,
                    );
                }
                "create_agents.rs" => {
                    map.insert(
                        "agents".to_string(),
                        Box::new(AgentsColumn {}) as Box<dyn Column>,
                    );
                }
                "create_grid.rs" => {
                    map.insert(
                        "agents".to_string(),
                        Box::new(AgentsColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "grid_templates".to_string(),
                        Box::new(GridTemplatesColumn {}) as Box<dyn Column>,
                    );
                }
                "create_scatter.rs" => {
                    map.insert(
                        "agents".to_string(),
                        Box::new(AgentsColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "scatter_templates".to_string(),
                        Box::new(ScatterTemplatesColumn {}) as Box<dyn Column>,
                    );
                }
                "create_stack.rs" => {
                    map.insert(
                        "agents".to_string(),
                        Box::new(AgentsColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "stack_templates".to_string(),
                        Box::new(StackTemplatesColumn {}) as Box<dyn Column>,
                    );
                }
                "decay.rs" => {
                    map.insert(
                        "decay_chance".to_string(),
                        Box::new(DecayChanceColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "decay_effect".to_string(),
                        Box::new(DecayEffectColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "decayed".to_string(),
                        Box::new(DecayedColumn {}) as Box<dyn Column>,
                    );
                }
                "diffusion.rs" => {
                    map.insert(
                        "diffusion_coef".to_string(),
                        Box::new(DiffusionCoefColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "diffusion_targets".to_string(),
                        Box::new(DiffusionTargetsColumn {}) as Box<dyn Column>,
                    );
                }
                "orient_toward_value.rs" => {
                    map.insert(
                        "orient_toward_value".to_string(),
                        Box::new(OrientTowardValueColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "orient_toward_value_uphill".to_string(),
                        Box::new(OrientTowardValueUphillColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "orient_toward_value_cumulative".to_string(),
                        Box::new(OrientTowardValueCumulativeColumn {}) as Box<dyn Column>,
                    );
                }
                "physics.rs" => {
                    map.insert(
                        "force".to_string(),
                        Box::new(ForceColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "mass".to_string(),
                        Box::new(MassColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "velocity".to_string(),
                        Box::new(VelocityColumn {}) as Box<dyn Column>,
                    );
                }
                "random_away_movement.rs" => {}
                "random_movement.rs" => {
                    map.insert(
                        "random_movement_step_size".to_string(),
                        Box::new(RandomMovementStepSizeColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "random_movement_seek_min_neighbors".to_string(),
                        Box::new(RandomMovementSeekMinNeighborsColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "random_movement_seek_max_neighbors".to_string(),
                        Box::new(RandomMovementSeekMaxNeighborsColumn {}) as Box<dyn Column>,
                    );
                }
                "reproduce.rs" => {
                    map.insert(
                        "reproduction_rate".to_string(),
                        Box::new(ReproductionRateColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "reproduction_child_values".to_string(),
                        Box::new(ReproductionChildValuesColumn {}) as Box<dyn Column>,
                    );
                }
                "viral_spread.rs" => {
                    map.insert(
                        "infection_chance".to_string(),
                        Box::new(InfectionChanceColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "recovery_chance".to_string(),
                        Box::new(RecoveryChanceColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "immunity_exists".to_string(),
                        Box::new(ImmunityExistsColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "immune".to_string(),
                        Box::new(ImmuneColumn {}) as Box<dyn Column>,
                    );
                    map.insert(
                        "infected".to_string(),
                        Box::new(InfectedColumn {}) as Box<dyn Column>,
                    );
                }
                "move_in_direction.rs" | "remove_self.rs" => {}
                _ => return Err(Error::InvalidRustBuiltIn(name.to_string())),
            }
            return Ok(map);
        }
    }
    return Err(Error::InvalidRustBuiltIn(name.to_string()));
}

pub fn get_named_behavior(name: &str) -> Result<SharedBehavior> {
    for (short_name, file_name, full_name) in BEHAVIOR_NAMES.iter() {
        if name == *short_name
            || name == *full_name
            || name == *file_name
            || name == format!("@hash/{}", file_name)
        {
            match *file_name {
                "age.rs" => return Ok(age::get_named_behavior()),
                "conway.rs" => return Ok(conway::get_named_behavior()),
                "counter.rs" => return Ok(counter::get_named_behavior()),
                "create_agents.rs" => return Ok(create_agents::get_named_behavior()),
                "create_grids.rs" => return Ok(create_grids::get_named_behavior()),
                "create_scatters.rs" => return Ok(create_scatters::get_named_behavior()),
                "create_stacks.rs" => return Ok(create_stacks::get_named_behavior()),
                "decay.rs" => return Ok(decay::get_named_behavior()),
                // "diffusion.rs" => return Ok(diffusion::get_named_behavior()),
                "move_in_direction.rs" => return Ok(move_in_direction::get_named_behavior()),
                //"orient_toward_value.rs" => return Ok(orient_toward_value::get_named_behavior()),
                "random_away_movement.rs" => return Ok(random_away_movement::get_named_behavior()),
                "random_movement.rs" => return Ok(random_movement::get_named_behavior()),
                "remove_self.rs" => return Ok(remove_self::get_named_behavior()),
                "reproduce.rs" => return Ok(reproduce::get_named_behavior()),
                // "viral_spread.rs" => return Ok(viral_spread::get_named_behavior()),
                _ => return Err(Error::InvalidRustBuiltIn(name.to_string())),
            };
        }
    }
    return Err(Error::InvalidRustBuiltIn(name.to_string()));
}
