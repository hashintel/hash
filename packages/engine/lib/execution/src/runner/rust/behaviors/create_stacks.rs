use serde_json::json;

use super::{Context, Result, SharedBehavior, State};

pub fn behavior(state: &mut State, context: &Context) -> Result<()> {
    let globals = &context.globals();
    let topology = globals
        .get("topology")
        .ok_or_else(|| "Topology is missing yet it was required")?;

    let x_bounds = topology
        .get("x_bounds")
        .ok_or_else(|| "Topology x_bounds is missing yet it was required")?;

    let y_bounds = topology
        .get("y_bounds")
        .ok_or_else(|| "Topology y_bounds is missing yet it was required")?;

    let width = x_bounds[1].as_f64().ok_or("x_bounds[1] is not a number")?
        - x_bounds[0].as_f64().ok_or("x_bounds[0] is not a number")?;
    let height = y_bounds[1].as_f64().ok_or("y_bounds[1] is not a number")?
        - y_bounds[0].as_f64().ok_or("y_bounds[0] is not a number")?;

    let x =
        json!((width / 2.0).floor() + x_bounds[0].as_f64().ok_or("x_bounds[0] is not a number")?);
    let y =
        json!((height / 2.0).floor() + y_bounds[0].as_f64().ok_or("y_bounds[0] is not a number")?);
    let position = vec![x, y];

    for i in 0..state.num_agents() {
        if let Some(stack_templates) = &state.stack_templates()?[i] {
            let mut agents = json!({});
            if let Some(state_agents) = &state.agents()?[i] {
                if let Some(agent_object) = state_agents.as_object() {
                    agents = json!(agent_object);
                }
            }
            if let Some(template_array) = stack_templates.as_array() {
                for stack_template in template_array {
                    let template_position = stack_template["template_position"].as_str().map_or(
                        stack_template["template_position"].to_string(),
                        std::string::ToString::to_string,
                    );
                    let position: Vec<serde_json::Value> = if template_position == "center" {
                        position.clone()
                    } else {
                        let template_position = stack_template["template_position"]
                            .as_array()
                            .ok_or("template_position is not an array")?;
                        template_position.clone()
                    };

                    let template_name = stack_template["template_name"]
                        .as_str()
                        .ok_or("template_name is not a string")?;
                    agents[template_name] = json!([]);

                    for _ in 0..stack_template["template_count"]
                        .as_f64()
                        .ok_or("template_count is not a number")?
                        as i64
                    {
                        let mut template = stack_template.clone();
                        template["position"] = json!(position);
                        if let Some(template_object) = template.as_object_mut() {
                            template_object.remove("template_name");
                            template_object.remove("template_count");
                            template_object.remove("template_position");
                        }
                        if let Some(agent_array) = agents[template_name].as_array_mut() {
                            agent_array.push(template);
                        }
                    }
                }
            }
            state.agents_mut()?[i] = Some(agents);
        }
    }

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/create_stacks/create_stacks.rs".into(),
        name: "@hash/create_stacks/create_stacks.rs".into(),
        shortnames: vec!["@hash/create_stacks/create_stacks.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("create_stacks.rs.json").to_string()),
    }
}

// Original Source
/*

use crate::prelude::{AgentState, Context, SimulationResult};

/// # Errors
/// This function will fail if
/// 1. `topology` is not available in `globals`
/// 2. `x_bounds` or `y_bounds` is missing from `topology` or they do not start with numbers
/// 3. `template_name` is not a string
/// 4. `template_count` is not a number
pub fn create_stacks(state: &mut AgentState, context: &Context) -> SimulationResult<()> {
    if let Some(stack_templates) = state.get_custom::<serde_json::Value>("stack_templates") {
        let mut agents = json!({});
        if let Some(state_agents) = state.get_custom::<serde_json::Value>("agents") {
            if let Some(agent_object) = state_agents.as_object() {
                agents = json!(agent_object);
            }
        }
        if let Some(template_array) = stack_templates.as_array() {
            for stack_template in template_array {
                let template_position = stack_template["template_position"].as_str().map_or(
                    stack_template["template_position"].to_string(),
                    std::string::ToString::to_string,
                );
                let position: Vec<serde_json::Value> = if template_position == "center" {
                    let globals = context.globals;
                    let topology = globals
                        .get("topology")
                        .ok_or_else(|| "Topology is missing yet it was required")?;

                    let x_bounds = topology
                        .get("x_bounds")
                        .ok_or_else(|| "Topology x_bounds is missing yet it was required")?;

                    let y_bounds = topology
                        .get("y_bounds")
                        .ok_or_else(|| "Topology y_bounds is missing yet it was required")?;

                    let width = x_bounds[1].as_f64().ok_or("x_bounds[1] is not a number")?
                        - x_bounds[0].as_f64().ok_or("x_bounds[0] is not a number")?;
                    let height = y_bounds[1].as_f64().ok_or("y_bounds[1] is not a number")?
                        - y_bounds[0].as_f64().ok_or("y_bounds[0] is not a number")?;

                    let x = json!(
                        (width / 2.0).floor()
                            + x_bounds[0].as_f64().ok_or("x_bounds[0] is not a number")?
                    );
                    let y = json!(
                        (height / 2.0).floor()
                            + y_bounds[0].as_f64().ok_or("y_bounds[0] is not a number")?
                    );
                    vec![x, y]
                } else {
                    let template_position = stack_template["template_position"]
                        .as_array()
                        .ok_or("template_position is not an array")?;
                    template_position.clone()
                };

                let template_name = stack_template["template_name"]
                    .as_str()
                    .ok_or("template_name is not a string")?;
                agents[template_name] = json!([]);

                for _ in 0..stack_template["template_count"]
                    .as_f64()
                    .ok_or("template_count is not a number")? as i64
                {
                    let mut template = stack_template.clone();
                    template["position"] = json!(position);
                    if let Some(template_object) = template.as_object_mut() {
                        template_object.remove("template_name");
                        template_object.remove("template_count");
                        template_object.remove("template_position");
                    }
                    if let Some(agent_array) = agents[template_name].as_array_mut() {
                        agent_array.push(template);
                    }
                }
            }
        }
        state.set("agents", json!(agents))?;
    }

    Ok(())
}
*/
