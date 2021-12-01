use std::ops::Deref;

use flatbuffers::{FlatBufferBuilder, WIPOffset};

use super::error::Result;
use crate::datastore::batch::Batch;
use crate::datastore::prelude::SharedStore;
use crate::gen;
use crate::worker::runner::comms::PackageMsgs;

pub fn pkgs_to_fbs<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    pkgs: &PackageMsgs,
) -> Result<WIPOffset<crate::gen::package_config_generated::PackageConfig<'f>>> {
    let pkgs = pkgs
        .0
        .iter()
        .map(|(package_id, init_msg)| {
            let package_name = fbb.create_string(&format!("{}", &init_msg.name));

            let payload_bytes = serde_json::to_vec(&init_msg.payload)?;
            let serialized_payload = fbb.create_vector(&payload_bytes);
            let payload = gen::serialized_generated::Serialized::create(
                fbb,
                &gen::serialized_generated::SerializedArgs {
                    inner: Some(serialized_payload),
                },
            );

            Ok(gen::package_config_generated::Package::create(
                fbb,
                &gen::package_config_generated::PackageArgs {
                    type_: init_msg.r#type.into(),
                    name: Some(package_name),
                    sid: package_id.as_usize() as u64,
                    init_payload: Some(payload),
                },
            ))
        })
        .collect::<Result<Vec<_>>>()?;

    let pkgs = fbb.create_vector(&pkgs);
    Ok(gen::package_config_generated::PackageConfig::create(
        fbb,
        &gen::package_config_generated::PackageConfigArgs {
            packages: Some(pkgs),
        },
    ))
}

pub fn shared_ctx_to_fbs<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    shared_ctx: &SharedStore,
) -> WIPOffset<crate::gen::shared_context_generated::SharedContext<'f>> {
    let mut batch_offsets = Vec::new();
    for (_, dataset) in shared_ctx.datasets.iter() {
        batch_offsets.push(batch_to_fbs(fbb, dataset));
    }
    // let batch_offsets: Vec<_> = shared_ctx.datasets
    //     .iter()
    //     .map(|(_name, dataset)| batch_to_fbs(fbb, dataset))
    //     .collect();
    let batch_fbs_vec = fbb.create_vector(&batch_offsets);

    // Build the SharedContext using the vec
    gen::shared_context_generated::SharedContext::create(
        fbb,
        &gen::shared_context_generated::SharedContextArgs {
            datasets: Some(batch_fbs_vec),
        },
    )
}

pub fn batch_to_fbs<'f, B: Batch, T: Deref<Target = B>>(
    fbb: &mut FlatBufferBuilder<'f>,
    batch: &T,
) -> WIPOffset<crate::gen::batch_generated::Batch<'f>> {
    let batch_id_offset = fbb.create_string(batch.get_batch_id());
    let metaversion_offset = metaversion_to_fbs(fbb, batch.metaversion());
    gen::batch_generated::Batch::create(
        fbb,
        &gen::batch_generated::BatchArgs {
            batch_id: Some(batch_id_offset),
            metaversion: Some(metaversion_offset),
        },
    )
}

pub fn metaversion_to_fbs<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    metaversion: &crate::datastore::batch::metaversion::Metaversion,
) -> WIPOffset<crate::gen::metaversion_generated::Metaversion<'f>> {
    gen::metaversion_generated::Metaversion::create(
        fbb,
        &gen::metaversion_generated::MetaversionArgs {
            memory: metaversion.memory(),
            batch: metaversion.batch(),
        },
    )
}
