#![doc = include_str!("../README.md")]

use image::DynamicImage;
use pdfium_render::prelude::*;

use error_stack::Report;


pub fn load_pdf<'a>(pdfium: &'a Pdfium, file_path: &str)-> Result<PdfDocument<'a>, Report<PdfiumError>>{
    let pdf = pdfium
        .load_pdf_from_file(file_path, None)?;
    Ok(pdf)
}

/// Takes in a pdf document and returns a vector list where each page
/// is processed into a raw image that can be later converted to any image format
///
#[must_use]
pub fn pdf_to_images(pdf: &PdfDocument) -> Result<Vec<DynamicImage>,Report<PdfiumError>>{
    let mut images: Vec<DynamicImage> = Vec::new();

    for page in pdf.pages().iter() {

        let resolution_width = 1000; //may adjust resolution depending on need

        // Render the entire page to an image
        let rendered_page = page
            .render_with_config(
                &PdfRenderConfig::new()
                    .set_target_width(resolution_width),
                )?; // Renders the page to a PdfBitmap

        // Convert PdfBitmap to DynamicImage
        let dynamic_image = rendered_page.as_image();
        images.push(dynamic_image);
    }

    Ok(images)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_load_success() {
        let pdfium = Pdfium::new(
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./libs/")).unwrap()
        ); // creates instance so must be global

        let test_pdf_string = "tests/docs/test-doc.pdf";

        let pdf = load_pdf(&pdfium, test_pdf_string);
    
        assert!(pdf.is_ok());
    }

    #[test]
    fn pdf_load_failure() {
        let pdfium = Pdfium::new(
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./libs/")).unwrap()
        ); // creates instance so must be global

        let test_pdf_string = "tests/docs/invalid.pdf";

        let pdf = load_pdf(&pdfium, test_pdf_string);
    
        assert!(pdf.is_err());
    }

    #[test]
    fn pdf_image_conversion() {
        let pdfium = Pdfium::new(
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./libs/")).unwrap()
        ); // creates instance so must be global

        let test_pdf_string =  "tests/docs/test-doc.pdf";

        let pdf = load_pdf(&pdfium, test_pdf_string).unwrap();

        let preprocessed_pdf = pdf_to_images(&pdf).unwrap();

        let num_pages = 38; //number of pages of pdf

        assert_eq!(preprocessed_pdf.len(), num_pages) //length of vector should be number of pages
        
    }

}
