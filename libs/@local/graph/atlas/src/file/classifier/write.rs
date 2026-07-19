//! Streaming classifier-file writer.

use std::io;

use zerocopy::IntoBytes as _;

use super::{CLASSES, FileHeader};

/// Streams the model regions as a classifier file.
///
/// `coefficients` holds one `f64[D]` row per class in class order,
/// `mean` and `inverse_scales` the applicability moments, and
/// `distances` the sorted training distances; the header records the
/// dimension `D = mean.len()`, the distance count, and the scalar
/// parameters verbatim. Every region streams in file order behind the
/// header; wrap a raw [`File`](std::fs::File) in a
/// [`BufWriter`](io::BufWriter) when the regions are small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// Panics when the regions disagree on the dimension, which no file
/// geometry can represent.
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

    // A resident model's geometry fits u64; the checked equations exist
    // for parsing foreign headers.
    let mean_offset = header
        .mean_offset()
        .expect("a resident model's geometry fits u64");
    let inverse_scales_offset = header
        .inverse_scales_offset()
        .expect("a resident model's geometry fits u64");
    let distances_offset = header
        .distances_offset()
        .expect("a resident model's geometry fits u64");

    let vector_bytes = size_of_val(mean) as u64;
    let coefficients_padding =
        mean_offset - FileHeader::SIZE as u64 - CLASSES as u64 * vector_bytes;
    let mean_padding = inverse_scales_offset - mean_offset - vector_bytes;
    let inverse_scales_padding = distances_offset - inverse_scales_offset - vector_bytes;
    let zeros = [0_u8; FileHeader::SIZE];
    let padding = |bytes: u64| &zeros[..usize::try_from(bytes).expect("padding stays below 4096")];

    write.write_all(header.as_bytes())?;
    for row in coefficients {
        write.write_all(row.as_bytes())?;
    }
    write.write_all(padding(coefficients_padding))?;
    write.write_all(mean.as_bytes())?;
    write.write_all(padding(mean_padding))?;
    write.write_all(inverse_scales.as_bytes())?;
    write.write_all(padding(inverse_scales_padding))?;
    write.write_all(distances.as_bytes())?;

    Ok(())
}
