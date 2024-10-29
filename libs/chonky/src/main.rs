use std::env;
use chonky::*;
use pdfium_render::prelude::*;
use error_stack::Report;

fn main() -> Result<(), Report<PdfiumError>>{
    let args: Vec<String> = env::args().collect();// read file path arguments

    if args.len() < 2 {
        panic!("Path to PDF not inputted")
    }

    let pdfium = Pdfium::new(
        Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./libs/")).unwrap()
    ); // creates instance so must be global

    let pdf = load_pdf(&pdfium, &args[1])?;

    let preprocessed_pdf = pdf_to_images(&pdf)?;

    //for now we will print all these images to a folder
    // this will be a seperate function in the future once knowledge about error-stack increases

    let output_folder = "./out";

    for (index, image) in preprocessed_pdf.iter().enumerate() {
        // Generate a unique filename for each page image
        let file_path = format!("{}/page_{}.png", output_folder, index + 1);
        
        // Save the image as a PNG file
        image.save(&file_path).unwrap();
    }

    Ok(())
}