use camino::Utf8Path;

use super::{label::RegionLabel, merge_tree::MergeTree, raster::DensityRaster, region::RegionMap};
use crate::salt::{
    format::ANALYTIC_FORMAT,
    hash::ContentHash,
    storage::mmap::{
        ArtifactScalar, ArtifactSection, ArtifactWriteError, PublishedArtifact, SectionId,
        publish_artifact,
    },
};

const CONFIGURATION_HASH: SectionId = SectionId::new(1);
pub(crate) const BOUNDS: SectionId = SectionId::new(2);
pub(crate) const DENSITY: SectionId = SectionId::new(3);
pub(crate) const LEAF_BIRTHS: SectionId = SectionId::new(4);
pub(crate) const LEAF_DEATHS: SectionId = SectionId::new(5);
const PIXEL_REGIONS: SectionId = SectionId::new(6);
pub(crate) const POINT_REGIONS: SectionId = SectionId::new(7);
pub(crate) const PEAK_PIXELS: SectionId = SectionId::new(8);
const PEAK_DENSITIES: SectionId = SectionId::new(9);
const LABEL_REGIONS: SectionId = SectionId::new(10);
const LABEL_ROWS: SectionId = SectionId::new(11);
const LABEL_OFFSETS: SectionId = SectionId::new(12);
const LABEL_TEXT: SectionId = SectionId::new(13);
pub(crate) const LEAF_PARENTS: SectionId = SectionId::new(14);
pub(crate) const LEAF_REPRESENTATIVE_PIXELS: SectionId = SectionId::new(15);
const LEAF_REGIONS: SectionId = SectionId::new(16);
pub(crate) const REGION_PARENTS: SectionId = SectionId::new(17);
pub(crate) const REGION_PERSISTENCE: SectionId = SectionId::new(18);
const REGION_LEAVES: SectionId = SectionId::new(19);
const REGION_REPRESENTATIVE_ROWS: SectionId = SectionId::new(20);

/// Publishes the complete analytic field and its entity-backed labels.
///
/// Variable-width labels use an offset table with one terminal offset, so
/// readers can borrow UTF-8 ranges directly from the mapped payload.
///
/// # Errors
///
/// This returns an error when a section cannot be represented or immutable
/// publication fails.
#[expect(
    clippy::too_many_lines,
    reason = "the publisher keeps the complete twenty-section analytic schema in one audit \
              boundary"
)]
pub(crate) fn publish_analytic_artifact(
    path: &Utf8Path,
    configuration: ContentHash,
    raster: &DensityRaster,
    tree: &MergeTree,
    regions: &RegionMap,
    labels: &[RegionLabel<'_>],
) -> Result<PublishedArtifact, ArtifactWriteError> {
    let (minimum, maximum) = raster.bounds();
    let bounds = [minimum[0], minimum[1], maximum[0], maximum[1]];
    let leaf_births = collect_artifact(
        "analytic leaf births",
        tree.leaves().iter().map(|leaf| leaf.birth),
    )?;
    let leaf_deaths = collect_artifact(
        "analytic leaf deaths",
        tree.leaves().iter().map(|leaf| leaf.death),
    )?;
    let leaf_parents = collect_artifact(
        "analytic leaf parents",
        tree.leaves()
            .iter()
            .map(|leaf| leaf.parent.unwrap_or(u64::MAX)),
    )?;
    let leaf_representative_pixels = collect_artifact(
        "analytic leaf representative pixels",
        tree.leaves().iter().map(|leaf| {
            u64::try_from(leaf.representative_pixel).expect("pixel index should fit u64")
        }),
    )?;
    let peak_pixels = collect_artifact(
        "analytic peak pixels",
        regions
            .peaks()
            .iter()
            .map(|peak| u64::try_from(peak.pixel).expect("usize should fit u64")),
    )?;
    let peak_densities = collect_artifact(
        "analytic peak densities",
        regions.peaks().iter().map(|peak| peak.density),
    )?;
    let region_parents = collect_artifact(
        "analytic region parents",
        regions
            .peaks()
            .iter()
            .map(|peak| peak.parent_region.unwrap_or(u32::MAX)),
    )?;
    let region_persistence = collect_artifact(
        "analytic region persistence",
        regions.peaks().iter().map(|peak| peak.persistence),
    )?;
    let region_leaves = collect_artifact(
        "analytic region leaves",
        regions.peaks().iter().map(|peak| peak.persistence_leaf),
    )?;
    let label_regions = collect_artifact(
        "analytic label regions",
        labels.iter().map(|label| label.region),
    )?;
    let label_rows = collect_artifact(
        "analytic label rows",
        labels.iter().map(|label| label.row.as_u32()),
    )?;
    let mut region_representative_rows = filled_artifact(
        "analytic representative rows",
        regions.peaks().len(),
        u32::MAX,
    )?;
    for label in labels {
        let region = usize::try_from(label.region).expect("region identity should fit usize");
        if region < region_representative_rows.len() {
            region_representative_rows[region] = label.row.as_u32();
        }
    }
    let offset_count = labels
        .len()
        .checked_add(1)
        .ok_or(ArtifactWriteError::Allocation {
            buffer: "analytic label offsets",
            elements: usize::MAX,
        })?;
    let mut label_offsets = empty_artifact("analytic label offsets", offset_count)?;
    let text_bytes = labels
        .iter()
        .try_fold(0_usize, |total, label| total.checked_add(label.text.len()));
    let text_bytes = text_bytes.ok_or(ArtifactWriteError::Allocation {
        buffer: "analytic label text",
        elements: usize::MAX,
    })?;
    let mut label_text = empty_artifact("analytic label text", text_bytes)?;
    label_offsets.push(0_u64);
    for label in labels {
        label_text.extend_from_slice(label.text.as_bytes());
        label_offsets.push(u64::try_from(label_text.len()).expect("usize should fit u64"));
    }

    let mut sections = empty_artifact("analytic artifact sections", 20)?;
    push(
        &mut sections,
        CONFIGURATION_HASH,
        &[32],
        configuration.as_bytes(),
    )?;
    push(&mut sections, BOUNDS, &[2, 2], &bounds)?;
    push(
        &mut sections,
        DENSITY,
        &[raster.size(), raster.size()],
        raster.values(),
    )?;
    append(&mut sections, LEAF_BIRTHS, &leaf_births)?;
    append(&mut sections, LEAF_DEATHS, &leaf_deaths)?;
    push(
        &mut sections,
        PIXEL_REGIONS,
        &[raster.size(), raster.size()],
        regions.pixel_regions(),
    )?;
    append(&mut sections, POINT_REGIONS, regions.point_regions())?;
    append(&mut sections, PEAK_PIXELS, &peak_pixels)?;
    append(&mut sections, PEAK_DENSITIES, &peak_densities)?;
    append(&mut sections, LABEL_REGIONS, &label_regions)?;
    append(&mut sections, LABEL_ROWS, &label_rows)?;
    push(
        &mut sections,
        LABEL_OFFSETS,
        &[label_offsets.len()],
        &label_offsets,
    )?;
    push(&mut sections, LABEL_TEXT, &[label_text.len()], &label_text)?;
    append(&mut sections, LEAF_PARENTS, &leaf_parents)?;
    append(
        &mut sections,
        LEAF_REPRESENTATIVE_PIXELS,
        &leaf_representative_pixels,
    )?;
    append(&mut sections, LEAF_REGIONS, regions.leaf_regions())?;
    append(&mut sections, REGION_PARENTS, &region_parents)?;
    append(&mut sections, REGION_PERSISTENCE, &region_persistence)?;
    append(&mut sections, REGION_LEAVES, &region_leaves)?;
    append(
        &mut sections,
        REGION_REPRESENTATIVE_ROWS,
        &region_representative_rows,
    )?;
    publish_artifact(path, ANALYTIC_FORMAT, &sections)
}

fn empty_artifact<T>(buffer: &'static str, elements: usize) -> Result<Vec<T>, ArtifactWriteError> {
    let mut values = Vec::new();
    values
        .try_reserve_exact(elements)
        .map_err(|_error| ArtifactWriteError::Allocation { buffer, elements })?;
    Ok(values)
}

fn filled_artifact<T: Clone>(
    buffer: &'static str,
    elements: usize,
    value: T,
) -> Result<Vec<T>, ArtifactWriteError> {
    let mut values = empty_artifact(buffer, elements)?;
    values.resize(elements, value);
    Ok(values)
}

fn collect_artifact<T>(
    buffer: &'static str,
    values: impl ExactSizeIterator<Item = T>,
) -> Result<Vec<T>, ArtifactWriteError> {
    let elements = values.len();
    let mut collected = empty_artifact(buffer, elements)?;
    collected.extend(values);
    Ok(collected)
}

#[inline]
fn append<'data, T>(
    sections: &mut Vec<ArtifactSection<'data>>,
    id: SectionId,
    values: &'data [T],
) -> Result<(), ArtifactWriteError>
where
    T: ArtifactScalar,
{
    push(sections, id, &[values.len()], values)
}

#[inline]
fn push<'data, T>(
    sections: &mut Vec<ArtifactSection<'data>>,
    id: SectionId,
    dimensions: &[usize],
    values: &'data [T],
) -> Result<(), ArtifactWriteError>
where
    T: ArtifactScalar,
{
    let index = sections.len();
    let section = ArtifactSection::new(id, dimensions, values)
        .map_err(|error| ArtifactWriteError::InvalidSection { index, error })?;
    sections.push(section);
    Ok(())
}
