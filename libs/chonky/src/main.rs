use std::env;

use chonky::{
    ChonkyError, create_document_embedding,
    embedding::multi_modal_embedding::{add_structural_embedding, make_multimodal_api_request},
    pdf_segmentation,
};
use error_stack::{Report, ResultExt as _, ensure};

fn main() -> Result<(), Report<ChonkyError>> {
    // read file path arguments
    // TODO: implement with clap
    let args: Vec<String> = env::args().collect();

    ensure!(args.len() > 1, ChonkyError::Arguments);

    let pdfium = chonky::link_pdfium()?;

    let pdf = pdf_segmentation::load_pdf(&pdfium, &args[1]).change_context(ChonkyError::Pdfium)?;

    let preprocessed_pdf =
        pdf_segmentation::pdf_to_images(&pdf).change_context(ChonkyError::Pdfium)?;

    let output_folder = "./out";

    let mut document_embeddings = create_document_embedding();

    for (index, image) in preprocessed_pdf.iter().enumerate() {
        // Generate a unique filename for each page image
        let file_path = format!("{}/page_{}.png", output_folder, index + 1);

        // Save the image as a PNG file
        image
            .save(&file_path)
            .change_context(ChonkyError::ImageError)?;

        //collect project_id environment variable
        let project_id =
            std::env::var("GOOGLE_PROJECT_ID").change_context(ChonkyError::VertexAPI)?;

        //process image embedding
        let embedding = make_multimodal_api_request(&project_id, &file_path)?;

        add_structural_embedding(
            &mut document_embeddings,
            index + 1,
            file_path.clone(),
            embedding,
        );
    }

    Ok(())
}
