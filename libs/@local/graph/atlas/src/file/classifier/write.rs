//! Streaming classifier-file writer.

use std::io;

use zerocopy::IntoBytes as _;

use super::{CLASSES, FileHeader, PaddedFileHeader};
use crate::file::region::{write_padding, write_region};

/// Streams the model regions as a classifier file.
///
/// `coefficients` holds one `f64[D]` row per class in class order, `mean` and `inverse_scales` the
/// applicability moments, and `distances` the sorted training distances; the header records the
/// dimension `D = mean.len()`, the distance count, and the scalar parameters verbatim. Every region
/// streams in file order behind the header; wrap a raw [`File`](std::fs::File) in a
/// [`BufWriter`](io::BufWriter) when the regions are small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// This panics when the regions disagree on the dimension, which no file geometry can represent.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; disagreeing regions are a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_regions(
    temperature: f64,
    intercepts: [f64; CLASSES],
    coefficients: [&[f64]; CLASSES],
    mean: &[f64],
    inverse_scales: &[f64],
    distances: &[f64],
    mut write: impl io::Write,
) -> io::Result<()> {
    let dimension = mean.len();
    assert!(
        coefficients.iter().all(|row| row.len() == dimension),
        "one coefficient row component per dimension",
    );
    assert_eq!(
        inverse_scales.len(),
        dimension,
        "one inverse scale per dimension",
    );

    let header = FileHeader::new(
        dimension as u64,
        distances.len() as u64,
        temperature,
        intercepts,
    );

    let vector_bytes = size_of_val(mean) as u64;

    write.write_all(PaddedFileHeader::new(header).as_bytes())?;
    for row in coefficients {
        write.write_all(row.as_bytes())?;
    }
    write_padding(&mut write, CLASSES as u64 * vector_bytes)?;
    write_region(&mut write, mean.as_bytes())?;
    write_region(&mut write, inverse_scales.as_bytes())?;
    write.write_all(distances.as_bytes())?;

    Ok(())
}
