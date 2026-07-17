use super::{
    allocation::{collect_exact, empty, filled},
    error::AnalyticError,
    region::RegionMap,
};
use crate::salt::identity::GenerationRowId;

/// One entity-backed candidate for naming an analytic region.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RegionLabelCandidate<'label> {
    pub point: usize,
    pub row: GenerationRowId,
    pub importance: f64,
    pub text: &'label str,
}

/// The selected label and representative entity for one region.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RegionLabel<'label> {
    pub region: u32,
    pub row: GenerationRowId,
    pub text: &'label str,
}

/// Selects and ranks one entity-backed label for each occupied region.
///
/// Equal-importance candidates are ordered by generation row and then label
/// text. Selected labels are ranked by normalized region persistence plus
/// semantic importance, with ascending region identity breaking ties. Regions
/// with no candidate are omitted, allowing callers to distinguish an unnamed
/// region from a fabricated fallback.
///
/// # Errors
///
/// This returns an error for an out-of-range point, a negative or non-finite
/// importance, or an empty label.
pub(crate) fn select_region_labels<'label>(
    regions: &RegionMap,
    candidates: impl IntoIterator<Item = RegionLabelCandidate<'label>>,
) -> Result<Vec<RegionLabel<'label>>, AnalyticError> {
    let mut selected = filled("region label selections", regions.peaks().len(), None)?;
    for candidate in candidates {
        let Some(&region) = regions.point_regions().get(candidate.point) else {
            return Err(AnalyticError::RegionLabelPoint {
                point: candidate.point,
                count: regions.point_regions().len(),
            });
        };
        if !candidate.importance.is_finite() || candidate.importance.is_sign_negative() {
            return Err(AnalyticError::InvalidLabelImportance {
                point: candidate.point,
                value: candidate.importance,
            });
        }
        if candidate.text.trim().is_empty() {
            return Err(AnalyticError::EmptyRegionLabel {
                point: candidate.point,
            });
        }
        let Ok(region_index) = usize::try_from(region) else {
            continue;
        };
        let Some(slot) = selected.get_mut(region_index) else {
            continue;
        };
        if slot.is_none_or(|current: RegionLabelCandidate<'_>| {
            candidate
                .importance
                .total_cmp(&current.importance)
                .then_with(|| (current.row, current.text).cmp(&(candidate.row, candidate.text)))
                .is_gt()
        }) {
            *slot = Some(candidate);
        }
    }

    let mut labels = empty("ranked region labels", regions.peaks().len())?;
    labels.extend(
        selected
            .into_iter()
            .enumerate()
            .filter_map(|(region, candidate)| {
                candidate.map(|candidate| {
                    let peak = regions
                        .peaks()
                        .get(region)
                        .expect("selected region should have a peak");
                    let normalized_persistence = if peak.density > 0.0 {
                        peak.persistence / peak.density
                    } else {
                        0.0
                    };
                    (
                        normalized_persistence + candidate.importance,
                        RegionLabel {
                            region: u32::try_from(region)
                                .expect("region identity should originate from u32"),
                            row: candidate.row,
                            text: candidate.text,
                        },
                    )
                })
            }),
    );
    labels.sort_unstable_by(|(left_score, left), (right_score, right)| {
        right_score
            .total_cmp(left_score)
            .then_with(|| left.region.cmp(&right.region))
    });
    collect_exact(
        "ordered region labels",
        labels.into_iter().map(|(_score, label)| label),
    )
}
