use super::{accessors::field_or_property, Context, Result, SharedBehavior, State};
use rand::Rng;

pub fn behavior(state: &mut State<'_>, context: &Context<'_>) -> Result<()> {
    let globals = context.globals();
    let infection_chance_property = globals.get("infection_chance").cloned();
    let recovery_chance_property = globals.get("recovery_chance").cloned();
    let immunity_exists_property = globals.get("immunity_exists").cloned();
    let immune_property = globals.get("immune").cloned();
    let infected_property = globals.get("infected").cloned();

    let infection_chance = field_or_property(
        &state.infection_chance()?[0],
        &infection_chance_property,
        0.0,
    )?;
    let recovery_chance =
        field_or_property(&state.recovery_chance()?[0], &recovery_chance_property, 0.0)?;
    let immunity_exists = field_or_property(
        &state.immunity_exists()?[0],
        &immunity_exists_property,
        true,
    )?;
    let immune = field_or_property(&state.immune()?[0], &immune_property, false)?;
    let infected = field_or_property(&state.infected()?[0], &infected_property, false)?;

    if infected {
        if recovery_chance > rand::thread_rng().gen_range(0.0..1.0) {
            state.infected_mut()?[0] = Some(false);
            if immunity_exists {
                state.immune_mut()?[0] = Some(true);
            }
        }
    } else if !immune {
        // for each neighbor, rand number vs infection chance
        let mut num_infected_neighbors = 0;
        for neighbor in context.neighbors()? {
            if neighbor.infected()?.unwrap_or_else(|| false) {
                num_infected_neighbors += 1;
            }
        }

        for _ in 0..num_infected_neighbors {
            if infection_chance > rand::thread_rng().gen_range(0.0..1.0) {
                state.infected_mut()?[0] = Some(true);
                break;
            }
        }
    }
    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/viral_spread/viral_spread.rs".into(),
        name: "@hash/viral_spread/viral_spread.rs".into(),
        shortnames: vec!["@hash/viral_spread/viral_spread.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("viral_spread.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::{
    behaviors::get_state_or_property,
    prelude::{AgentState, Context, SimulationResult},
};
use rand::Rng;

/// # Errors
/// This function cannot fail
pub fn viral_spread(state: &mut AgentState, context: &Context) -> SimulationResult<()> {
    let infection_chance: f32 = get_state_or_property(&state, &context, "infection_chance", 0.0);
    let recovery_chance: f32 = get_state_or_property(&state, &context, "recovery_chance", 0.0);
    let immunity_exists: bool = get_state_or_property(&state, &context, "immunity_exists", true);
    let immune: bool = get_state_or_property(&state, &context, "immune", false);
    let infected: bool = get_state_or_property(&state, &context, "infected", false);

    if infected {
        if recovery_chance > rand::thread_rng().gen_range(0.0, 1.0) {
            state["infected"] = json!(false);
            if immunity_exists {
                state["immune"] = json!(true);
            }
        }
    } else if !immune {
        // for each neighbor, rand number vs infection chance
        let infected_neighbors = context
            .neighbors
            .iter()
            .filter(|neighbor| neighbor["infected"].as_bool().unwrap_or_else(|| false));

        for _neighbor in infected_neighbors {
            if infection_chance > rand::thread_rng().gen_range(0.0, 1.0) {
                state["infected"] = json!(true);
                break;
            }
        }
    }

    Ok(())
}
*/
