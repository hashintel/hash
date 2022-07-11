use super::{error::SimulationError, Context, Result, SharedBehavior, State};

pub fn behavior(state: &mut State<'_>, context: &Context<'_>) -> Result<()> {
    let mut position = state.take_position()?;

    let dt = context
        .globals
        .get("dt")
        .ok_or("Need a dt specified")?
        .as_f64()
        .ok_or("dt needs to be a number")?;

    for i in 0..state.num_agents() {
        let m = state.mass()?[i];
        let mut v = state.velocity()?[i].clone();
        let f = state.force()?[i].clone();

        if let Some(p) = &mut position[i] {
            // Newton's law, F = MA
            // v = a t
            // x = 1/2 a t^2
            v += f * dt / m;

            // Move the agent as well
            *p += v * dt;
            state.velocity_mut()?[i] = v;
        } else {
            Err(SimulationError::from("Expected position to exist on agent"))?;
        }
    }

    state.set_position(position);

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/physics/physics.rs".into(),
        name: "@hash/physics/physics.rs".into(),
        shortnames: vec!["@hash/physics/physics.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("physics.rs.json").to_string()),
    }
}

// Original Source
/*
//! Moves an agent's position based on the applied force
use crate::prelude::{AgentState, Context, SimulationResult, Vec3};

// Simple Euler's method for now, can add more complex functionality later
/// # Errors
/// This function may fail when
/// 1. `globals` does not have `dt` specified
/// 2. `dt` is not a number
/// 3. `velocity` not specified (or is an invalid `Vec3`) within the agent state
/// 4. `force` not specified (or is an invalid `Vec3`) within the agent state
pub fn vintegrate(state: &mut AgentState, context: &Context) -> SimulationResult<()> {
    let m = state["mass"].as_f64().ok_or("Please specify a mass")?;

    let dt = context
        .globals
        .get("dt")
        .ok_or("Need a dt specified")?
        .as_f64()
        .ok_or("dt needs to be a number")?;

    let mut v: Vec3 = state
        .get_custom("velocity")
        .ok_or("Velocity not specified, or not a proper Vec3")?;
    let f: Vec3 = state
        .get_custom("force")
        .ok_or("Velocity not specified, or not a proper Vec3")?;

    let p = state.get_pos_mut()?;

    // Newton's law, F = MA
    // v = a t
    // x = 1/2 a t^2
    v += f * dt / m;

    // Move the agent as well
    *p += v * dt;

    state.set("velocity", v)?;

    Ok(())
}
*/
