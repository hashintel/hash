use chonky::{
    ChonkyError, create_document_embedding,
    multi_modal_embedding::{add_structural_embedding, embed_screenshots},
    pdf_segmentation::{self, embed_pdf},
};
use clap::Parser;
use error_stack::{Report, ResultExt as _};

#[derive(Parser)]
struct CliArgs {
    /// Path to the PDF file
    pdf_path: String,
}

#[tokio::main]
async fn main() -> Result<(), Report<ChonkyError>> {
    // read file path arguments
    let args = CliArgs::parse();

    let pdfium = chonky::link_pdfium()?;

    let pdf =
        pdf_segmentation::load_pdf(&pdfium, &args.pdf_path).change_context(ChonkyError::Pdfium)?;

    let preprocessed_pdf =
        pdf_segmentation::pdf_to_images(&pdf).change_context(ChonkyError::Pdfium)?;

    let output_folder = "./out";

    let mut document_embeddings = create_document_embedding();

    let mut images = Vec::new();

    let project_id = std::env::var("GOOGLE_PROJECT_ID").change_context(ChonkyError::VertexAPI)?;

    for (index, image) in preprocessed_pdf.iter().enumerate() {
        // Generate a unique filename for each page image
        let file_path = format!("{}/page_{}.png", output_folder, index + 1);

        // Save the image as a PNG file
        image
            .save(&file_path)
            .change_context(ChonkyError::ImageError)?;

        images.push(file_path);
    }

    let doc_screenshots = embed_screenshots(preprocessed_pdf, &project_id).await?;

    for (index, screenshot) in doc_screenshots.into_iter().enumerate() {
        add_structural_embedding(
            &mut document_embeddings,
            index + 1,
            format!("{}/page_{}.png", output_folder, index + 1),
            screenshot,
        );
    }

    embed_pdf(&pdf, &images, &mut document_embeddings)
        .await
        .change_context(ChonkyError::Pdfium)?;

    //dbg!("{:?}", document_embeddings);
    Ok(())
}
