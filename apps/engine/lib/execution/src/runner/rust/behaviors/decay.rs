use rand::Rng;
use serde::{Deserialize, Serialize};

use super::{
    super::OutboundMessage, accessors::field_or_property, Context, Result, SharedBehavior, State,
};

#[derive(Serialize, Deserialize, Clone)]
enum DecayEffect {
    ModifyDecayed,
    RemoveBehavior,
    RemoveAgent,
}

pub fn behavior(state: &mut State, context: &Context) -> Result<()> {
    let globals = &context.globals;

    let decay_chance_property = globals.get("decay_chance").cloned();

    let decay_effect_property = globals.get("decay_effect").cloned();

    let decay_effects: Vec<DecayEffect> = state
        .decay_effect()?
        .iter()
        .map(|v| {
            let val: Option<DecayEffect> = v
                .as_ref()
                .map(|decay_effect| {
                    let v: serde_json::Value = decay_effect.clone();
                    serde_json::from_value(v)
                })
                .transpose()?;
            field_or_property(&val, &decay_effect_property, DecayEffect::ModifyDecayed)
        })
        .collect::<Result<_>>()?;

    let mut behaviors = state.remove_behaviors()?;

    for i in 0..state.num_agents() {
        let decay_chance =
            field_or_property(&state.decay_chance()?[i], &decay_chance_property, 0.5)?;
        if rand::thread_rng().gen_range(0.0..1.0) < decay_chance {
            match &decay_effects[i] {
                // Change the decayed property
                DecayEffect::ModifyDecayed => state.decayed_mut()?[i] = true,
                // Change the decayed property and remove the "decay" behavior
                DecayEffect::RemoveBehavior => {
                    state.decayed_mut()?[i] = true;
                    behaviors[i].retain(|behavior| {
                        (&*behavior) != "@hash/decay/decay.rs" || (&*behavior) != "@hash/decay.rs"
                    });
                }
                // Remove the agent
                DecayEffect::RemoveAgent => {
                    let id = state.agent_id()?[i].to_hyphenated_ref().to_string();
                    state.messages()?[i].push(OutboundMessage::remove_agent(id));
                }
            }
        }
    }

    state.set_behaviors(behaviors);

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/decay/decay.rs".into(),
        name: "@hash/decay/decay.rs".into(),
        shortnames: vec!["@hash/decay/decay.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("decay.rs.json").to_string()),
    }
}

// Original Source
/*


use crate::{
    behaviors::get_state_or_property,
    prelude::{AgentState, Context, OutboundMessage, SimulationResult},
};
use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
enum DecayEffect {
    ModifyDecayed,
    RemoveBehavior,
    RemoveAgent,
}

/// # Errors
/// This function cannot fail
pub fn decay(state: &mut AgentState, context: &Context) -> SimulationResult<()> {
    let decay_chance = get_state_or_property(&state, &context, "decay_chance", 0.5);
    let decay_effect =
        get_state_or_property(&state, &context, "decay_effect", DecayEffect::ModifyDecayed);
    if rand::thread_rng().gen_range(0.0, 1.0) < decay_chance {
        match decay_effect {
            // Change the decayed property
            DecayEffect::ModifyDecayed => state["decayed"] = serde_json::Value::Bool(true),
            // Change the decayed property and remove the "decay" behavior
            DecayEffect::RemoveBehavior => {
                state["decayed"] = serde_json::Value::Bool(true);
                state.behaviors.retain(|behavior| (&*behavior) != "decay");
            }
            // Remove the agent
            DecayEffect::RemoveAgent => state
                .messages
                .push(OutboundMessage::remove_agent(state.agent_id.to_string())),
        }
    }

    Ok(())
}
*/
