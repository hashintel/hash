use std::path::PathBuf;

use base64::{Engine as _, engine::general_purpose};
use error_stack::{Report, ResultExt as _};
use reqwest::{
    Client,
    header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue},
};
use serde_json::{Value as JsonValue, json};

use crate::{
    ChonkyError, DocumentEmbeddings, Embedding, ImageEmbedding, PageImageObjects,
    PageImageObjectsEmbeddings, StructuralEmbedding, StructuralMetadata,
    pdf_segmentation::ExtractedTable,
};

fn get_vertex_access_token() -> Result<String, Report<ChonkyError>> {
    Ok(String::from_utf8(
        std::process::Command::new("gcloud")
            .args(["auth", "print-access-token"])
            .output()
            .change_context(ChonkyError::VertexAPI)
            .attach_printable("Issues getting the Google Cloud Auth Token")?
            .stdout,
    )
    .change_context(ChonkyError::VertexAPI)?
    .trim()
    .to_owned())
}

fn base64_json(image_data: Vec<u8>) -> JsonValue {
    let base64_encoded_img = general_purpose::STANDARD.encode(image_data);

    json!({
        "instances": [
            {
                "image": {
                    "bytesBase64Encoded": base64_encoded_img
                }
            }
        ]
    })
}

fn text_json(text: &[String]) -> JsonValue {
    //merge all text into one without seperator for now
    let mut text = text.concat();
    text.truncate(1000);
    json!({
        "instances": [
            {
                "text": text
            }
        ]
    })
}

/// Given the extracted images from the pdf, embeds them
///
/// # Errors
///
/// [`ChonkyError::VertexAPI`] when there are HTTP request errors
pub async fn embed_pdf_object_images(
    pdf_image_extract: Vec<PageImageObjects>,
    project_id: &str,
) -> Result<Vec<PageImageObjectsEmbeddings>, Report<ChonkyError>> {
    let mut embeddings = Vec::new();
    for page_images in pdf_image_extract {
        embeddings.push(PageImageObjectsEmbeddings {
            _embeddings: embed_screenshots(page_images, project_id).await?,
        });
    }
    Ok(embeddings)
}

/// Given the screenshot of each page in pdf return its embeddings
///
/// # Errors
///
/// [`ChonkyError::VertexAPI`] when there are HTTP request errors
pub async fn embed_screenshots(
    pdf_image_extract: PageImageObjects,
    project_id: &str,
) -> Result<Vec<ImageEmbedding>, Report<ChonkyError>> {
    let mut embeddings = Vec::new();
    for image in pdf_image_extract.page_image_objects {
        let mut buffer = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut buffer);

        image
            .write_with_encoder(encoder)
            .change_context(ChonkyError::ImageError)?;

        // at this point we are transfering ownership of images, cannot use reference without
        // cloning?
        embeddings.push(ImageEmbedding {
            embedding: Embedding {
                _model_used: "Google Multimodal Embeddings".to_owned(),
                embedding_vector: make_multimodal_api_request(
                    project_id,
                    Some(image.clone().into_bytes()),
                    None,
                )
                .await?,
            },
            _image: image,
        });
    }
    Ok(embeddings)
}

/// Given the tables on each page of the pdf, embeds each pages tables seperately into a vector
/// for each page
///
/// # Errors
///
/// [`ChonkyError::VertexAPI`] when there are HTTP request errors
pub async fn embed_tables(
    pdf_table_bounds: Vec<Vec<ExtractedTable>>,
    project_id: &str,
) -> Result<Vec<Vec<Vec<f64>>>, Report<ChonkyError>> {
    let mut embeddings = Vec::new();
    for page_tables in pdf_table_bounds {
        let mut page_embeddings: Vec<Vec<f64>> = Vec::new();
        for table in page_tables {
            let mut buffer = Vec::new();
            let encoder = image::codecs::png::PngEncoder::new(&mut buffer);

            table
                .image
                .write_with_encoder(encoder)
                .change_context(ChonkyError::ImageError)?;

            page_embeddings
                .push(make_multimodal_api_request(project_id, Some(buffer), None).await?);
        }
        embeddings.push(page_embeddings);
    }
    Ok(embeddings)
}

/// Given the text on each page of the pdf, embeds each pages text seperately into a vector
///
/// # Errors
///
/// [`ChonkyError::VertexAPI`] when there are HTTP request errors
pub async fn embed_text(
    pdf_text_extract: Vec<Vec<String>>,
    project_id: &str,
) -> Result<Vec<Vec<f64>>, Report<ChonkyError>> {
    let mut embeddings = Vec::new();
    for page_text in pdf_text_extract {
        embeddings.push(make_multimodal_api_request(project_id, None, Some(page_text)).await?);
    }
    Ok(embeddings)
}

/// A function that performs authentication with Google Vertex API and performs
/// a curl request to obtain multimodal embeddings given an image path
///
/// # Errors
///
/// [`ChonkyError::VertexAPI`] when there are HTTP request errors
/// [`ChonkyError::ImageError`] when there are errors converting to base64 encoding
pub async fn make_multimodal_api_request(
    project_id: &str,
    image_data: Option<Vec<u8>>,
    text_data: Option<Vec<String>>,
) -> Result<Vec<f64>, Report<ChonkyError>> {
    let url = format!(
        "https://us-central1-aiplatform.googleapis.com/v1/projects/{project_id}/locations/us-central1/publishers/google/models/multimodalembedding@001:predict"
    );

    let access_token = get_vertex_access_token()?; // assuming this function is synchronous

    // Create the reqwest async client
    let client = Client::new();

    // Prepare headers
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {access_token}"))
            .change_context(ChonkyError::VertexAPI)?,
    );
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );

    // Prepare payload make sure its initialized
    let mut payload = json!(null);
    if let Some(image_payload) = image_data {
        payload = base64_json(image_payload);
    } else if let Some(text_payload) = text_data {
        payload = text_json(&text_payload);
    }

    // Make the POST request
    let response = client
        .post(&url)
        .headers(headers)
        .body(payload.to_string())
        .send()
        .await
        .change_context(ChonkyError::VertexAPI)
        .attach_printable("Failed to build post request for Vertex API")?;

    // Check the response status
    if !response.status().is_success() {
        return Err(
            Report::new(ChonkyError::VertexAPI).attach_printable(format!(
                "Received the error code {} in the response status",
                response.status()
            )),
        );
    }

    // Read and process the response
    let response_text = response
        .json()
        .await
        .change_context(ChonkyError::VertexAPI)?;

    extract_embedding(&response_text)
}

// Parses the response to extract the image or text embedding vector
fn extract_embedding(response: &JsonValue) -> Result<Vec<f64>, Report<ChonkyError>> {
    let prediction = response
        .as_object()
        .and_then(|obj| obj.get("predictions"))
        .and_then(JsonValue::as_array)
        .and_then(|arr| arr.first())
        .ok_or_else(|| Report::new(ChonkyError::VertexAPI))
        .attach_printable("Unexpected response format")?;

    let embedding = match (
        prediction.get("imageEmbedding"),
        prediction.get("textEmbedding"),
    ) {
        (Some(embedding), None) | (None, Some(embedding)) => embedding
            .as_array()
            .ok_or(ChonkyError::VertexAPI)
            .attach_printable("Unexpected response format")?,
        (None, None) => {
            return Err(ChonkyError::VertexAPI).attach_printable("No embedding found in response");
        }
        (Some(_), Some(_)) => {
            return Err(ChonkyError::VertexAPI)
                .attach_printable("Embedding found in both image and text fields");
        }
    };
    embedding
        .iter()
        .map(|x| {
            x.as_f64()
                .ok_or_else(|| Report::new(ChonkyError::VertexAPI))
        })
        .collect()
}

pub fn add_structural_embedding(
    document_embeddings: &mut DocumentEmbeddings,
    page_number: usize,
    file_path: PathBuf,
    embedding_vector: Vec<f64>,
) {
    let structural_metadata = StructuralMetadata {
        _page_number: page_number,
        _image_path: file_path,
    };

    let embedding = Embedding {
        _model_used: "VertexAPIMultiModalEmbeddings".to_owned(),
        embedding_vector,
    };

    let structural_embedding = StructuralEmbedding {
        _metadata: structural_metadata,
        _embedding: embedding,
    };

    document_embeddings
        .structural_embeddings
        .push(structural_embedding);
}

#[cfg(test)]
mod tests {
    use insta::{assert_binary_snapshot, assert_snapshot};
    use tokio::fs;

    use super::*;
    use crate::create_document_embedding;

    #[tokio::test]
    async fn base64_conversion() -> Result<(), Report<ChonkyError>> {
        let test_path = PathBuf::from("./tests/docs/page_1.png");
        let image_data: Vec<u8> = fs::read(test_path)
            .await
            .change_context(ChonkyError::ImageError)?;
        // source of truth found by decoding base64 encoding to get same image
        assert_binary_snapshot!("page_1.json", base64_json(image_data).to_string().into());
        Ok(())
    }

    #[tokio::test]
    async fn image_embedding() -> Result<(), Report<ChonkyError>> {
        //since embeddings are nondeterminatic they vary slightly
        //thus a good way to test is to check if cosine similarity close to 1

        let test_image_path = PathBuf::from("./tests/docs/page_1.png");

        let test_json_path = PathBuf::from("./src/snapshots/google_test_embedding_page_1.json");

        let source_embedding = extract_embedding(
            &serde_json::from_slice(
                &fs::read(test_json_path)
                    .await
                    .change_context(ChonkyError::ImageError)?,
            )
            .change_context(ChonkyError::ImageError)?,
        )?;

        let image_data: Vec<u8> = fs::read(test_image_path)
            .await
            .change_context(ChonkyError::ImageError)?;

        let test_embedding =
            make_multimodal_api_request("hash-embed", Some(image_data), None).await?;

        //find cosine similarity of vectors

        let mut dot_prod: f64 = 0.0;
        let mut source_mag: f64 = 0.0;
        let mut test_mag: f64 = 0.0;

        for index in 0..test_embedding.len() {
            dot_prod += source_embedding[index] * test_embedding[index];
            source_mag += source_embedding[index] * source_embedding[index];
            test_mag += test_embedding[index] * test_embedding[index];
        }

        let similarity = dot_prod / (test_mag.sqrt() * source_mag.sqrt());

        let expected_similarity_threshold = 0.999;

        if similarity >= expected_similarity_threshold {
            Ok(())
        } else {
            Err(Report::new(ChonkyError::Pdfium).attach_printable(format!(
                "Cosine similarity is lower than expected: got {similarity}, expected at least \
                 {expected_similarity_threshold}"
            )))
        }
    }

    #[test]
    fn create_embedding_data() {
        let mut document_embeddings = create_document_embedding();

        add_structural_embedding(
            &mut document_embeddings,
            1,
            PathBuf::from("test/path"),
            vec![0.1, 0.2, 0.3],
        );
        assert_snapshot!(format!("{:?}", document_embeddings));
    }
}
