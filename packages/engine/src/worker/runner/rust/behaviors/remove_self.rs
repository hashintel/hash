use super::super::OutboundMessage;
use super::{Context, Result, SharedBehavior, State};

pub fn behavior(state: &mut State<'_>, _context: &Context<'_>) -> Result<()> {
    let mut messages = state.take_messages()?;
    for i in 0..state.num_agents() {
        let m = &mut messages[i];
        m.push(OutboundMessage::remove_agent(
            state.agent_id()?[i].to_hyphenated_ref().to_string(),
        ));
    }

    state.set_messages(messages);

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/remove_self/remove_self.rs".into(),
        name: "@hash/remove_self/remove_self.rs".into(),
        shortnames: vec!["@hash/remove_self/remove_self.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("remove_self.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::prelude::{AgentState, Context, OutboundMessage, SimulationResult};

/// # Errors
/// This function cannot fail
pub fn remove_self(state: &mut AgentState, _context: &Context) -> SimulationResult<()> {
    state
        .messages
        .push(OutboundMessage::remove_agent(state.agent_id.to_string()));
    Ok(())
}
*/
