use hash_integrations_definition::SourceName;

use super::ArtifactKey;
use crate::CaptureRun;

/// The key of the capture of `source` in `run`.
pub(crate) fn capture(run: CaptureRun, source: &SourceName) -> ArtifactKey {
    ArtifactKey(format!("{}/{}/{source}.parquet", run.web, run.id).into())
}
