use super::{Context, Result, SharedBehavior, State};
use crate::hash_types::{Agent, Vec3};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct SpringDefinition {
    agent_id: String,
    length: f64,
    k: f64, // Hooke's constant
    damping: Option<f64>,
}

/// Applies a spring force to the agent based on the parameters specified in `springs`
pub fn spring(state: &mut Agent, i: usize, context: &Context) -> Result<()> {
    // Retrieve spring parameters
    let springs = state
        .get_custom::<serde_json::Value>("springs")
        .map_or_else(
            || Ok(vec![]),
            serde_json::from_value::<Vec<SpringDefinition>>,
        )
        .map_err(|_| "agent field 'springs' must be an array of spring definitions")?;

    let pos = state.get_pos()?;

    let mut s_force = Vec3(0.0, 0.0, 0.0);

    for s in springs {
        let neighbors = context.neighbors(i)?;

        let mut other = None;
        for n in neighbors.iter() {
            let agent_id = n.get_custom_or("agent_id", "".to_owned())?;
            if agent_id == state.agent_id {
                other = Some(n);
                break;
            }
        }
        let other = match other {
            None => continue,
            Some(v) => v,
        };

        let other_pos = other
            .position()
            .ok_or("agent field 'position' is required")?;
        let dx = other_pos - *pos;
        let norm = dx.norm();

        let x = dx.magnitude() - s.length;
        s_force += norm * x * s.k;

        if let Some(beta) = s.damping {
            let v = state.velocity.unwrap_or(Vec3(0.0, 0.0, 0.0));
            // calculate damping force
            let norm_v = norm * v.dot(norm);
            s_force -= norm_v * beta;
        }
    }

    let force = state.get_custom("force").unwrap_or(Vec3(0.0, 0.0, 0.0));
    state.set("force", force + s_force)?;

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/physics/spring.rs".into(),
        name: "@hash/physics/spring.rs".into(),
        shortnames: vec!["@hash/physics/spring.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("spring.rs.json").to_string()),
    }
}

pub fn behavior(state: &mut State, context: &Context) -> Result<()> {
    let mut json_state = state.get_json_state()?;
    for (i, agent) in json_state.iter_mut().enumerate() {
        spring(agent, i, context)?;
    }
    state.set_json_state(json_state)?;
    Ok(())
}
