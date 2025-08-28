#![cfg_attr(doc, doc = include_str!("../README.md"))]

extern crate alloc;

#[cfg(not(feature = "static"))]
use alloc::borrow::Cow;
#[cfg(not(feature = "static"))]
use std::{env, path::Path};

use error_stack::{Report, ResultExt as _};
use pdfium_render::prelude::Pdfium;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ChonkyError {
    #[error("parsing error in pdf")]
    ReadPdf,
    #[error("pdfium error")]
    Pdfium,
    #[error("write error to system")]
    Write,
    #[error("Issues with CLI input")]
    Arguments,
}

/// Attempts to link to the `PDFium` library.
///
/// ## Loading strategy
///
/// - if the `static` feature is enabled, it will attempt to statically link to the `PDFium`
///   library.
/// - Otherwise, it will use the `PDFIUM_DYNAMIC_LIB_PATH` environment variable to load the dynamic
///   library from the specific path. If the environment variable is not set, it will attempt to
///   load the dynamic library from the default path `./libs/`.
///
/// # Errors
///
/// Will return a [`ChonkyError::Pdfium`] if the `PDFium` library could not be loaded.
pub fn link_pdfium() -> Result<Pdfium, Report<ChonkyError>> {
    #[cfg(feature = "static")]
    return Ok(Pdfium::new(
        Pdfium::bind_to_statically_linked_library().change_context(ChonkyError::Pdfium)?,
    ));

    #[cfg(not(feature = "static"))]
    {
        let lib_path = env::var("PDFIUM_DYNAMIC_LIB_PATH")
            .map_or_else(|_| Cow::Borrowed("./libs/"), Cow::Owned);

        let lib_path = Path::new(lib_path.as_ref())
            .canonicalize()
            .change_context(ChonkyError::Pdfium)
            .attach_lazy(|| format!("could not canonicalize path `{lib_path}`"))?;
        Ok(Pdfium::new(
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&lib_path))
                .change_context(ChonkyError::Pdfium)?,
        ))
    }
}

pub mod pdf_segmentation {
    use error_stack::{Report, ResultExt as _};
    use image::{DynamicImage, GrayImage, RgbaImage};
    use pdfium_render::prelude::{
        PdfBitmap, PdfBitmapFormat, PdfDocument, PdfPoints, PdfRenderConfig, Pdfium,
    };

    use crate::ChonkyError;

    /// Function to read the pdf
    ///
    /// # Errors
    ///
    /// Will return [`ChonkyError::Pdfium`] if `filename` does not exist or the user does not have
    /// permission to read it.
    pub fn load_pdf<'a>(
        pdfium: &'a Pdfium,
        file_path: &str,
    ) -> Result<PdfDocument<'a>, Report<ChonkyError>> {
        pdfium
            .load_pdf_from_file(file_path, None)
            .map_err(|err| Report::new(err).change_context(ChonkyError::Pdfium))
    }

    // /// TODO: This function returns the extracted text that is segmented in proper reading order
    // and /// grouped by boundaries such as newline spacing and other layout information,
    // segments can /// contain texts with different formatting (such as a sentence with a
    // **bold** inside) ///
    // /// #Errors
    // ///
    // /// TBD
    //pub fn extract_text(pdf: &PdfDocument) -> () {}

    // /// TODO: Given a list of segments of a PDF this function reads the segments via the bounding
    // /// box order, with the naive approach of top→bottom (and if same top then left→right) and
    // /// returns a sorted vector of reading order of segments
    // ///
    // /// #Errors
    // ///
    // /// TBD
    //fn obtain_reading_order(segments: Vec<segment>) -> () {}

    // /// TODO: Function returns a smaller segment vector by grouping segments in similar chunks,
    // but /// have different style formatting The new vector stores this information seperately
    // ///
    // /// #Errors
    // ///
    // /// TBD
    //fn group_similar_segments() -> () {}

    /// Takes in a pdf document and returns a vector list where each page
    /// is processed into a raw image that can be later converted to any image format
    ///
    /// # Errors
    ///
    /// Return an [`ChonkyError::Pdfium`]  if there was a
    /// problem with the image processing operation, occurs when image cannot be encoded into
    /// specific image format
    pub fn pdf_to_images(pdf: &PdfDocument) -> Result<Vec<DynamicImage>, Report<ChonkyError>> {
        let mut images: Vec<DynamicImage> = Vec::new();

        //may adjust resolution depending on need
        let resolution_width = 1000;

        // information about how to store image, like pixed resolution and aspect ratio
        let config = PdfRenderConfig::new().set_target_width(resolution_width);

        let mut bitmap = create_empty_bitmap(pdf, &config)?;

        for page in pdf.pages().iter() {
            // Render the entire page to a bitmap
            page.render_into_bitmap_with_config(&mut bitmap, &config)
                .change_context(ChonkyError::Pdfium)?;

            // Convert PdfBitmap to DynamicImage
            let dynamic_image = as_image(&bitmap)?;
            images.push(dynamic_image);
        }

        Ok(images)
    }

    /// Takes in a config with desired resolution of image and a pdf and creates
    /// an empty bitmap that can be used by the entire pdf
    ///
    /// # Errors
    ///
    /// Return an [`ChonkyError::Pdfium`] if there was a problem
    /// with converting the pdfs dimensions to pixels
    fn create_empty_bitmap<'a>(
        pdf: &'a PdfDocument,
        config: &'a PdfRenderConfig,
    ) -> Result<PdfBitmap<'a>, Report<ChonkyError>> {
        // read the first page to get page dimesnions
        let page_dimensions = *pdf
            .pages()
            .page_sizes()
            .change_context(ChonkyError::Pdfium)?
            .first()
            .ok_or(ChonkyError::Pdfium)?;

        let page = pdf.pages().get(0).change_context(ChonkyError::Pdfium)?;

        //converts the boundings boxes to pixels that can be used for creating bitmap with proper
        // for correct bitmap dimensions, height point must be set to 0 to get max pixel height
        let page_dimensions = pdf
            .pages()
            .get(0)
            .change_context(ChonkyError::Pdfium)?
            .points_to_pixels(page_dimensions.width(), PdfPoints::new(0.0), config)
            .change_context(ChonkyError::Pdfium)?;

        // some pdfs have dimensions that are larger than the actual "content" resulting in negative
        // dimensions we aim to get the "net" dimensions by subtracting the 0.0 point pixel
        // conversion from the height and width
        let base_page_dimensions = page
            .points_to_pixels(PdfPoints::new(0.0), page.height(), config)
            .change_context(ChonkyError::Pdfium)?;

        let page_dimensions = (
            page_dimensions.0 - base_page_dimensions.0,
            page_dimensions.1 - base_page_dimensions.1,
        );

        //create an empty bitmap that follows dimensions of pdf
        // to prevent repeated memory allocations (we assume all pdfs are same dimension)
        let bitmap = PdfBitmap::empty(
            page_dimensions.0,
            page_dimensions.1,
            PdfBitmapFormat::BGRA,
            pdf.bindings(),
        )
        .change_context(ChonkyError::Pdfium)?;

        Ok(bitmap)
    }

    ///A vendored function from pdfium-render's `as_image` function that returns a result instead
    /// of panicking
    ///
    /// Errors#
    ///
    /// [`ChonkyError::Pdfium`] when the image had an error being processed
    fn as_image(bitmap: &PdfBitmap) -> Result<DynamicImage, Report<ChonkyError>> {
        let bytes = bitmap.as_rgba_bytes();

        // clippy complains if we directly cast into u32 from i32 because of sign loss
        // since we assume dimensions must be positive this is not as issue
        let width = u32::try_from(bitmap.width()).change_context(ChonkyError::Pdfium)?;

        let height = u32::try_from(bitmap.height()).change_context(ChonkyError::Pdfium)?;

        Ok(match bitmap.format().map_err(|_foo| ChonkyError::Pdfium)? {
            PdfBitmapFormat::BGRA | PdfBitmapFormat::BGRx | PdfBitmapFormat::BGR => {
                RgbaImage::from_raw(width, height, bytes)
                    .map(DynamicImage::ImageRgba8)
                    .ok_or(ChonkyError::Pdfium)?
            }
            PdfBitmapFormat::Gray => GrayImage::from_raw(width, height, bytes)
                .map(DynamicImage::ImageLuma8)
                .ok_or(ChonkyError::Pdfium)?,
            _ => return Err(Report::new(ChonkyError::Pdfium)),
        })
    }
}

#[cfg(test)]
mod tests {
    use error_stack::{Report, ResultExt as _};
    use insta::assert_binary_snapshot;

    use super::*;

    #[test]
    fn pdf_load_success() -> Result<(), Report<ChonkyError>> {
        let pdfium = link_pdfium()?;

        let test_pdf_string = "tests/docs/test-doc.pdf";

        let _pdf = pdf_segmentation::load_pdf(&pdfium, test_pdf_string)
            .change_context(ChonkyError::Pdfium)?;

        Ok(())
    }

    #[test]
    fn pdf_load_failure() -> Result<(), Report<ChonkyError>> {
        let pdfium = link_pdfium()?;

        let test_pdf_string = "tests/docs/invalid.pdf";

        // Should return an error when loading an invalid PDF
        let result = pdf_segmentation::load_pdf(&pdfium, test_pdf_string)
            .change_context(ChonkyError::Pdfium);

        if result.is_err() {
            // Expected failure, return Ok
            Ok(())
        } else {
            // Unexpected success, return an error
            Err(Report::new(ChonkyError::Pdfium).attach("Expected load_pdf to fail"))
        }
    }

    #[test]
    fn pdf_image_conversion() -> Result<(), Report<ChonkyError>> {
        let pdfium = link_pdfium()?;

        let test_pdf_string = "tests/docs/test-doc.pdf";

        let pdf = pdf_segmentation::load_pdf(&pdfium, test_pdf_string)
            .change_context(ChonkyError::Pdfium)?;

        //number of pages of pdf
        let num_pages: usize = pdf.pages().len().into();

        let preprocessed_pdf =
            pdf_segmentation::pdf_to_images(&pdf).change_context(ChonkyError::Pdfium)?;

        //start by checking if proper amount of images are converted

        if preprocessed_pdf.len() != num_pages {
            return Err(Report::new(ChonkyError::Pdfium)
                .attach("The length of vector should be number of pages"));
        }

        // now check if the image contents are the same using insta snapshots
        // start by converting images to binary
        // let preprocessed_pdf: Vec<Vec<u8>> = preprocessed_pdf
        //     .into_iter()
        //     .map(image::DynamicImage::into_bytes)
        //     .collect();

        // we only really need to check the first three pages
        for (index, page) in preprocessed_pdf.into_iter().enumerate().take(3) {
            let mut buffer = Vec::new();
            let encoder = image::codecs::bmp::BmpEncoder::new(&mut buffer);

            page.write_with_encoder(encoder)
                .expect("image should be able to be encoded into a bitmap");
            assert_binary_snapshot!(format!("page_{}.bmp", index + 1).as_str(), buffer);
        }

        Ok(())
    }
}
