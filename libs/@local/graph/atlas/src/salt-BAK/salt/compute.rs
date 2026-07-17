//! Fallible `CubeCL` GPU initialization for fitting and checkpoint serving.

use core::{any::Any, panic::AssertUnwindSafe};
use std::panic::catch_unwind;

use burn::{
    backend::Autodiff,
    tensor::{Tensor, TensorData, backend::Backend as _},
};

use crate::api::{AtlasComputeBackend, AtlasComputeConfiguration};

#[cfg(target_os = "macos")]
pub(crate) type ProductionInferenceBackend = burn::backend::Metal;
#[cfg(all(target_os = "linux", feature = "cuda"))]
pub(crate) type ProductionInferenceBackend = burn::backend::Cuda;
#[cfg(not(any(target_os = "macos", all(target_os = "linux", feature = "cuda"))))]
pub(crate) type ProductionInferenceBackend = burn::backend::Wgpu;

/// The only training backend admitted by production fit on this build.
pub(crate) type ProductionTrainingBackend = Autodiff<ProductionInferenceBackend>;

/// The platform-specific `CubeCL` device selected for this build.
#[cfg(not(all(target_os = "linux", feature = "cuda")))]
pub(crate) type ProductionDevice = burn::backend::wgpu::WgpuDevice;
#[cfg(all(target_os = "linux", feature = "cuda"))]
pub(crate) type ProductionDevice = burn::backend::cuda::CudaDevice;

const SMOKE_PRODUCT: [f32; 4] = [7.0, 10.0, 15.0, 22.0];

/// A backend device paired with the ordinal bound into generation identity.
#[derive(Debug, Clone)]
pub(crate) struct ComputeDevice<Device> {
    device: Device,
    ordinal: u16,
}

impl<Device> ComputeDevice<Device> {
    pub(crate) const fn new(device: Device, ordinal: u16) -> Self {
        Self { device, ordinal }
    }

    pub(crate) const fn device(&self) -> &Device {
        &self.device
    }

    pub(crate) const fn ordinal(&self) -> u16 {
        self.ordinal
    }

    pub(crate) fn into_device(self) -> Device {
        self.device
    }
}

/// A requested accelerator that could not be initialized and exercised.
#[derive(Debug)]
pub(crate) enum ComputeInitializationError {
    UnsupportedPlatform {
        backend: AtlasComputeBackend,
        platform: &'static str,
    },
    CudaFeatureDisabled,
    BackendMismatch {
        required: AtlasComputeBackend,
        configured: AtlasComputeBackend,
    },
    Device {
        backend: AtlasComputeBackend,
        ordinal: u16,
        detail: String,
    },
    KernelProbe {
        backend: AtlasComputeBackend,
        ordinal: u16,
        detail: String,
    },
    KernelResult {
        backend: AtlasComputeBackend,
        ordinal: u16,
        actual: Vec<f32>,
    },
}

impl core::fmt::Display for ComputeInitializationError {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::UnsupportedPlatform { backend, platform } => {
                write!(formatter, "{backend} is not supported on {platform}")
            }
            Self::CudaFeatureDisabled => formatter.write_str(
                "CubeCL CUDA requires a Linux build with the hash-graph-atlas `cuda` feature",
            ),
            Self::BackendMismatch {
                required,
                configured,
            } => write!(
                formatter,
                "this binary requires {required}, but the configuration selected {configured}"
            ),
            Self::Device {
                backend,
                ordinal,
                detail,
            } => write!(
                formatter,
                "could not initialize CubeCL {backend} device ordinal {ordinal}: {detail}"
            ),
            Self::KernelProbe {
                backend,
                ordinal,
                detail,
            } => write!(
                formatter,
                "CubeCL {backend} device ordinal {ordinal} failed its kernel/readback probe: \
                 {detail}"
            ),
            Self::KernelResult {
                backend,
                ordinal,
                actual,
            } => {
                write!(
                    formatter,
                    "CubeCL {backend} device ordinal {ordinal} returned ["
                )?;
                for (index, value) in actual.iter().enumerate() {
                    if index > 0 {
                        formatter.write_str(", ")?;
                    }
                    write!(formatter, "{value}")?;
                }
                formatter.write_str("] from its kernel probe")
            }
        }
    }
}

impl core::error::Error for ComputeInitializationError {}

/// Initializes the exact configured GPU and verifies a matrix kernel plus host readback.
///
/// # Errors
///
/// Returns an error for a platform/backend mismatch, a CUDA build without the explicit feature,
/// an unavailable ordinal, a failed kernel, or unexpected arithmetic. This operation never falls
/// back to CPU.
pub(crate) fn initialize_cubecl_compute(
    configuration: AtlasComputeConfiguration,
) -> Result<ComputeDevice<ProductionDevice>, ComputeInitializationError> {
    let device = initialize_device(configuration)?;
    probe_device(configuration.backend, configuration.device_ordinal, &device)?;
    Ok(ComputeDevice::new(device, configuration.device_ordinal))
}

#[cfg(target_os = "macos")]
fn initialize_device(
    configuration: AtlasComputeConfiguration,
) -> Result<ProductionDevice, ComputeInitializationError> {
    use burn::backend::wgpu::{RuntimeOptions, WgpuDevice, graphics::Metal, init_setup};

    if configuration.backend != AtlasComputeBackend::Metal {
        return Err(ComputeInitializationError::BackendMismatch {
            required: AtlasComputeBackend::Metal,
            configured: configuration.backend,
        });
    }

    let device = WgpuDevice::IntegratedGpu(usize::from(configuration.device_ordinal));
    catch_unwind(AssertUnwindSafe(|| {
        drop(init_setup::<Metal>(&device, RuntimeOptions::default()));
    }))
    .map_err(|payload| ComputeInitializationError::Device {
        backend: configuration.backend,
        ordinal: configuration.device_ordinal,
        detail: panic_message(payload.as_ref()),
    })?;
    Ok(device)
}

#[cfg(all(target_os = "linux", feature = "cuda"))]
fn initialize_device(
    configuration: AtlasComputeConfiguration,
) -> Result<ProductionDevice, ComputeInitializationError> {
    use burn::backend::cuda::CudaDevice;

    if configuration.backend != AtlasComputeBackend::Cuda {
        return Err(ComputeInitializationError::BackendMismatch {
            required: AtlasComputeBackend::Cuda,
            configured: configuration.backend,
        });
    }
    Ok(CudaDevice::new(usize::from(configuration.device_ordinal)))
}

#[cfg(all(target_os = "linux", not(feature = "cuda")))]
fn initialize_device(
    configuration: AtlasComputeConfiguration,
) -> Result<ProductionDevice, ComputeInitializationError> {
    if configuration.backend == AtlasComputeBackend::Cuda {
        Err(ComputeInitializationError::CudaFeatureDisabled)
    } else {
        Err(ComputeInitializationError::UnsupportedPlatform {
            backend: configuration.backend,
            platform: std::env::consts::OS,
        })
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn initialize_device(
    configuration: AtlasComputeConfiguration,
) -> Result<ProductionDevice, ComputeInitializationError> {
    Err(ComputeInitializationError::UnsupportedPlatform {
        backend: configuration.backend,
        platform: std::env::consts::OS,
    })
}

fn probe_device(
    backend: AtlasComputeBackend,
    ordinal: u16,
    device: &ProductionDevice,
) -> Result<(), ComputeInitializationError> {
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        let left = Tensor::<ProductionInferenceBackend, 2>::from_data(
            TensorData::from([[1.0_f32, 2.0], [3.0, 4.0]]),
            device,
        );
        let right = Tensor::<ProductionInferenceBackend, 2>::from_data(
            TensorData::from([[1.0_f32, 2.0], [3.0, 4.0]]),
            device,
        );
        let product = left.matmul(right);
        ProductionInferenceBackend::sync(device).map_err(|error| error.to_string())?;
        product
            .into_data()
            .to_vec::<f32>()
            .map_err(|error| error.to_string())
    }));

    let actual = match outcome {
        Ok(Ok(actual)) => actual,
        Ok(Err(detail)) => {
            return Err(ComputeInitializationError::KernelProbe {
                backend,
                ordinal,
                detail,
            });
        }
        Err(payload) => {
            return Err(ComputeInitializationError::KernelProbe {
                backend,
                ordinal,
                detail: panic_message(payload.as_ref()),
            });
        }
    };
    if actual.as_slice() != SMOKE_PRODUCT {
        return Err(ComputeInitializationError::KernelResult {
            backend,
            ordinal,
            actual,
        });
    }
    Ok(())
}

fn panic_message(payload: &(dyn Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return (*message).to_owned();
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    "non-string panic payload".to_owned()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use burn::tensor::backend::Backend as _;
    use camino::Utf8Path;

    use super::{ProductionInferenceBackend, initialize_cubecl_compute};
    use crate::{
        api::{AtlasComputeBackend, AtlasComputeConfiguration},
        salt::projector::{
            ConditionedProjector, ProjectorConfig, load_projector_checkpoint,
            publish_projector_checkpoint,
        },
    };

    #[test]
    #[ignore = "requires a Metal device"]
    fn metal_kernel_and_checkpoint_reload_succeed() {
        let compute = initialize_cubecl_compute(AtlasComputeConfiguration::default())
            .expect("Metal initialization and kernel probe should succeed");
        assert_eq!(
            ProductionInferenceBackend::name(compute.device()),
            AtlasComputeBackend::Metal.inference_name(),
            "production smoke probe should use CubeCL Metal"
        );
        let directory = tempfile::tempdir().expect("temporary directory should be created");
        let path = Utf8Path::from_path(directory.path())
            .expect("temporary path should be UTF-8")
            .join("projector.salt");
        let configuration = ProjectorConfig::default();
        let model = ConditionedProjector::<ProductionInferenceBackend>::new(
            configuration,
            compute.device(),
        )
        .expect("Metal projector should initialize");
        publish_projector_checkpoint(&path, &model)
            .expect("Metal checkpoint should publish durably");
        let loaded = load_projector_checkpoint::<ProductionInferenceBackend>(
            &path,
            configuration,
            compute.device(),
        )
        .expect("Metal checkpoint should reload");
        assert_eq!(
            loaded.config(),
            configuration,
            "reloaded checkpoint should retain its architecture"
        );
    }
}
