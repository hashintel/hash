use std::path::{Path, PathBuf};

/// The files of a workspace, named after its database file.
pub(super) struct WorkspaceFiles {
    database: PathBuf,
    /// The file that the workspace locks while the database is open.
    lock: PathBuf,
}

impl WorkspaceFiles {
    pub(super) fn new(database: PathBuf) -> Self {
        let mut lock = database.as_os_str().to_owned();
        lock.push(".lock");
        Self {
            database,
            lock: PathBuf::from(lock),
        }
    }

    pub(super) fn database(&self) -> &Path {
        &self.database
    }

    pub(super) fn lock(&self) -> &Path {
        &self.lock
    }
}
