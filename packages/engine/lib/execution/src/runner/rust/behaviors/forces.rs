use super::{Context, Result, SharedBehavior, State};
use crate::hash_types::{Agent, Vec3};

/// Runs a semi-implicit Euler integration to calculate the change in velocity and
/// position, based on the the current forces acting on the agent.
pub fn behavior(state: &mut State, context: &Context) -> Result<()> {
    let dt: f64 = state
        .get_value("dt")
        .map(|v| v.as_f64().unwrap())
        .unwrap_or(0.01);
    let mass = state.mass()?[0];
    let force = &mut state.force_mut()?[0];
    let v = state.velocity_mut()?;

    let dv = *force * (dt / mass);
    v[0] += dv;

    let dp = v * dt;
    let pos = state.position_mut()?[0].as_mut().ok_or("Agent must have a position")?;
    *pos += dp;

    *force = Vec3(0.0, 0.0, 0.0);
    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/physics/forces.rs".into(),
        name: "@hash/physics/forces.rs".into(),
        shortnames: vec!["@hash/physics/forces.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("forces.rs.json").to_string()),
    }
}
