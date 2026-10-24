use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{
    Extensions, Transition,
    document::{items_mut, net, net_mut},
    entity::{TRANSITION_UPDATE_FIELDS, apply_update, validate_update},
    extensions::items,
    kernel::sanitize_transition,
};

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddTransition {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub transition: Transition,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateTransition {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub transition_id: String,
    #[tsify(type = "Record<string, JsonValue>")]
    pub update: Map<String, Value>,
    #[serde(default)]
    pub unset: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoveTransition {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub transition_id: String,
}

impl AddTransition {
    pub(crate) fn apply(&self, document: &mut Value, extensions: Extensions) -> Result<(), String> {
        let target = net(document, self.target_subnet_id.as_deref())?;
        let mut transition = self.transition.as_value().clone();
        sanitize_transition(document, target, &mut transition, extensions, true);
        items_mut(
            net_mut(document, self.target_subnet_id.as_deref())?,
            "transitions",
        )?
        .push(transition);
        Ok(())
    }
}

impl UpdateTransition {
    pub(crate) fn apply(&self, document: &mut Value, extensions: Extensions) -> Result<(), String> {
        validate_update(&self.update, TRANSITION_UPDATE_FIELDS)?;
        let target = net(document, self.target_subnet_id.as_deref())?;
        let Some((index, transition)) = items(target, "transitions")
            .iter()
            .enumerate()
            .find(|(_, transition)| transition["id"] == self.transition_id)
        else {
            return Ok(());
        };
        let mut transition = transition.clone();
        apply_update(
            &mut transition,
            &self.update,
            &self.unset,
            TRANSITION_UPDATE_FIELDS,
        )?;
        sanitize_transition(document, target, &mut transition, extensions, false);
        let transition = Transition::try_from(transition)?.into_value();
        *items_mut(
            net_mut(document, self.target_subnet_id.as_deref())?,
            "transitions",
        )?
        .get_mut(index)
        .ok_or("Transition index is invalid")? = transition;
        Ok(())
    }
}

impl RemoveTransition {
    pub(crate) fn apply(&self, document: &mut Value) -> Result<(), String> {
        let transitions = items_mut(
            net_mut(document, self.target_subnet_id.as_deref())?,
            "transitions",
        )?;
        if let Some(index) = transitions
            .iter()
            .position(|transition| transition["id"] == self.transition_id)
        {
            transitions.remove(index);
        }
        Ok(())
    }
}
