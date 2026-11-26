#![cfg_attr(doc, doc = include_str!("../README.md"))]
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

mod action;
mod actor;
mod context;
mod event;
mod target;

#[cfg(test)]
mod tests;

pub use self::{
    action::{ActionName, AuditAction},
    actor::AuditActor,
    context::{AuditContext, TraceId, UserAgent},
    event::{AuditEvent, AuditEventId, Outcome},
    target::{Target, TargetId, TargetKind},
};
