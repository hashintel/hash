//! Per-suspension-type request handlers.
//!
//! Each suspension variant has a dedicated orchestrator that knows how to
//! fulfill it. Currently the only variant is [`GraphRead`], handled by
//! [`GraphReadOrchestrator`].
//!
//! [`GraphRead`]: hashql_mir::body::terminator::GraphRead

mod graph_read;
pub(crate) use self::graph_read::GraphReadOrchestrator;
