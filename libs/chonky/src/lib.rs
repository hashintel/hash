#![doc = include_str!("../README.md")]

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

pub mod pdf_segmentation {
    use error_stack::{Report, ResultExt};
    use image::DynamicImage;
    use pdfium_render::prelude::*;

    use crate::ChonkyError;

    /// Function to read the pdf
    ///
    /// # Errors
    ///
    /// Will return `Err` if `filename` does not exist or the user does not have
    /// permission to read it.
    pub fn load_pdf<'a>(
        pdfium: &'a Pdfium,
        file_path: &str,
    ) -> Result<PdfDocument<'a>, Report<ChonkyError>> {
        pdfium
            .load_pdf_from_file(file_path, None)
            .map_err(|err| Report::new(err).change_context(ChonkyError::Pdfium))
    }

    /// Takes in a pdf document and returns a vector list where each page
    /// is processed into a raw image that can be later converted to any image format
    ///
    /// # Errors
    /// Return an `PdfiumError::ImageError` if there was a problem with the image processing
    /// operation, occurs when image cannot be encoded into specific image format
    pub fn pdf_to_images(pdf: &PdfDocument) -> Result<Vec<DynamicImage>, Report<ChonkyError>> {
        let mut images: Vec<DynamicImage> = Vec::new();

        for page in pdf.pages().iter() {
            //may adjust resolution depending on need
            let resolution_width = 1000;

            // Render the entire page to an image
            let rendered_page = page
                .render_with_config(&PdfRenderConfig::new().set_target_width(resolution_width))
                .change_context(ChonkyError::Pdfium)?; // Renders the page to a PdfBitmap

            // Convert PdfBitmap to DynamicImage
            let dynamic_image = rendered_page.as_image();
            images.push(dynamic_image);
        }

        Ok(images)
    }
}

#[cfg(test)]
mod tests {
    use error_stack::{Report, ResultExt};
    use pdfium_render::prelude::*;

    use super::*;

    #[test]
    fn pdf_load_success() -> Result<(), Report<ChonkyError>> {
        let pdfium = Pdfium::new(
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./libs/"))
                .change_context(ChonkyError::Pdfium)?,
        );

        let test_pdf_string = "tests/docs/test-doc.pdf";

        let _pdf = pdf_segmentation::load_pdf(&pdfium, test_pdf_string)
            .change_context(ChonkyError::Pdfium)?;

        Ok(())
    }

    #[test]
    fn pdf_load_failure() -> Result<(), Report<ChonkyError>> {
        let pdfium = Pdfium::new(
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./libs/"))
                .change_context(ChonkyError::Pdfium)?,
        );

        let test_pdf_string = "tests/docs/invalid.pdf";

        // Should return an error when loading an invalid PDF
        let result = pdf_segmentation::load_pdf(&pdfium, test_pdf_string)
            .change_context(ChonkyError::Pdfium);

        if result.is_err() {
            // Expected failure, return Ok
            Ok(())
        } else {
            // Unexpected success, return an error
            Err(Report::new(ChonkyError::Pdfium).attach_printable("Expected load_pdf to fail"))
        }
    }

    #[test]
    fn pdf_image_conversion() -> Result<(), Report<ChonkyError>> {
        //create the pdfium instance and bind to library
        let pdfium = Pdfium::new(
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./libs/"))
                .change_context(ChonkyError::Pdfium)?,
        );

        let test_pdf_string = "tests/docs/test-doc.pdf";

        let pdf = pdf_segmentation::load_pdf(&pdfium, test_pdf_string)
            .change_context(ChonkyError::Pdfium)?;

        let preprocessed_pdf =
            pdf_segmentation::pdf_to_images(&pdf).change_context(ChonkyError::Pdfium)?;

        let num_pages: usize = pdf.pages().len().into(); //number of pages of pdf

        match preprocessed_pdf.len() {
            x if x == num_pages => Ok(()),
            _ => Err(Report::new(ChonkyError::Pdfium)
                .attach_printable("The length of vector should be number of pages")),
        }
    }
}
