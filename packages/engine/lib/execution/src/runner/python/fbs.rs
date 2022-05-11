use flatbuffers::{FlatBufferBuilder, WIPOffset};
use memory::shared_memory::{Metaversion, Segment};
use stateful::global::SharedStore;

use crate::runner::{comms::PackageMsgs, python::PythonResult};

pub fn pkgs_to_fbs<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    pkgs: &PackageMsgs,
) -> PythonResult<WIPOffset<flatbuffers_gen::package_config_generated::PackageConfig<'f>>> {
    let pkgs = pkgs
        .0
        .iter()
        .map(|(package_id, init_msg)| {
            let package_name = fbb.create_string(&format!("{}", &init_msg.name));

            let payload_bytes = serde_json::to_vec(&init_msg.payload)?;
            let serialized_payload = fbb.create_vector(&payload_bytes);
            let payload = flatbuffers_gen::serialized_generated::Serialized::create(
                fbb,
                &flatbuffers_gen::serialized_generated::SerializedArgs {
                    inner: Some(serialized_payload),
                },
            );

            Ok(flatbuffers_gen::package_config_generated::Package::create(
                fbb,
                &flatbuffers_gen::package_config_generated::PackageArgs {
                    type_: init_msg.r#type.into(),
                    name: Some(package_name),
                    sid: package_id.as_usize().get() as u64,
                    init_payload: Some(payload),
                },
            ))
        })
        .collect::<PythonResult<Vec<_>>>()?;

    let pkgs = fbb.create_vector(&pkgs);
    Ok(
        flatbuffers_gen::package_config_generated::PackageConfig::create(
            fbb,
            &flatbuffers_gen::package_config_generated::PackageConfigArgs {
                packages: Some(pkgs),
            },
        ),
    )
}

pub fn shared_ctx_to_fbs<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    shared_ctx: &SharedStore,
) -> WIPOffset<flatbuffers_gen::shared_context_generated::SharedContext<'f>> {
    let mut batch_offsets = Vec::new();
    for (_, dataset) in shared_ctx.datasets.iter() {
        batch_offsets.push(batch_to_fbs(fbb, dataset.segment()));
    }
    // let batch_offsets: Vec<_> = shared_ctx.datasets
    //     .iter()
    //     .map(|(_name, dataset)| batch_to_fbs(fbb, dataset))
    //     .collect();
    let batch_fbs_vec = fbb.create_vector(&batch_offsets);

    // Build the SharedContext using the vec
    flatbuffers_gen::shared_context_generated::SharedContext::create(
        fbb,
        &flatbuffers_gen::shared_context_generated::SharedContextArgs {
            datasets: Some(batch_fbs_vec),
        },
    )
}

pub fn batch_to_fbs<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    batch_segment: &Segment,
) -> WIPOffset<flatbuffers_gen::batch_generated::Batch<'f>> {
    let batch_id_offset = fbb.create_string(batch_segment.id());
    let metaversion_offset = metaversion_to_fbs(
        fbb,
        // TODO: Don't serialize the metaversion and just send the batch id and read the persisted
        //       metaversion in the runner instead.
        batch_segment.read_persisted_metaversion(),
    );
    flatbuffers_gen::batch_generated::Batch::create(
        fbb,
        &flatbuffers_gen::batch_generated::BatchArgs {
            batch_id: Some(batch_id_offset),
            metaversion: Some(metaversion_offset),
        },
    )
}

pub fn metaversion_to_fbs<'f>(
    fbb: &mut FlatBufferBuilder<'f>,
    metaversion: Metaversion,
) -> WIPOffset<flatbuffers_gen::metaversion_generated::Metaversion<'f>> {
    flatbuffers_gen::metaversion_generated::Metaversion::create(
        fbb,
        &flatbuffers_gen::metaversion_generated::MetaversionArgs {
            memory: metaversion.memory(),
            batch: metaversion.batch(),
        },
    )
}
