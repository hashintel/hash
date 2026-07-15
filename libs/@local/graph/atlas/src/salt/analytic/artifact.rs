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
const BOUNDS: SectionId = SectionId::new(2);
const DENSITY: SectionId = SectionId::new(3);
const LEAF_BIRTHS: SectionId = SectionId::new(4);
const LEAF_DEATHS: SectionId = SectionId::new(5);
const PIXEL_REGIONS: SectionId = SectionId::new(6);
const POINT_REGIONS: SectionId = SectionId::new(7);
const PEAK_PIXELS: SectionId = SectionId::new(8);
const PEAK_DENSITIES: SectionId = SectionId::new(9);
const LABEL_REGIONS: SectionId = SectionId::new(10);
const LABEL_ROWS: SectionId = SectionId::new(11);
const LABEL_OFFSETS: SectionId = SectionId::new(12);
const LABEL_TEXT: SectionId = SectionId::new(13);
const LEAF_PARENTS: SectionId = SectionId::new(14);
const LEAF_REPRESENTATIVE_PIXELS: SectionId = SectionId::new(15);
const LEAF_REGIONS: SectionId = SectionId::new(16);
const REGION_PARENTS: SectionId = SectionId::new(17);
const REGION_PERSISTENCE: SectionId = SectionId::new(18);
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
    let leaf_births = tree
        .leaves()
        .iter()
        .map(|leaf| leaf.birth)
        .collect::<Vec<_>>();
    let leaf_deaths = tree
        .leaves()
        .iter()
        .map(|leaf| leaf.death)
        .collect::<Vec<_>>();
    let leaf_parents = tree
        .leaves()
        .iter()
        .map(|leaf| leaf.parent.unwrap_or(u64::MAX))
        .collect::<Vec<_>>();
    let leaf_representative_pixels = tree
        .leaves()
        .iter()
        .map(|leaf| u64::try_from(leaf.representative_pixel).expect("pixel index should fit u64"))
        .collect::<Vec<_>>();
    let peak_pixels = regions
        .peaks()
        .iter()
        .map(|peak| u64::try_from(peak.pixel).expect("usize should fit u64"))
        .collect::<Vec<_>>();
    let peak_densities = regions
        .peaks()
        .iter()
        .map(|peak| peak.density)
        .collect::<Vec<_>>();
    let region_parents = regions
        .peaks()
        .iter()
        .map(|peak| peak.parent_region.unwrap_or(u32::MAX))
        .collect::<Vec<_>>();
    let region_persistence = regions
        .peaks()
        .iter()
        .map(|peak| peak.persistence)
        .collect::<Vec<_>>();
    let region_leaves = regions
        .peaks()
        .iter()
        .map(|peak| peak.persistence_leaf)
        .collect::<Vec<_>>();
    let label_regions = labels.iter().map(|label| label.region).collect::<Vec<_>>();
    let label_rows = labels
        .iter()
        .map(|label| label.row.as_u32())
        .collect::<Vec<_>>();
    let mut region_representative_rows = vec![u32::MAX; regions.peaks().len()];
    for label in labels {
        let region = usize::try_from(label.region).expect("region identity should fit usize");
        if region < region_representative_rows.len() {
            region_representative_rows[region] = label.row.as_u32();
        }
    }
    let mut label_offsets = Vec::with_capacity(labels.len() + 1);
    let mut label_text = Vec::new();
    label_offsets.push(0_u64);
    for label in labels {
        label_text.extend_from_slice(label.text.as_bytes());
        label_offsets.push(u64::try_from(label_text.len()).expect("usize should fit u64"));
    }

    let mut sections = Vec::with_capacity(20);
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
