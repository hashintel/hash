use async_trait::async_trait;
use error_stack::{Report, ResultExt};
use futures::StreamExt;
use stateful::global::Dataset;
use thiserror::Error;

use crate::ExperimentRun;

#[derive(Debug, Error)]
#[error("Could not resolve dependencies")]
pub struct DependencyError;

pub type Result<T, E = DependencyError> = error_stack::Result<T, E>;

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

        let url = self
            .url
            .as_ref()
            .ok_or_else(|| Report::new(DependencyError))
            .attach_printable("Either data or a dataset URL is required")?;
        let mut contents = surf::get(url)
            .recv_string()
            .await
            .map_err(|error| Report::new(DependencyError).attach_printable(error))
            .attach_printable_lazy(|| format!("Could not fetch dataset from {url}"))
            .change_context(DependencyError)?;

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
            contents = parse_raw_csv_into_json(contents)
                .attach_printable("Could not parser CSV as JSON")
                .change_context(DependencyError)?;
        }
        self.data = Some(contents);
        Ok(())
    }
}

#[async_trait]
impl FetchDependencies for ExperimentRun {
    async fn fetch_deps(&mut self) -> Result<()> {
        let datasets = std::mem::take(&mut self.simulation_mut().datasets);

        self.simulation_mut().datasets =
            futures::stream::iter(datasets.into_iter().map(|mut dataset| {
                tokio::spawn(async move {
                    dataset.fetch_deps().await?;
                    Ok(dataset)
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

pub fn parse_raw_csv_into_json(contents: String) -> Result<String, csv::Error> {
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
        for elem in record?.iter() {
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
