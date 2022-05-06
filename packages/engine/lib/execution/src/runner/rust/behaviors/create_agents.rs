use super::{
    super::{Agent, OutboundMessage},
    Context, Result, SharedBehavior, State,
};

pub fn behavior(state: &mut State<'_>, _context: &Context<'_>) -> Result<()> {
    for i in 0..state.num_agents() {
        if let Some(agents_object) = &state.agents()?[i] {
            if let Some(agents_to_create) = agents_object.clone().as_object() {
                for (_key, agent_array) in agents_to_create.iter() {
                    if let Some(agents) = agent_array.as_array() {
                        for agent in agents {
                            let message = OutboundMessage::create_agent(Agent::from(agent.clone()));
                            state.messages_mut()?[i].push(message);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/create_agents/create_agents.rs".into(),
        name: "@hash/create_agents/create_agents.rs".into(),
        shortnames: vec!["@hash/create_agents/create_agents.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("create_agents.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::prelude::{AgentState, Context, OutboundMessage, SimulationResult};

/// # Errors
/// This function cannot fail
pub fn create_agents(state: &mut AgentState, _context: &Context) -> SimulationResult<()> {
    if let Some(agents_object) = state.get_custom::<serde_json::Value>("agents") {
        if let Some(agents_to_create) = agents_object.as_object() {
            for (_key, agent_array) in agents_to_create.iter() {
                if let Some(agents) = agent_array.as_array() {
                    for agent in agents {
                        let message = OutboundMessage::from_json_value_with_state(
                            json!({
                                "to": [SYSTEM_MESSAGE],
                                "type": CREATE_AGENT,
                                "data": agent
                            }),
                            &state,
                        )?;

                        state.messages.push(message);
                    }
                }
            }
        }
    }

    Ok(())
}
*/
