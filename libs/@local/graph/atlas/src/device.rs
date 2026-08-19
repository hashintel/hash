//! The runtime compute device of one process.
//!
//! Every tensor stage runs on the torch backend, so the device is a runtime value handed down
//! from the entry point rather than a compile-time backend choice. [`Device`] names the device
//! families torch drives. [`Device::host`] derives the family this machine accelerates, so an
//! entry point that does not care resolves the derived family and one that does passes its own.

use burn::backend::{
    Autodiff,
    libtorch::{LibTorch, LibTorchDevice},
};

/// The backend inference runs on.
pub(crate) type Inference = LibTorch;

/// The backend training runs on: the inference backend under autodiff.
pub(crate) type Training = Autodiff<Inference>;

/// A device family the torch backend drives.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Device {
    Metal,
    Cuda,
    Vulkan,
    Cpu,
}

impl Device {
    /// Derives the device family this host accelerates.
    ///
    /// Apple hosts accelerate through Metal, and every other host is taken to carry a CUDA
    /// device. A deployment whose hardware differs passes its own [`Device`] instead of the
    /// derived one.
    pub(crate) const fn host() -> Self {
        if cfg!(target_os = "macos") {
            Self::Metal
        } else {
            Self::Cuda
        }
    }

    /// Resolves the family to torch's device handle.
    ///
    /// `ordinal` selects among the family's devices, and only CUDA distinguishes them.
    pub(crate) const fn resolve(self, ordinal: usize) -> LibTorchDevice {
        match self {
            Self::Cpu => LibTorchDevice::Cpu,
            Self::Vulkan => LibTorchDevice::Vulkan,
            Self::Cuda => LibTorchDevice::Cuda(ordinal),
            Self::Metal => LibTorchDevice::Mps,
        }
    }
}
