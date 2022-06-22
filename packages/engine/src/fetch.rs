use async_trait::async_trait;
use futures::StreamExt;
use stateful::global::Dataset;

use crate::{
    proto::{ExperimentRunRepr, ExperimentRunTrait},
    Error, Result,
};

#[async_trait]
pub trait FetchDependencies {
    async fn fetch_deps(&mut self) -> Result<()>;
}

#[async_trait]
impl FetchDependencies for Dataset {
    async fn fetch_deps(&mut self) -> Result<()> {
        if self.data.is_some() {
            return Ok(());
        }

        let url = self.url.as_ref().ok_or("Expected dataset URL")?;
        let mut contents = surf::get(url)
            .recv_string()
            .await
            .map_err(|e| Error::Surf(e.status()))?;

        // This should happen only when production project clones into staging environment
        // mean losing access to datasets which only exist in production.
        if contents.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Error>") {
            // TODO: changes so erroring is explict
            tracing::error!(
                "Possible error with dataset fetching. Returned message starts with: {}. Dataset \
                 metadata: {:?}",
                &contents[0..100.min(contents.len())],
                self
            );
        }

        if self.raw_csv {
            contents = parse_raw_csv_into_json(contents)?;
        }
        self.data = Some(contents);
        Ok(())
    }
}

#[async_trait]
impl FetchDependencies for ExperimentRunRepr {
    async fn fetch_deps(&mut self) -> Result<()> {
        let datasets = std::mem::take(&mut self.base_mut().project_base.datasets);

        self.base_mut().project_base.datasets =
            futures::stream::iter(datasets.into_iter().map(|mut dataset| {
                tokio::spawn(async move {
                    dataset.fetch_deps().await?;
                    Ok::<Dataset, Error>(dataset)
                })
            }))
            .buffer_unordered(100)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .flatten()
            .collect::<Result<Vec<_>>>()?;

        Ok(())
    }
}

pub fn parse_raw_csv_into_json(contents: String) -> Result<String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .from_reader(contents.as_bytes());

    let mut result = String::from("[");
    let mut is_first_row = true;
    for record in reader.records() {
        if is_first_row {
            result.push('[');
            is_first_row = false;
        } else {
            result.push_str(",[");
        }

        let mut is_first_element = true;
        let record = record.map_err(|e| Error::from(e.to_string()))?;
        for elem in record.iter() {
            if !is_first_element {
                result.push(',');
            } else {
                is_first_element = false;
            }
            result.push('"');
            result.push_str(elem);
            result.push('"');
        }
        result.push(']');
    }

    result.push(']');
    Ok(result)
}
