use std::env;

use chonky::{ChonkyError, pdf_segmentation};
use error_stack::{Report, ResultExt as _};

fn main() -> Result<(), Report<ChonkyError>> {
    // read file path arguments
    // TODO: implement with clap
    let args: Vec<String> = env::args().collect();

    let file_path = args.get(1).ok_or(ChonkyError::Arguments)?;

    let pdfium = chonky::link_pdfium()?;

    let pdf = pdf_segmentation::load_pdf(&pdfium, file_path).change_context(ChonkyError::Pdfium)?;

    let preprocessed_pdf =
        pdf_segmentation::pdf_to_images(&pdf).change_context(ChonkyError::Pdfium)?;
    //for now we will print all these images to a folder
    // this will be a seperate function in the future once knowledge about error-stack increases

    let output_folder = "./out";

    for (index, image) in preprocessed_pdf.iter().enumerate() {
        // Generate a unique filename for each page image
        let file_path = format!("{}/page_{}.png", output_folder, index + 1);

        // Save the image as a PNG file
        image.save(&file_path).change_context(ChonkyError::Write)?;
    }

    Ok(())
}
