use super::{Context, Result, SharedBehavior, State};
use crate::hash_types::{Agent, Vec3};

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/physics/collision.rs".into(),
        name: "@hash/physics/collision.rs".into(),
        shortnames: vec!["@hash/physics/collision.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("collision.rs.json").to_string()),
    }
}

/// Causes the agent to collide with other agents.
pub fn behavior(state: &mut State, context: &Context) -> Result<()> {
    let min_dist: f64 = 1.0;
    let pos = state.position()?[0].ok_or("Agent must have position")?;
    let vel = state.velocity()?[0];
    let mass = state.mass()?[0];

    // TODO: access globals to determine what the % elasticity of the collision should be
    let epsilon: f64 = 1.0;

    let mut dv = Vec3(0.0, 0.0, 0.0);
    let neighbors = context.neighbors(0)?;
    let neighbors_pos = neighbors
        .iter()
        .filter(|&n| n.position().is_some())
        .filter(|&n| (n.position().unwrap() - pos).magnitude() <= min_dist);

    for neighbor in neighbors_pos {
        let dir = neighbor.position().unwrap() - pos;

        let n_vel: Vec3 = neighbor.get_custom_or("velocity", Vec3(0.0, 0.0, 0.0))?;

        // Check if agent is actually moving towards neighbor or vice versa
        // Dot product of velocity and direction to neighbor is positive
        if (vel.dot(dir) <= 0.0) && (n_vel.dot(dir) >= 0.0) {
            continue;
        }

        let n_mass: f64 = neighbor.get_custom_or("mass", f64::INFINITY)?;

        // Calculate normalized direction of reflection
        let norm = dir.norm();

        // Calculate impulse
        let numer = (epsilon + 1.0) * norm.dot(vel - n_vel);
        let denom = (1.0 / n_mass) + (1.0 / mass);
        let j = numer / denom;

        dv += norm * j / mass;
    }

    state.velocity_set(vec![vel - dv])?;
    Ok(())
}
