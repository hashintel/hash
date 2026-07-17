use camino::Utf8Path;

use super::LandmarkSkeleton;
use crate::salt::{
    format::LANDMARK_FORMAT,
    storage::mmap::{
        ArtifactScalar, ArtifactSection, ArtifactWriteError, PublishedArtifact, SectionId,
        publish_artifact,
    },
};

const ROWS: SectionId = SectionId::new(1);
const ASSIGNMENT: SectionId = SectionId::new(2);
const COORDINATES: SectionId = SectionId::new(3);

/// Publishes selection, assignment, and fitted coordinates as one artifact.
///
/// # Errors
///
/// This returns an error when section encoding or immutable publication fails.
pub(crate) fn publish_landmark_skeleton(
    path: &Utf8Path,
    skeleton: &LandmarkSkeleton,
) -> Result<PublishedArtifact, ArtifactWriteError> {
    let rows = skeleton
        .rows()
        .iter()
        .map(|row| row.as_u32())
        .collect::<Vec<_>>();
    publish_artifact(
        path,
        LANDMARK_FORMAT,
        &[
            section(0, ROWS, &[rows.len()], &rows)?,
            section(
                1,
                ASSIGNMENT,
                &[skeleton.assignment().as_slice().len()],
                skeleton.assignment().as_slice(),
            )?,
            section(
                2,
                COORDINATES,
                &[skeleton.coordinates().len(), 2],
                skeleton.coordinates().as_flattened(),
            )?,
        ],
    )
}

#[inline]
fn section<'data, T>(
    index: usize,
    id: SectionId,
    dimensions: &[usize],
    values: &'data [T],
) -> Result<ArtifactSection<'data>, ArtifactWriteError>
where
    T: ArtifactScalar,
{
    ArtifactSection::new(id, dimensions, values)
        .map_err(|error| ArtifactWriteError::InvalidSection { index, error })
}
