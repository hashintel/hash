use serde::{Deserialize, Serialize};

use crate::{
    AddArc, AddPlace, AddTransition, ArcTarget, CommitNodePositions, RemovePlace, RemoveTransition,
    UpdateArcPlace, UpdateArcType, UpdateArcWeight, UpdatePlace, UpdateTransition,
    definitions::{CreateEntity, EntityTarget, UpdateEntity},
    model::{
        ColorData, ComponentData, EquationData, MetricData, ParameterData, ScenarioData, SubnetData,
    },
    selection::DeleteItems,
    type_elements::EditTypeElements,
};

/// Atomic document edits. Entity IDs use the normalized document's identifiers.
#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(
    tag = "type",
    content = "input",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum Command {
    AddSubnet(CreateEntity<SubnetData>),
    UpdateSubnet(UpdateEntity),
    RemoveSubnet(EntityTarget),
    AddComponentInstance(CreateEntity<ComponentData>),
    UpdateComponentInstance(UpdateEntity),
    RemoveComponentInstance(EntityTarget),
    DeleteItemsByIds(DeleteItems),
    AddType(CreateEntity<ColorData>),
    UpdateType(UpdateEntity),
    RemoveType(EntityTarget),
    AddDifferentialEquation(CreateEntity<EquationData>),
    UpdateDifferentialEquation(UpdateEntity),
    RemoveDifferentialEquation(EntityTarget),
    AddParameter(CreateEntity<ParameterData>),
    UpdateParameter(UpdateEntity),
    RemoveParameter(EntityTarget),
    AddScenario(CreateEntity<ScenarioData>),
    UpdateScenario(UpdateEntity),
    RemoveScenario(EntityTarget),
    AddMetric(CreateEntity<MetricData>),
    UpdateMetric(UpdateEntity),
    RemoveMetric(EntityTarget),
    EditTypeElements(EditTypeElements),
    CommitNodePositions(CommitNodePositions),
    AddPlace(AddPlace),
    UpdatePlace(UpdatePlace),
    RemovePlace(RemovePlace),
    AddTransition(AddTransition),
    UpdateTransition(UpdateTransition),
    RemoveTransition(RemoveTransition),
    AddArc(AddArc),
    RemoveArc(ArcTarget),
    UpdateArcWeight(UpdateArcWeight),
    UpdateArcType(UpdateArcType),
    UpdateArcPlace(UpdateArcPlace),
}

impl Command {
    pub(crate) fn normalized(&self) -> Result<Self, String> {
        if let Self::DeleteItemsByIds(input) = self {
            return Ok(Self::DeleteItemsByIds(input.normalized()?));
        }
        let mut value = serde_json::to_value(self).map_err(|error| error.to_string())?;
        crate::model::validation::normalize_ids(&mut value)?;
        serde_json::from_value(value).map_err(|error| error.to_string())
    }

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "Only arc weights and node coordinates carry native floating point fields"
    )]
    pub(crate) fn validate_numbers(&self) -> Result<(), String> {
        let weight = match self {
            Self::AddArc(input) => Some(input.weight),
            Self::UpdateArcWeight(input) => Some(input.weight),
            _ => None,
        };
        if weight.is_some_and(|weight| !weight.is_finite() || weight <= 0.0) {
            return Err("Arc weight must be a positive finite number".to_owned());
        }
        if let Self::CommitNodePositions(input) = self {
            for commit in &input.commits {
                if !commit.position.x.is_finite() || !commit.position.y.is_finite() {
                    return Err("Node positions must be finite numbers".to_owned());
                }
            }
        }
        Ok(())
    }
}
