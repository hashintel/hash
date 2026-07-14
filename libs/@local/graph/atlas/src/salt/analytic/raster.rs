use rayon::prelude::*;

use super::error::AnalyticError;

const GAUSSIAN_TRUNCATE: f64 = 4.0;

/// Parameters for the versioned analytic density field.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RasterConfig {
    pub grid_size: usize,
    pub bandwidth_pixels: f64,
}

impl Default for RasterConfig {
    fn default() -> Self {
        Self {
            grid_size: 1_024,
            bandwidth_pixels: 4.0,
        }
    }
}

/// One coordinate and its non-negative analytic mass.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AnalyticPoint {
    pub coordinate: [f64; 2],
    pub mass: f64,
}

/// A square Gaussian-smoothed density field over the point extent.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DensityRaster {
    size: usize,
    values: Vec<f64>,
    minimum: [f64; 2],
    maximum: [f64; 2],
}

impl DensityRaster {
    #[cfg(test)]
    pub(super) fn from_values(size: usize, values: Vec<f64>) -> Self {
        Self {
            size,
            values,
            minimum: [0.0; 2],
            maximum: [1.0; 2],
        }
    }

    /// Returns the width and height in pixels.
    #[must_use]
    #[inline]
    pub(crate) const fn size(&self) -> usize {
        self.size
    }

    /// Borrows row-major density values.
    #[must_use]
    #[inline]
    pub(crate) fn values(&self) -> &[f64] {
        &self.values
    }

    /// Returns the coordinate extent represented by the raster.
    #[must_use]
    #[inline]
    pub(crate) const fn bounds(&self) -> ([f64; 2], [f64; 2]) {
        (self.minimum, self.maximum)
    }
}

/// Rasterizes weighted points and applies a separable Gaussian kernel.
///
/// The grid spans the input's own axis-aligned extent, widening a degenerate
/// axis by one unit around its value. Gaussian convolution uses reflected
/// boundaries and a radius of `round(4 * bandwidth_pixels)`. Consequently a
/// uniform coordinate scaling leaves histogram occupancy unchanged apart from
/// floating-point bin-boundary effects.
///
/// # Errors
///
/// This returns an error for a grid smaller than two, a non-positive
/// bandwidth, a non-finite coordinate, or a negative or non-finite mass.
pub(crate) fn density_raster(
    points: &[AnalyticPoint],
    config: RasterConfig,
) -> Result<DensityRaster, AnalyticError> {
    let area = validate_config(config)?;
    if points.is_empty() {
        return Ok(DensityRaster {
            size: config.grid_size,
            values: vec![0.0; area],
            minimum: [-0.5; 2],
            maximum: [0.5; 2],
        });
    }

    let mut minimum = [f64::INFINITY; 2];
    let mut maximum = [f64::NEG_INFINITY; 2];
    for (point_index, point) in points.iter().enumerate() {
        if !point.mass.is_finite() || point.mass < 0.0 {
            return Err(AnalyticError::InvalidMass {
                point: point_index,
                value: point.mass,
            });
        }
        for axis in 0..2 {
            let value = point.coordinate[axis];
            if !value.is_finite() {
                return Err(AnalyticError::NonFiniteCoordinate {
                    point: point_index,
                    axis,
                    value,
                });
            }
            minimum[axis] = minimum[axis].min(value);
            maximum[axis] = maximum[axis].max(value);
        }
    }
    for axis in 0..2 {
        if maximum[axis] <= minimum[axis] {
            minimum[axis] -= 0.5;
            maximum[axis] += 0.5;
        }
    }

    let mut histogram = vec![0.0; area];
    for point in points {
        let x = bin(
            point.coordinate[0],
            minimum[0],
            maximum[0],
            config.grid_size,
        );
        let y = bin(
            point.coordinate[1],
            minimum[1],
            maximum[1],
            config.grid_size,
        );
        histogram[x * config.grid_size + y] += point.mass;
    }

    let kernel = gaussian_kernel(config.bandwidth_pixels);
    let first = convolve_axis(&histogram, config.grid_size, &kernel, 0);
    let values = convolve_axis(&first, config.grid_size, &kernel, 1);
    Ok(DensityRaster {
        size: config.grid_size,
        values,
        minimum,
        maximum,
    })
}

fn validate_config(config: RasterConfig) -> Result<usize, AnalyticError> {
    if config.grid_size < 2 {
        return Err(AnalyticError::GridTooSmall {
            size: config.grid_size,
        });
    }
    if !config.bandwidth_pixels.is_finite() || config.bandwidth_pixels <= 0.0 {
        return Err(AnalyticError::InvalidBandwidth {
            value: config.bandwidth_pixels,
        });
    }
    config
        .grid_size
        .checked_mul(config.grid_size)
        .ok_or(AnalyticError::GridAreaOverflow {
            size: config.grid_size,
        })
}

#[expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the normalized coordinate is clamped to the validated grid range"
)]
#[inline]
fn bin(value: f64, minimum: f64, maximum: f64, size: usize) -> usize {
    let normalized = (value - minimum) / (maximum - minimum);
    (normalized * size as f64)
        .floor()
        .clamp(0.0, (size - 1) as f64) as usize
}

#[expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "a finite positive bandwidth yields a bounded non-negative kernel radius"
)]
fn gaussian_kernel(bandwidth: f64) -> Vec<f64> {
    let radius = (GAUSSIAN_TRUNCATE * bandwidth + 0.5).floor() as usize;
    let mut kernel = (0..=2 * radius)
        .map(|index| {
            let distance = index as f64 - radius as f64;
            (-0.5 * (distance / bandwidth).powi(2)).exp()
        })
        .collect::<Vec<_>>();
    let sum = kernel.iter().sum::<f64>();
    for value in &mut kernel {
        *value /= sum;
    }
    kernel
}

fn convolve_axis(values: &[f64], size: usize, kernel: &[f64], axis: usize) -> Vec<f64> {
    let radius = kernel.len() / 2;
    let mut output = vec![0.0; values.len()];
    output
        .par_iter_mut()
        .enumerate()
        .for_each(|(pixel, output)| {
            let row = pixel / size;
            let column = pixel % size;
            let mut sum = 0.0;
            for (tap, &weight) in kernel.iter().enumerate() {
                let offset = isize::try_from(tap).expect("kernel index should fit isize")
                    - isize::try_from(radius).expect("kernel radius should fit isize");
                let (sample_row, sample_column) = if axis == 0 {
                    (reflect(row, offset, size), column)
                } else {
                    (row, reflect(column, offset, size))
                };
                sum = weight.mul_add(values[sample_row * size + sample_column], sum);
            }
            *output = sum;
        });
    output
}

#[inline]
fn reflect(index: usize, offset: isize, length: usize) -> usize {
    let length = isize::try_from(length).expect("grid size should fit isize");
    let index = isize::try_from(index).expect("grid index should fit isize") + offset;
    let period = 2 * length;
    let reflected = index.rem_euclid(period);
    usize::try_from(if reflected < length {
        reflected
    } else {
        period - 1 - reflected
    })
    .expect("reflected grid index should be non-negative")
}
