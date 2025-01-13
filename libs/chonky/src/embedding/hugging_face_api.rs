use std::path::Path;

use error_stack::{Report, ResultExt as _};
use reqwest::{
    Client,
    header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue},
};
use serde::Deserialize;
use tokio::fs;

use crate::ChonkyError;

#[derive(Deserialize, Debug)]
pub struct BoundingBox {
    pub xmin: f32,
    pub ymin: f32,
    pub xmax: f32,
    pub ymax: f32,
}

#[derive(Deserialize, Debug)]
pub struct TablePrediction {
    pub score: f32,
    #[serde(rename = "box")]
    pub bounding_box: BoundingBox,
}

//for now just have it as environment variable
fn get_hugging_face_token() -> Result<String, Report<ChonkyError>> {
    std::env::var("HUGGING_FACE_TOKEN").change_context(ChonkyError::HuggingFaceAPI)
}

async fn get_binary_image_data(
    image_path: impl AsRef<Path> + Send + Sync,
) -> Result<Vec<u8>, Report<ChonkyError>> {
    fs::read(image_path)
        .await
        .change_context(ChonkyError::ImageError)
}

fn extract_bounding_boxes(json_payload: &str) -> Result<Vec<TablePrediction>, Report<ChonkyError>> {
    serde_json::from_str(json_payload).change_context(ChonkyError::HuggingFaceAPI)
}

/// A function that calls `HuggingFace` Serverless Inference API to perform
/// table recognition on a given image and returns the vectors of bounding boxes of these tables
///
/// # Errors
///
/// [`ChonkyError::HuggingFaceAPI`] when there are HTTP request errors
pub async fn make_table_recognition_request(
    image_path: impl AsRef<Path> + Send + Sync,
    retry: bool,
) -> Result<Vec<TablePrediction>, Report<ChonkyError>> {
    let url = "https://api-inference.huggingface.co/models/microsoft/table-transformer-detection";

    let access_token = get_hugging_face_token()?;
    let payload = get_binary_image_data(&image_path).await?;

    // Create a new reqwest async client
    let client = Client::new();

    // Prepare the headers
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {access_token}"))
            .change_context(ChonkyError::HuggingFaceAPI)?,
    );
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );

    headers.insert(
        "x-wait-for-model",
        HeaderValue::from_str(&format!("{retry}")).change_context(ChonkyError::HuggingFaceAPI)?,
    );

    // Send the POST request with payload and headers
    let response = client
        .post(url)
        .headers(headers)
        .body(payload)
        .send()
        .await
        .change_context(ChonkyError::HuggingFaceAPI)?;

    // Check if the response status is success

    let cold_model_status = 503;
    if response.status() == cold_model_status {
        // call the model again allowing extra time to wait
        // this should not recurse forever since 503 error
        // only occurs for cold models which the new header will wait for
        return Box::pin(make_table_recognition_request(image_path, true)).await;
    } else if !response.status().is_success() {
        return Err(Report::new(ChonkyError::HuggingFaceAPI));
    }

    // Read the response body as text
    let response_text = response
        .text()
        .await
        .change_context(ChonkyError::HuggingFaceAPI)?;

    // Process the response
    extract_bounding_boxes(&response_text)

    // // this is where we would wish to provide add the retry mechanism

    // // error code when model is warm is a 503 error, we can then add x-wait-for-model:true for
    // // it to work
    // let url = "https://api-inference.huggingface.co/models/microsoft/table-transformer-detection";

    // let access_token = get_hugging_face_token()?;
    // let payload = get_binary_image_data(image_path)?;

    // let mut easy = Easy::new();
    // easy.url(url).change_context(ChonkyError::HuggingFaceAPI)?;
    // easy.post(true)
    //     .change_context(ChonkyError::HuggingFaceAPI)?;

    // let mut headers = List::new();
    // headers
    //     .append(&format!("Authorization: Bearer {access_token}"))
    //     .change_context(ChonkyError::HuggingFaceAPI)?;

    // // we add wait for model to be true if receiving api error prev
    // headers
    //     .append(&format!("x-wait-for-model:{retry}"))
    //     .change_context(ChonkyError::HuggingFaceAPI)?;

    // easy.http_headers(headers)
    //     .change_context(ChonkyError::HuggingFaceAPI)?;

    // easy.post_fields_copy(&payload)
    //     .change_context(ChonkyError::HuggingFaceAPI)?;

    // let mut response = Vec::new();
    // {
    //     let mut transfer = easy.transfer();
    //     transfer
    //         .write_function(|data| {
    //             response.extend_from_slice(data);
    //             Ok(data.len())
    //         })
    //         .change_context(ChonkyError::HuggingFaceAPI)?;
    //     transfer
    //         .perform()
    //         .change_context(ChonkyError::HuggingFaceAPI)?;
    // }

    // extract_bounding_boxes(
    //     &String::from_utf8(response).change_context(ChonkyError::HuggingFaceAPI)?,
    // )
}

#[cfg(test)]
mod tests {
    use insta::assert_snapshot;

    use super::*;

    #[tokio::test]
    async fn table_recognition() -> Result<(), Report<ChonkyError>> {
        let file_path = "tests/docs/table-testing.png";

        let table_predictions = make_table_recognition_request(file_path, true).await?;

        assert_snapshot!(
            "table_bounding_boxes.txt",
            format!("{:?}", table_predictions)
        );
        Ok(())
    }
}
