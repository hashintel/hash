// TODO: UNUSED: Needs triage
pub const BATCH_ID_LENGTH: usize = 32;
// TODO: UNUSED: Needs triage
pub type BatchId = [u8; BATCH_ID_LENGTH];

pub type WorkerIndex = usize;
pub type TaskId = u128;
pub type SpanId = Option<tracing::span::Id>;
