use super::{Context, Result, SharedBehavior, State};
use crate::hash_types::{Agent, Vec3};

/// Adds gravity to the forces acting on the agent. Won't cause an agent to fall into the ground
pub fn behavior(state: &mut State, context: &Context) -> Result<()> {
    let pos = state.position()?[0].ok_or("Agent must have position")?;
    if pos[2] < 0.0 {
        return Ok(());
    }

    let g: f64 = state
        .get_value("gravity")
        .map(|v| v.as_f64().unwrap())
        .unwrap_or(9.81);
    let g_force = Vec3(0.0, 0.0, -g);

    let force = &mut state.force_mut()?[0];
    *force += g_force;
    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/physics/gravity.rs".into(),
        name: "@hash/physics/gravity.rs".into(),
        shortnames: vec!["@hash/physics/gravity.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("gravity.rs.json").to_string()),
    }
}
