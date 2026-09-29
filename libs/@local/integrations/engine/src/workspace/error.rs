use std::path::PathBuf;

/// Reports why [`Workspace::open`](super::Workspace::open) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum OpenError {
    #[display("allowed directory `{}` is not an absolute path", path.display())]
    RelativeDirectory { path: PathBuf },
    #[display("allowed directory `{}` is not valid UTF-8", path.display())]
    NonUtf8Directory { path: PathBuf },
    #[display("could not set `{setting}`")]
    Configure { setting: &'static str },
    #[display("could not open the database at `{}`", path.display())]
    Open { path: PathBuf },
    #[display("could not start the workspace thread")]
    Spawn,
    #[display("the workspace thread stopped before the database opened")]
    Stopped,
}

/// Reports why [`Workspace::execute`](super::Workspace::execute) or
/// [`Workspace::query`](super::Workspace::query) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum StatementError {
    #[display("the statement failed")]
    Failed,
    #[display("the workspace thread stopped before the statement finished")]
    Stopped,
}

/// Reports why [`Workspace::snapshot`](super::Workspace::snapshot) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum SnapshotError {
    #[display("could not checkpoint the database")]
    Checkpoint,
    #[display("could not write the snapshot to `{}`", target.display())]
    Write { target: PathBuf },
    #[display("the workspace thread stopped before the snapshot finished")]
    Stopped,
}

/// Reports why [`Workspace::close`](super::Workspace::close) failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum CloseError {
    #[display("could not checkpoint the database before closing it")]
    Checkpoint,
    #[display("the workspace thread stopped before the database closed")]
    Stopped,
}
