//! Input admission: the coordinate-free checks one run passes before its loop exists.

use hashql_core::id::Id;

use super::super::{TrainError, TrainOptions, TrainerInputs};
use crate::salt::{
    projector::verdict::{PlacementClass, ResolvedVerdict},
    relation::attraction::{AttractionGroup, AttractionIndex},
};

/// Validates the corpus row domain and the boundary's structural admissibility.
///
/// Returns whether the run is vacuous.
///
/// Runs once per training run, at session construction: the `O(rows)` domain scans sit before the
/// step loop and no step re-enters admission.
///
/// The decision whether the boundary can freeze a radius is structural: force, review coverage, and
/// the presence of an opening segment to measure after are properties of the index, the verdicts,
/// and the schedule, not of coordinates, so an impossible boundary fails here instead of after the
/// opening segment.
///
/// The columns, the semantic graph, and the support anchors share one corpus row domain - a
/// wiring contract checked in debug builds, since all of them come from one generation.
pub(super) fn admit<N, E>(
    inputs: &TrainerInputs<'_, N, E>,
    options: &TrainOptions,
) -> Result<bool, TrainError<N>>
where
    N: Id,
    E: Id,
{
    let rows = inputs.columns.representations.len();
    debug_assert_eq!(
        rows,
        inputs.columns.roles.len(),
        "the representation and role columns should cover the same rows"
    );
    debug_assert_eq!(
        rows,
        inputs.semantic.rows(),
        "the input columns and the semantic graph should cover the same rows"
    );
    debug_assert!(
        inputs
            .landmarks
            .iter()
            .chain(inputs.anchors)
            .all(|anchor| anchor.row.as_usize() < rows),
        "support anchors should reference corpus rows"
    );

    let force = ForceClasses::measure(inputs.attraction);
    // A measured radius needs the semantic-only baseline in front of the boundary; measuring on the
    // untrained init map would freeze a meaningless radius.
    if force.proximal && options.schedule.boundary() == 0 {
        return Err(TrainError::UnbaselinedRadius);
    }

    if force.proximal && !reviewed_proximal_force(inputs.attraction, inputs.verdicts) {
        return Err(TrainError::MissingProximalReviews);
    }

    if force.coincident && !force.proximal {
        return Err(TrainError::CoincidentWithoutProximal);
    }

    Ok(!force.proximal && !force.coincident)
}

/// Which relation classes carry force anywhere in the index.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct ForceClasses {
    proximal: bool,
    coincident: bool,
}

impl ForceClasses {
    /// Scans the groups for class weight backed by instances.
    fn measure<N, E>(index: &AttractionIndex<N, E>) -> Self {
        let mut classes = Self {
            proximal: false,
            coincident: false,
        };

        for group in index.groups().iter().filter(|group| exerts_force(group)) {
            let weights = group.weights();
            classes.proximal |= !weights.proximal.is_zero();
            classes.coincident |= !weights.coincident.is_zero();
        }

        classes
    }
}

/// Whether any reviewed-Proximal verdict covers a group that exerts Proximal force.
///
/// This is the coordinate-free core of the boundary measurement: the calibration's pair weights are
/// positive exactly on these groups' instances, so a positive measured mass exists if and only if
/// this holds.
fn reviewed_proximal_force<N, E>(
    index: &AttractionIndex<N, E>,
    verdicts: &[ResolvedVerdict],
) -> bool {
    verdicts
        .iter()
        .filter(|verdict| verdict.placement == PlacementClass::Proximal)
        .any(|verdict| {
            let groups = index.groups();
            groups
                .binary_search_by_key(&verdict.relation.as_u64(), |group| {
                    group.relation().as_u64()
                })
                .is_ok_and(|position| {
                    let group = &groups[position];
                    exerts_force(group) && !group.weights().proximal.is_zero()
                })
        })
}

/// Whether a group can exert any force.
///
/// Instances exist and the strength multiplier passes them through.
const fn exerts_force<N, E>(group: &AttractionGroup<N, E>) -> bool {
    !group.edges().is_empty() && !group.weights().strength.is_zero()
}
