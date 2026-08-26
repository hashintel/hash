//! Publishes a fitted classifier as one combined file and validates it on read.
//!
//! A fitted classifier publishes as one [`crate::file::classifier`] file, so the parameters that
//! predict together cannot fall out of sync. [`Classifier::from_artifact`] validates the domain
//! invariants once and copies the model into owned aligned storage: the model is kilobyte-scale, so
//! predictions run from resident parameters and no consumer holds the mapping.

use core::{error::Error, fmt};
use std::io;

use super::{Applicability, Classifier, Standardization};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    file::{
        WriteAs, WriteInto,
        classifier::{CLASSES, read::ClassifierFile, write::write_regions},
    },
    integrity::{Sha256, Sha256Digest, Writer},
    math::{BoxedDVecN, DNonNegative},
    salt::policy::GeometryClass,
};

#[cfg(test)]
mod tests;

// The file format pins the class count by layout version; the typed
// layer pins it to the class schema.
const _: () = assert!(CLASSES == GeometryClass::COUNT);

/// An opened classifier file does not hold a valid model.
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum InvalidClassifierFile {
    /// The model's dimension is not the card-embedding width.
    Dimension { dimension: u64 },
    /// A coefficient component is NaN or infinite.
    NonFiniteCoefficient {
        class: GeometryClass,
        component: usize,
    },
    /// An intercept is NaN or infinite.
    NonFiniteIntercept { class: GeometryClass },
    /// The calibration temperature is not strictly positive and finite.
    Temperature { value: f64 },
    /// An applicability mean component is NaN or infinite.
    NonFiniteMean { component: usize },
    /// An inverse scale is not strictly positive and finite.
    InverseScale { component: usize, value: f64 },
    /// The model holds no training distances to rank against.
    EmptyDistances,
    /// A training distance is NaN, infinite, or negative.
    Distance { index: usize, value: f64 },
    /// The training distances break the ascending order.
    UnorderedDistances { index: usize },
}

impl fmt::Display for InvalidClassifierFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Dimension { dimension } => write!(
                fmt,
                "the model's dimension {dimension} is not the {CANONICAL_DIMENSIONS}-component \
                 card-embedding width",
            ),
            Self::NonFiniteCoefficient { class, component } => write!(
                fmt,
                "the {class} coefficient at component {component} is not finite",
            ),
            Self::NonFiniteIntercept { class } => {
                write!(fmt, "the {class} intercept is not finite")
            }
            Self::Temperature { value } => write!(
                fmt,
                "the calibration temperature {value} is not strictly positive and finite",
            ),
            Self::NonFiniteMean { component } => write!(
                fmt,
                "the applicability mean at component {component} is not finite",
            ),
            Self::InverseScale { component, value } => write!(
                fmt,
                "the inverse scale {value} at component {component} is not strictly positive and \
                 finite",
            ),
            Self::EmptyDistances => {
                fmt.write_str("the model holds no training distances to rank against")
            }
            Self::Distance { index, value } => write!(
                fmt,
                "the training distance {value} at index {index} is NaN, infinite, or negative",
            ),
            Self::UnorderedDistances { index } => write!(
                fmt,
                "the training distance at index {index} breaks the ascending order",
            ),
        }
    }
}

impl Error for InvalidClassifierFile {}

impl Classifier {
    /// Reads a model out of its opened file, validating the domain invariants once.
    ///
    /// # Errors
    ///
    /// Returns an error when the file declares a foreign dimension, when a parameter is not finite,
    /// when a temperature or inverse scale is not positive, or when the training distances are
    /// empty, negative, or unordered.
    #[tracing::instrument(skip_all)]
    pub(crate) fn from_artifact(file: &ClassifierFile) -> Result<Self, InvalidClassifierFile> {
        if file.dimension() != CANONICAL_DIMENSIONS as u64 {
            return Err(InvalidClassifierFile::Dimension {
                dimension: file.dimension(),
            });
        }

        let (rows, remainder) = file.coefficients().as_chunks::<CANONICAL_DIMENSIONS>();
        debug_assert!(
            remainder.is_empty() && rows.len() == CLASSES,
            "the dimension check pins the region to whole class rows",
        );
        for (class, row) in GeometryClass::VARIANTS.into_iter().zip(rows) {
            if let Some(component) = row.iter().position(|value| !value.is_finite()) {
                return Err(InvalidClassifierFile::NonFiniteCoefficient { class, component });
            }
        }

        let intercepts = file.intercepts();
        for (class, value) in GeometryClass::VARIANTS.into_iter().zip(intercepts) {
            if !value.is_finite() {
                return Err(InvalidClassifierFile::NonFiniteIntercept { class });
            }
        }

        let temperature = file.temperature();
        if !temperature.is_finite() || temperature <= 0.0 {
            return Err(InvalidClassifierFile::Temperature { value: temperature });
        }

        let mean = file.mean();
        if let Some(component) = mean.iter().position(|value| !value.is_finite()) {
            return Err(InvalidClassifierFile::NonFiniteMean { component });
        }

        let inverse_scales = file.inverse_scales();
        for (component, &value) in inverse_scales.iter().enumerate() {
            if !value.is_finite() || value <= 0.0 {
                return Err(InvalidClassifierFile::InverseScale { component, value });
            }
        }

        let distances = file.distances();
        if distances.is_empty() {
            return Err(InvalidClassifierFile::EmptyDistances);
        }
        let distances: Box<[DNonNegative]> = distances
            .iter()
            .enumerate()
            .map(|(index, &value)| {
                DNonNegative::new(value).ok_or(InvalidClassifierFile::Distance { index, value })
            })
            .collect::<Result<_, _>>()?;

        if let Some(position) = distances
            .array_windows::<2>()
            .position(|[left, right]| left > right)
        {
            return Err(InvalidClassifierFile::UnorderedDistances {
                index: position + 1,
            });
        }

        let owned = |components: &[f64]| {
            let mut vector = BoxedDVecN::<CANONICAL_DIMENSIONS>::zero();
            vector.as_array_mut().copy_from_slice(components);
            vector
        };

        Ok(Self {
            coefficients: core::array::from_fn(|class| owned(&rows[class])),
            intercepts,
            temperature,
            applicability: Applicability {
                standardization: Standardization {
                    mean: owned(mean),
                    inverse_scales: owned(inverse_scales),
                },
                distances,
            },
        })
    }
}

impl WriteAs<crate::file::salt::artifact::Classifier> for Classifier {}

impl WriteInto for Classifier {
    type Error = io::Error;

    /// Writes the model as a classifier file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        let coefficients =
            core::array::from_fn(|class| self.coefficients[class].as_array().as_slice());
        write_regions(
            self.temperature,
            self.intercepts,
            coefficients,
            self.applicability.standardization.mean.as_array(),
            self.applicability.standardization.inverse_scales.as_array(),
            DNonNegative::slice_as_raw(&self.applicability.distances),
            &mut writer,
        )?;

        Ok(writer.accumulator.finalize())
    }
}
