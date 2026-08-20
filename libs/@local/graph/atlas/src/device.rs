//! The runtime compute device of one process.
//!
//! Every tensor stage runs on the torch backend, so the device is a runtime value handed down
//! from the entry point rather than a compile-time backend choice. [`Device`] names the device
//! families torch drives. [`Device::host`] derives the family this machine accelerates, so an
//! entry point that does not care resolves the derived family and one that does passes its own.

use core::{fmt, str::FromStr};

use burn::backend::{
    Autodiff,
    libtorch::{LibTorch, LibTorchDevice},
};

/// The backend inference runs on.
pub(crate) type Inference = LibTorch;

/// The inference backend under autodiff, which training runs on.
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

    pub(crate) const fn pin(self, ordinal: usize) -> PinnedDevice {
        PinnedDevice(self, ordinal)
    }
}

impl fmt::Display for Device {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Metal => fmt.write_str("metal"),
            Self::Cuda => fmt.write_str("cuda"),
            Self::Vulkan => fmt.write_str("vulkan"),
            Self::Cpu => fmt.write_str("cpu"),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct PinnedDevice(Device, usize);

impl PinnedDevice {
    /// Returns a pinned device on the host's CUDA device.
    pub(crate) const fn host() -> Self {
        Device::host().pin(0)
    }

    /// Resolves the family to torch's device handle.
    pub(crate) const fn resolve(self) -> LibTorchDevice {
        match self.0 {
            Device::Cpu => LibTorchDevice::Cpu,
            Device::Vulkan => LibTorchDevice::Vulkan,
            Device::Cuda => LibTorchDevice::Cuda(self.1),
            Device::Metal => LibTorchDevice::Mps,
        }
    }
}

impl fmt::Display for PinnedDevice {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}:{}", self.0, self.1)
    }
}

impl FromStr for PinnedDevice {
    type Err = !;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let (device, ordinal) = s.split_once(':').unwrap_or((s, "0"));
        let ordinal = usize::from_str(ordinal).unwrap();

        if device.eq_ignore_ascii_case("metal") {
            Ok(Self(Device::Metal, ordinal))
        } else if device.eq_ignore_ascii_case("cuda") {
            Ok(Self(Device::Cuda, ordinal))
        } else if device.eq_ignore_ascii_case("vulkan") {
            Ok(Self(Device::Vulkan, ordinal))
        } else if device.eq_ignore_ascii_case("cpu") {
            Ok(Self(Device::Cpu, ordinal))
        } else {
            todo!()
        }
    }
}
