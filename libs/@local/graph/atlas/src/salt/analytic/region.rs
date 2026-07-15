use super::{error::AnalyticError, raster::DensityRaster};

const UNASSIGNED: u32 = u32::MAX;

/// Peak-selection thresholds for a density watershed.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RegionConfig {
    pub density_floor_fraction: f64,
    pub minimum_peak_fraction: f64,
    pub maximum_regions: usize,
}

impl Default for RegionConfig {
    fn default() -> Self {
        Self {
            density_floor_fraction: 0.005,
            minimum_peak_fraction: 0.05,
            maximum_regions: 64,
        }
    }
}

/// The density maximum representing one analytic region.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RegionPeak {
    pub region: u32,
    pub pixel: usize,
    pub density: f64,
}

/// A deterministic watershed over the analytic density raster.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RegionMap {
    pixel_regions: Vec<u32>,
    point_regions: Vec<u32>,
    peaks: Vec<RegionPeak>,
}

impl RegionMap {
    /// Borrows region assignments in row-major raster order.
    #[must_use]
    #[inline]
    pub(crate) fn pixel_regions(&self) -> &[u32] {
        &self.pixel_regions
    }

    /// Borrows region assignments in input-point order.
    #[must_use]
    #[inline]
    pub(crate) fn point_regions(&self) -> &[u32] {
        &self.point_regions
    }

    /// Borrows selected peaks in region-identifier order.
    #[must_use]
    #[inline]
    pub(crate) fn peaks(&self) -> &[RegionPeak] {
        &self.peaks
    }
}

/// Partitions a density field into basins of selected maxima.
///
/// Every active pixel follows the steepest eight-neighbor ascent. Equal-density
/// plateaus flow toward the lower flat pixel index, which makes every path
/// acyclic and independent of traversal order. Maxima below the peak threshold
/// or beyond the region limit are folded into their nearest retained maximum.
///
/// # Errors
///
/// This returns an error when a fraction leaves `(0, 1]`, the maximum region
/// count is zero or exceeds `u32`, or a point coordinate is non-finite.
pub(crate) fn density_regions(
    raster: &DensityRaster,
    points: &[[f64; 2]],
    config: RegionConfig,
) -> Result<RegionMap, AnalyticError> {
    validate_fraction(
        "region density floor fraction",
        config.density_floor_fraction,
    )?;
    validate_fraction("region minimum peak fraction", config.minimum_peak_fraction)?;
    if config.maximum_regions == 0 || u32::try_from(config.maximum_regions).is_err() {
        return Err(AnalyticError::InvalidRegionLimit {
            value: config.maximum_regions,
        });
    }
    for (point, coordinate) in points.iter().enumerate() {
        for (axis, &value) in coordinate.iter().enumerate() {
            if !value.is_finite() {
                return Err(AnalyticError::NonFiniteCoordinate { point, axis, value });
            }
        }
    }

    let values = raster.values();
    let density_maximum = values.iter().copied().fold(0.0_f64, f64::max);
    if density_maximum == 0.0 {
        return Ok(RegionMap {
            pixel_regions: vec![UNASSIGNED; values.len()],
            point_regions: vec![UNASSIGNED; points.len()],
            peaks: Vec::new(),
        });
    }

    let floor = config.density_floor_fraction * density_maximum;
    let mut roots = vec![usize::MAX; values.len()];
    let mut trail = Vec::new();
    for pixel in 0..values.len() {
        if values[pixel] >= floor {
            resolve_root(pixel, values, raster.size(), floor, &mut roots, &mut trail);
        }
    }

    let mut maxima = roots
        .iter()
        .enumerate()
        .filter_map(|(pixel, &root)| (pixel == root).then_some(pixel))
        .filter(|&pixel| values[pixel] >= config.minimum_peak_fraction * density_maximum)
        .collect::<Vec<_>>();
    maxima.sort_unstable_by(|&left, &right| {
        values[right]
            .total_cmp(&values[left])
            .then_with(|| left.cmp(&right))
    });
    maxima.truncate(config.maximum_regions);

    let peaks = maxima
        .iter()
        .enumerate()
        .map(|(region, &pixel)| RegionPeak {
            region: u32::try_from(region).expect("validated region count should fit u32"),
            pixel,
            density: values[pixel],
        })
        .collect::<Vec<_>>();
    let mut root_regions = vec![UNASSIGNED; values.len()];
    for peak in &peaks {
        root_regions[peak.pixel] = peak.region;
    }

    let mut pixel_regions = vec![UNASSIGNED; values.len()];
    if !peaks.is_empty() {
        for (pixel, &root) in roots.iter().enumerate() {
            if root == usize::MAX {
                continue;
            }
            let region = if root_regions[root] != UNASSIGNED {
                root_regions[root]
            } else {
                let region = nearest_peak(root, raster.size(), &peaks);
                root_regions[root] = region;
                region
            };
            pixel_regions[pixel] = region;
        }
    }

    let point_regions = points
        .iter()
        .map(|&coordinate| pixel_regions[raster.pixel(coordinate)])
        .collect();
    Ok(RegionMap {
        pixel_regions,
        point_regions,
        peaks,
    })
}

fn resolve_root(
    start: usize,
    values: &[f64],
    size: usize,
    floor: f64,
    roots: &mut [usize],
    trail: &mut Vec<usize>,
) {
    trail.clear();
    let mut pixel = start;
    loop {
        if roots[pixel] != usize::MAX {
            pixel = roots[pixel];
            break;
        }
        trail.push(pixel);
        let next = ascent_neighbor(pixel, values, size, floor);
        if next == pixel {
            roots[pixel] = pixel;
            break;
        }
        pixel = next;
    }
    for &visited in trail.iter() {
        roots[visited] = pixel;
    }
}

fn ascent_neighbor(pixel: usize, values: &[f64], size: usize, floor: f64) -> usize {
    let row = pixel / size;
    let column = pixel % size;
    let mut best = pixel;
    for row_offset in -1..=1 {
        let Some(neighbor_row) = row.checked_add_signed(row_offset) else {
            continue;
        };
        if neighbor_row >= size {
            continue;
        }
        for column_offset in -1..=1 {
            let Some(neighbor_column) = column.checked_add_signed(column_offset) else {
                continue;
            };
            if neighbor_column >= size {
                continue;
            }
            let neighbor = neighbor_row * size + neighbor_column;
            if values[neighbor] < floor {
                continue;
            }
            if values[neighbor] > values[best]
                || (values[neighbor] == values[best] && neighbor < best)
            {
                best = neighbor;
            }
        }
    }
    best
}

fn nearest_peak(root: usize, size: usize, peaks: &[RegionPeak]) -> u32 {
    let root_row = root / size;
    let root_column = root % size;
    peaks
        .iter()
        .min_by_key(|peak| {
            let peak_row = peak.pixel / size;
            let peak_column = peak.pixel % size;
            let row_distance =
                u128::try_from(root_row.abs_diff(peak_row)).expect("usize should fit u128");
            let column_distance =
                u128::try_from(root_column.abs_diff(peak_column)).expect("usize should fit u128");
            (
                row_distance * row_distance + column_distance * column_distance,
                peak.region,
            )
        })
        .expect("non-empty peaks should have a nearest member")
        .region
}

fn validate_fraction(field: &'static str, value: f64) -> Result<(), AnalyticError> {
    if !value.is_finite() || !(0.0 < value && value <= 1.0) {
        return Err(AnalyticError::InvalidFraction { field, value });
    }
    Ok(())
}
