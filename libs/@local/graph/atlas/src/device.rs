//! The runtime compute device of one process.
//!
//! Every tensor stage runs on the torch backend, so the device is a runtime value handed down
//! from the entry point rather than a compile-time backend choice. [`Device`] names the device
//! families torch drives. [`Device::host`] derives the family this machine accelerates, so an
//! entry point that does not care resolves the derived family and one that does passes its own.

use core::{error::Error, fmt, num::ParseIntError, str::FromStr};

use burn::{
    Dispatch, DispatchDevice,
    backend::{Autodiff, ndarray::NdArrayDevice},
    cubecl::{cuda::CudaDevice, wgpu::WgpuDevice},
};

/// The device every tensor stage runs on.
pub(crate) type PhysicalDevice = DispatchDevice;

/// The backend inference runs on.
pub(crate) type Inference = Dispatch;

/// The inference backend under autodiff, which training runs on.
pub(crate) type Training = Autodiff<Inference>;

/// A device family the torch backend drives.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Device {
    Metal,
    Cuda,
    Cpu,
}

impl Device {
    /// Derives the device family this host accelerates.
    ///
    /// Apple hosts accelerate through Metal, and every other host is taken to carry a CUDA
    /// device. A deployment whose hardware differs passes its own [`Device`] instead of the
    /// derived one.
    #[must_use]
    pub const fn host() -> Self {
        if cfg!(target_os = "macos") {
            Self::Metal
        } else {
            Self::Cuda
        }
    }

    #[must_use]
    pub const fn pin(self, ordinal: usize) -> PinnedDevice {
        PinnedDevice(self, ordinal)
    }
}

impl fmt::Display for Device {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Metal => fmt.write_str("metal"),
            Self::Cuda => fmt.write_str("cuda"),
            Self::Cpu => fmt.write_str("cpu"),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct PinnedDevice(Device, usize);

impl PinnedDevice {
    /// Pins the host's derived family at ordinal 0.
    pub(crate) const fn host() -> Self {
        Device::host().pin(0)
    }

    /// Resolves the family to torch's device handle.
    pub(crate) const fn resolve(self) -> PhysicalDevice {
        match self.0 {
            Device::Cpu => PhysicalDevice::NdArray(NdArrayDevice::Cpu),
            Device::Cuda => PhysicalDevice::Cuda(CudaDevice { index: self.1 }),
            Device::Metal => PhysicalDevice::Metal(WgpuDevice::DiscreteGpu(self.1)),
        }
    }
}

impl fmt::Display for PinnedDevice {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}:{}", self.0, self.1)
    }
}

/// A device string failed to parse.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseDeviceError {
    /// The family is not one the torch backend drives.
    UnknownFamily { supplied: String },
    /// The ordinal is not an unsigned integer.
    InvalidOrdinal(ParseIntError),
}

impl fmt::Display for ParseDeviceError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownFamily { supplied } => write!(
                fmt,
                "`{supplied}` is not a device family: expected `metal`, `cuda`, `vulkan`, or `cpu`"
            ),
            Self::InvalidOrdinal(error) => {
                write!(fmt, "the device ordinal does not parse: {error}")
            }
        }
    }
}

impl Error for ParseDeviceError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidOrdinal(error) => Some(error),
            Self::UnknownFamily { .. } => None,
        }
    }
}

/// Parses `family` or `family:ordinal`, the family case-insensitive and the ordinal defaulting
/// to 0: `metal`, `cuda:1`, `cpu`.
impl FromStr for PinnedDevice {
    type Err = ParseDeviceError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let (device, ordinal) = s.split_once(':').unwrap_or((s, "0"));
        let ordinal = usize::from_str(ordinal).map_err(ParseDeviceError::InvalidOrdinal)?;

        let family = if device.eq_ignore_ascii_case("metal") {
            Device::Metal
        } else if device.eq_ignore_ascii_case("cuda") {
            Device::Cuda
        } else if device.eq_ignore_ascii_case("cpu") {
            Device::Cpu
        } else {
            return Err(ParseDeviceError::UnknownFamily {
                supplied: device.to_owned(),
            });
        };

        Ok(family.pin(ordinal))
    }
}

#[cfg(test)]
mod tests {
    use core::{assert_matches, str::FromStr as _};

    use super::{Device, ParseDeviceError, PinnedDevice};

    #[test]
    fn families_parse_case_insensitively_and_default_to_ordinal_zero() {
        assert_eq!(
            PinnedDevice::from_str("metal").expect("a bare family parses"),
            Device::Metal.pin(0)
        );
        assert_eq!(
            PinnedDevice::from_str("CUDA:3").expect("a pinned family parses"),
            Device::Cuda.pin(3)
        );
        assert_eq!(
            PinnedDevice::from_str("cpu:2").expect("the cpu family parses"),
            Device::Cpu.pin(2)
        );
    }

    #[test]
    fn the_display_form_parses_back_to_itself() {
        let device = Device::Cuda.pin(2);
        assert_eq!(
            PinnedDevice::from_str(&device.to_string()).expect("the display form parses"),
            device
        );
    }

    #[test]
    fn unknown_families_and_malformed_ordinals_refuse() {
        assert_matches!(
            PinnedDevice::from_str("tpu"),
            Err(ParseDeviceError::UnknownFamily { .. })
        );
        assert_matches!(
            PinnedDevice::from_str("cuda:first"),
            Err(ParseDeviceError::InvalidOrdinal(_))
        );
        assert_matches!(
            PinnedDevice::from_str("cuda:"),
            Err(ParseDeviceError::InvalidOrdinal(_))
        );
    }
}
