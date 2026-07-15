use super::{error::AnalyticError, region::RegionMap};
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

/// Selects the highest-importance entity label in each occupied region.
///
/// Equal-importance candidates are ordered by generation row and then label
/// text. The result follows ascending region identity and omits regions with no
/// candidate, allowing callers to distinguish an unnamed region from a
/// fabricated fallback.
///
/// # Errors
///
/// This returns an error for an out-of-range point, a negative or non-finite
/// importance, or an empty label.
pub(crate) fn select_region_labels<'label>(
    regions: &RegionMap,
    candidates: impl IntoIterator<Item = RegionLabelCandidate<'label>>,
) -> Result<Vec<RegionLabel<'label>>, AnalyticError> {
    let mut selected = vec![None; regions.peaks().len()];
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

    Ok(selected
        .into_iter()
        .enumerate()
        .filter_map(|(region, candidate)| {
            candidate.map(|candidate| RegionLabel {
                region: u32::try_from(region).expect("region identity should originate from u32"),
                row: candidate.row,
                text: candidate.text,
            })
        })
        .collect())
}
