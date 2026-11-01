use std::{
    fs,
    path::{Path, PathBuf},
};

/// The files of a workspace, named after its database file.
pub(super) struct WorkspaceFiles {
    database: PathBuf,
    /// DuckDB's write-ahead log.
    log: PathBuf,
    /// DuckDB's default temporary directory.
    temp: PathBuf,
    /// The file that the workspace locks while the database is open.
    lock: PathBuf,
}

impl WorkspaceFiles {
    /// Returns `path` with `suffix` appended to its file name.
    fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
        let mut name = path.as_os_str().to_owned();
        name.push(suffix);
        PathBuf::from(name)
    }

    /// Returns the directory that holds `path`, which is the current directory for a bare file
    /// name.
    pub(super) fn directory(path: &Path) -> &Path {
        path.parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."))
    }

    /// Returns `path` with its directory resolved, or `None` if the directory cannot be resolved
    /// or `path` has no file name.
    fn resolve(path: &Path) -> Option<PathBuf> {
        Some(
            fs::canonicalize(Self::directory(path))
                .ok()?
                .join(path.file_name()?),
        )
    }

    /// Returns the files of the workspace whose database file is `database`.
    ///
    /// DuckDB names its log and its default temporary directory after the database file.
    pub(super) fn new(database: PathBuf) -> Self {
        Self {
            log: Self::with_suffix(&database, ".wal"),
            temp: Self::with_suffix(&database, ".tmp"),
            lock: Self::with_suffix(&database, ".lock"),
            database,
        }
    }

    pub(super) fn database(&self) -> &Path {
        &self.database
    }

    pub(super) fn lock(&self) -> &Path {
        &self.lock
    }

    /// Returns the files that the disk limit counts: the database file, its log and the
    /// temporary directory.
    pub(super) fn measured(&self) -> [&Path; 3] {
        [&self.database, &self.log, &self.temp]
    }

    /// Returns whether `path` names one of the files, once both directories are resolved.
    pub(super) fn contains(&self, path: &Path) -> bool {
        let Some(path) = Self::resolve(path) else {
            return false;
        };
        [&self.database, &self.log, &self.temp, &self.lock]
            .into_iter()
            .any(|file| Self::resolve(file).is_some_and(|file| file == path))
    }

    /// Returns `target` with `.partial` appended, the file a copy is written to before it is
    /// renamed to `target`.
    pub(super) fn partial(target: &Path) -> PathBuf {
        Self::with_suffix(target, ".partial")
    }
}
