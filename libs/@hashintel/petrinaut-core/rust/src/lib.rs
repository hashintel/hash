//! Document transactions and local history for Petrinaut, usable natively and through WebAssembly.

extern crate alloc;

mod arcs;
mod command;
mod definitions;
mod document;
mod entity;
mod extensions;
mod kernel;
pub mod model;
mod patch;
mod places;
mod selection;
mod subnets;
#[cfg(test)]
mod tests;
mod transitions;
mod type_elements;
mod wasm;

use core::cell::OnceCell;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use crate::{
    arcs::{
        AddArc, ArcDirection, ArcEndpoint, ArcTarget, InputArcType, UpdateArcPlace, UpdateArcType,
        UpdateArcWeight,
    },
    command::Command,
    definitions::{CreateEntity, EntityTarget, UpdateEntity},
    entity::{Place, Transition},
    extensions::Extensions,
    patch::Patch,
    places::{AddPlace, RemovePlace, UpdatePlace},
    selection::{DeleteItems, ItemKind, SelectedItem},
    transitions::{AddTransition, RemoveTransition, UpdateTransition},
    type_elements::{EditTypeElements, TypeElementEdit},
};

#[derive(Debug)]
struct Checkpoint {
    forward: Vec<Patch>,
    inverse: Vec<Patch>,
    timestamp: String,
}

/// A local document instance with native graph edits and bounded history.
#[derive(Debug)]
pub struct PetrinautInstance {
    document: model::Sdcpn,
    snapshot: OnceCell<Value>,
    history: Vec<Checkpoint>,
    cursor: usize,
    history_limit: usize,
    baseline_timestamp: String,
    readonly: bool,
    extensions: Extensions,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PositionCommit {
    pub id: String,
    pub item_type: NodeKind,
    pub position: Position,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Place,
    Transition,
    ComponentInstance,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(deny_unknown_fields)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitNodePositions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub commits: Vec<PositionCommit>,
}

impl PetrinautInstance {
    /// Creates an instance from a normalized, JSON-compatible SDCPN document.
    ///
    /// # Errors
    /// Returns an error when a required document array is absent.
    pub fn new(
        document: Value,
        history_limit: usize,
        timestamp: String,
        readonly: bool,
    ) -> Result<Self, String> {
        Self::new_with_extensions(
            document,
            history_limit,
            timestamp,
            readonly,
            Extensions::default(),
        )
    }

    /// Creates an instance with a fixed extension policy for all transactions.
    ///
    /// # Errors
    /// Returns an error when a required document array is absent.
    pub fn new_with_extensions(
        mut document: Value,
        history_limit: usize,
        timestamp: String,
        readonly: bool,
        extensions: Extensions,
    ) -> Result<Self, String> {
        document = model::Sdcpn::from_input(document)?.to_json();
        extensions.sanitize_document(&mut document);
        let document = model::Sdcpn::from_input(document)?;
        Ok(Self {
            document,
            snapshot: OnceCell::new(),
            history: Vec::new(),
            cursor: 0,
            history_limit,
            baseline_timestamp: timestamp,
            readonly,
            extensions,
        })
    }

    #[must_use]
    pub fn document(&self) -> &Value {
        self.snapshot.get_or_init(|| self.document.to_json())
    }

    #[must_use]
    pub const fn model(&self) -> &model::Sdcpn {
        &self.document
    }

    #[must_use]
    pub const fn current_index(&self) -> usize {
        self.cursor
    }

    #[must_use]
    pub fn timestamps(&self) -> Vec<&str> {
        core::iter::once(self.baseline_timestamp.as_str())
            .chain(self.history.iter().map(|entry| entry.timestamp.as_str()))
            .collect()
    }

    /// Commits a complete draft atomically, returning the patches for subscribers.
    ///
    /// # Errors
    /// Returns an error when a required document array is absent.
    pub fn replace_document(
        &mut self,
        mut next: Value,
        timestamp: String,
    ) -> Result<Vec<Patch>, String> {
        if self.readonly {
            return Ok(Vec::new());
        }
        next = model::Sdcpn::from_normalized(next)?.to_json();
        self.extensions.sanitize_document(&mut next);
        let model = model::Sdcpn::from_normalized(next.clone())?;
        let forward = patch::diff(self.document(), &next);
        if forward.is_empty() {
            return Ok(forward);
        }
        if self.history_limit > 0 {
            let inverse = patch::diff(&next, self.document());
            self.history.truncate(self.cursor);
            self.history.push(Checkpoint {
                forward: forward.clone(),
                inverse,
                timestamp,
            });
            if self.history.len() > self.history_limit {
                let dropped = self.history.remove(0);
                self.baseline_timestamp = dropped.timestamp;
            }
            self.cursor = self.history.len();
        }
        self.document = model;
        self.snapshot = OnceCell::from(next);
        Ok(forward)
    }

    /// Executes a typed edit and records one atomic history entry.
    ///
    /// # Errors
    /// Returns an error when the command cannot be applied to this document.
    #[expect(
        clippy::too_many_lines,
        reason = "The exhaustive dispatcher keeps each public command mapped to its implementation"
    )]
    pub fn execute(&mut self, command: &Command, timestamp: String) -> Result<Vec<Patch>, String> {
        if self.readonly {
            return Ok(Vec::new());
        }
        command.validate_numbers()?;
        let command = command.normalized()?;
        let command = &command;
        if let Command::CommitNodePositions(input) = command {
            return self.commit_node_positions(input, timestamp);
        }
        let mut next = self.document().clone();
        match command {
            Command::AddSubnet(input) => {
                definitions::create(&mut next, "subnets", input, self.extensions)?;
            }
            Command::UpdateSubnet(input) => {
                definitions::update(&mut next, "subnets", input, self.extensions)?;
            }
            Command::RemoveSubnet(input) => {
                subnets::remove_subnet(&mut next, input);
            }
            Command::AddComponentInstance(input) => {
                subnets::create_component(&mut next, input, self.extensions)?;
            }
            Command::UpdateComponentInstance(input) => {
                subnets::update_component(&mut next, input, self.extensions)?;
            }
            Command::RemoveComponentInstance(input) => {
                subnets::remove_component(&mut next, input)?;
            }
            Command::DeleteItemsByIds(input) => {
                input.apply(&mut next, self.extensions)?;
            }

            Command::AddType(input) => {
                definitions::create(&mut next, "types", input, self.extensions)?;
            }
            Command::UpdateType(input) => {
                definitions::update(&mut next, "types", input, self.extensions)?;
            }
            Command::RemoveType(input) => {
                definitions::remove(&mut next, "types", input, self.extensions)?;
            }
            Command::AddDifferentialEquation(input) => {
                definitions::create(&mut next, "differentialEquations", input, self.extensions)?;
            }
            Command::UpdateDifferentialEquation(input) => {
                definitions::update(&mut next, "differentialEquations", input, self.extensions)?;
            }
            Command::RemoveDifferentialEquation(input) => {
                definitions::remove(&mut next, "differentialEquations", input, self.extensions)?;
            }
            Command::AddParameter(input) => {
                definitions::create(&mut next, "parameters", input, self.extensions)?;
            }
            Command::UpdateParameter(input) => {
                definitions::update(&mut next, "parameters", input, self.extensions)?;
            }
            Command::RemoveParameter(input) => {
                definitions::remove(&mut next, "parameters", input, self.extensions)?;
            }
            Command::AddScenario(input) => {
                definitions::create(&mut next, "scenarios", input, self.extensions)?;
            }
            Command::UpdateScenario(input) => {
                definitions::update(&mut next, "scenarios", input, self.extensions)?;
            }
            Command::RemoveScenario(input) => {
                definitions::remove(&mut next, "scenarios", input, self.extensions)?;
            }
            Command::AddMetric(input) => {
                definitions::create(&mut next, "metrics", input, self.extensions)?;
            }
            Command::UpdateMetric(input) => {
                definitions::update(&mut next, "metrics", input, self.extensions)?;
            }
            Command::RemoveMetric(input) => {
                definitions::remove(&mut next, "metrics", input, self.extensions)?;
            }
            Command::EditTypeElements(input) => input.apply(&mut next, self.extensions)?,
            Command::AddPlace(input) => input.apply(&mut next, self.extensions)?,
            Command::UpdatePlace(input) => input.apply(&mut next, self.extensions)?,
            Command::RemovePlace(input) => input.apply(&mut next, self.extensions)?,
            Command::AddTransition(input) => input.apply(&mut next, self.extensions)?,
            Command::UpdateTransition(input) => input.apply(&mut next, self.extensions)?,
            Command::RemoveTransition(input) => input.apply(&mut next)?,
            Command::AddArc(input) => input.target.apply(
                &mut next,
                self.extensions,
                &arcs::ArcEdit::Add {
                    weight: input.weight,
                    arc_type: input.arc_type,
                },
            )?,
            Command::RemoveArc(input) => {
                input.apply(&mut next, self.extensions, &arcs::ArcEdit::Remove)?;
            }
            Command::UpdateArcWeight(input) => input.target.apply(
                &mut next,
                self.extensions,
                &arcs::ArcEdit::Weight(input.weight),
            )?,
            Command::UpdateArcType(input) => input.target.apply(
                &mut next,
                self.extensions,
                &arcs::ArcEdit::Type(input.arc_type),
            )?,
            Command::UpdateArcPlace(input) => input.target.apply(
                &mut next,
                self.extensions,
                &arcs::ArcEdit::Endpoint(&input.new_endpoint),
            )?,
            Command::CommitNodePositions(_) => unreachable!("positions are handled before cloning"),
        }
        self.replace_document(next, timestamp)
    }

    /// Moves nodes in one transaction, including nodes within a subnet.
    ///
    /// # Errors
    /// Returns an error for a missing subnet, malformed node, or non-finite position.
    pub fn commit_node_positions(
        &mut self,
        input: &CommitNodePositions,
        timestamp: String,
    ) -> Result<Vec<Patch>, String> {
        if self.readonly {
            return Ok(Vec::new());
        }
        let mut input = input.clone();
        input.target_subnet_id = input.target_subnet_id.map(|id| model::canonical_id(&id));
        for commit in &mut input.commits {
            commit.id = model::canonical_id(&commit.id);
        }
        let mut next = self.document().clone();
        let target = if let Some(id) = &input.target_subnet_id {
            next.get_mut("subnets")
                .and_then(Value::as_array_mut)
                .and_then(|subnets| subnets.iter_mut().find(|subnet| subnet["id"] == *id))
                .ok_or_else(|| format!("Subnet ID `{id}` does not exist"))?
        } else {
            &mut next
        };
        for commit in &input.commits {
            if !commit.position.x.is_finite() || !commit.position.y.is_finite() {
                return Err("Node positions must be finite numbers".to_owned());
            }
            let collection = match commit.item_type {
                NodeKind::Place => "places",
                NodeKind::Transition => "transitions",
                NodeKind::ComponentInstance => "componentInstances",
            };
            if let Some(node) = target
                .get_mut(collection)
                .and_then(Value::as_array_mut)
                .and_then(|nodes| nodes.iter_mut().find(|node| node["id"] == commit.id))
            {
                let object = node.as_object_mut().ok_or("Node must be an object")?;
                object.insert("x".to_owned(), Value::from(commit.position.x));
                object.insert("y".to_owned(), Value::from(commit.position.y));
            }
        }
        self.replace_document(next, timestamp)
    }

    /// Moves to a retained history index, returning one combined change event.
    ///
    /// # Errors
    /// Returns an error if a retained patch cannot be applied to the current document.
    pub fn go_to_index(&mut self, index: usize) -> Result<Vec<Patch>, String> {
        if self.readonly || index > self.history.len() || index == self.cursor {
            return Ok(Vec::new());
        }
        let mut next = self.document().clone();
        if index < self.cursor {
            for checkpoint in self.history.iter().take(self.cursor).skip(index).rev() {
                patch::apply(&mut next, &checkpoint.inverse)?;
            }
        } else {
            for checkpoint in self.history.iter().take(index).skip(self.cursor) {
                patch::apply(&mut next, &checkpoint.forward)?;
            }
        }
        let patches = patch::diff(self.document(), &next);
        self.document = model::Sdcpn::from_normalized(next.clone())?;
        self.snapshot = OnceCell::from(next);
        self.cursor = index;
        Ok(patches)
    }

    pub fn clear_history(&mut self, timestamp: String) {
        self.history.clear();
        self.cursor = 0;
        self.baseline_timestamp = timestamp;
    }
}
