//! Document transactions and local history for Petrinaut, usable natively and through WebAssembly.

mod command;
mod extensions;
mod patch;
#[cfg(test)]
mod tests;
mod wasm;

use serde::Deserialize;
use serde_json::Value;

pub use crate::{command::Command, extensions::Extensions, patch::Patch};

#[derive(Debug)]
struct Checkpoint {
    forward: Vec<Patch>,
    inverse: Vec<Patch>,
    timestamp: String,
}

/// A local document instance. The TypeScript adapter validates SDCPN domain schemas.
#[derive(Debug)]
pub struct PetrinautInstance {
    document: Value,
    history: Vec<Checkpoint>,
    cursor: usize,
    history_limit: usize,
    baseline_timestamp: String,
    readonly: bool,
    extensions: Extensions,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PositionCommit {
    pub id: String,
    pub item_type: NodeKind,
    pub position: Position,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Place,
    Transition,
    ComponentInstance,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitNodePositions {
    pub target_subnet_id: Option<String>,
    pub commits: Vec<PositionCommit>,
}

fn validate_document(document: &Value) -> Result<(), String> {
    for field in [
        "places",
        "transitions",
        "types",
        "parameters",
        "differentialEquations",
    ] {
        if !document.get(field).is_some_and(Value::is_array) {
            return Err(format!("Document field `{field}` must be an array"));
        }
    }
    Ok(())
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
        validate_document(&document)?;
        extensions.sanitize_document(&mut document);
        Ok(Self {
            document,
            history: Vec::new(),
            cursor: 0,
            history_limit,
            baseline_timestamp: timestamp,
            readonly,
            extensions,
        })
    }

    #[must_use]
    pub const fn document(&self) -> &Value {
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
        validate_document(&next)?;
        self.extensions.sanitize_document(&mut next);
        let forward = patch::diff(&self.document, &next);
        if forward.is_empty() {
            return Ok(forward);
        }
        if self.history_limit > 0 {
            let inverse = patch::diff(&next, &self.document);
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
        self.document = next;
        Ok(forward)
    }

    /// Executes a typed edit and records one atomic history entry.
    ///
    /// # Errors
    /// Returns an error when the command cannot be applied to this document.
    pub fn execute(&mut self, command: &Command, timestamp: String) -> Result<Vec<Patch>, String> {
        match command {
            Command::CommitNodePositions(input) => self.commit_node_positions(input, timestamp),
        }
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
        let mut next = self.document.clone();
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
        let mut next = self.document.clone();
        if index < self.cursor {
            for checkpoint in self.history.iter().take(self.cursor).skip(index).rev() {
                patch::apply(&mut next, &checkpoint.inverse)?;
            }
        } else {
            for checkpoint in self.history.iter().take(index).skip(self.cursor) {
                patch::apply(&mut next, &checkpoint.forward)?;
            }
        }
        let patches = patch::diff(&self.document, &next);
        self.document = next;
        self.cursor = index;
        Ok(patches)
    }

    pub fn clear_history(&mut self, timestamp: String) {
        self.history.clear();
        self.cursor = 0;
        self.baseline_timestamp = timestamp;
    }
}
