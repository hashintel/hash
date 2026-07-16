//! Runtime arithmetic and running-image identity probes.
#![expect(
    unsafe_code,
    reason = "uname and dyld expose the running OS and mapped Mach-O identity only through C APIs"
)]

use core::ffi::CStr;
use std::io;

use crate::salt::hash::{ContentHash, ContentHasher};

/// Runtime properties that can change floating-point reduction order or kernels.
pub(super) struct ArithmeticRuntime {
    pub operating_system: String,
    pub math_runtime: String,
    pub cpu_features: String,
    pub floating_point_control: String,
    pub math_library_images: String,
    pub candle_cpu_threads: usize,
    pub gemm_kernel: String,
    pub gemm_cache_configuration: String,
    pub gemm_threading_threshold: usize,
    pub gemm_lhs_packing_threshold_single_thread: usize,
    pub gemm_lhs_packing_threshold_multi_thread: usize,
    pub gemm_rhs_packing_threshold: usize,
}

/// Observes the platform and native GEMM controls used by Candle CPU.
pub(super) fn observe_arithmetic_runtime() -> io::Result<ArithmeticRuntime> {
    let operating_system = operating_system_identity()?;
    Ok(ArithmeticRuntime {
        math_runtime: format!("rust-std-platform-math;{operating_system}"),
        operating_system,
        cpu_features: runtime_cpu_features(),
        floating_point_control: observed_floating_point_control(),
        math_library_images: loaded_math_library_identities()?,
        candle_cpu_threads: candle_cpu_threads(),
        gemm_kernel: gemm_kernel().to_owned(),
        gemm_cache_configuration: gemm_cache_configuration(),
        gemm_threading_threshold: gemm::get_threading_threshold(),
        gemm_lhs_packing_threshold_single_thread: gemm::get_lhs_packing_threshold_single_thread(),
        gemm_lhs_packing_threshold_multi_thread: gemm::get_lhs_packing_threshold_multi_thread(),
        gemm_rhs_packing_threshold: gemm::get_rhs_packing_threshold(),
    })
}

/// Identifies the image mapped into this process rather than reopening a mutable path.
pub(in crate::salt::generation::runner) fn running_binary_fingerprint() -> io::Result<ContentHash> {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.running-binary.v2");
    #[cfg(target_os = "macos")]
    {
        hasher.update(b"mach-o-lc-uuid");
        hasher.update(&running_macho_uuid()?);
        Ok(hasher.finish())
    }
    #[cfg(target_os = "linux")]
    {
        hasher.update(b"proc-self-exe");
        hasher.update(
            crate::salt::hash::hash_reader(std::fs::File::open("/proc/self/exe")?)?.as_bytes(),
        );
        return Ok(hasher.finish());
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = hasher;
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "M0 cannot identify the mapped executable on this operating system",
        ))
    }
}

fn candle_cpu_threads() -> usize {
    std::env::var("RAYON_NUM_THREADS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|&threads| threads > 0)
        .unwrap_or_else(num_cpus::get)
}

fn gemm_cache_configuration() -> String {
    gemm_common::cache::CACHE_INFO
        .iter()
        .enumerate()
        .map(|(level, cache)| {
            format!(
                "l{}:{}:{}:{}",
                level + 1,
                cache.associativity,
                cache.cache_bytes,
                cache.cache_line_bytes
            )
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn runtime_cpu_features() -> String {
    let mut features = Vec::new();
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        for (name, available) in [
            ("sse2", std::arch::is_x86_feature_detected!("sse2")),
            ("sse3", std::arch::is_x86_feature_detected!("sse3")),
            ("ssse3", std::arch::is_x86_feature_detected!("ssse3")),
            ("sse4.1", std::arch::is_x86_feature_detected!("sse4.1")),
            ("sse4.2", std::arch::is_x86_feature_detected!("sse4.2")),
            ("avx", std::arch::is_x86_feature_detected!("avx")),
            ("avx2", std::arch::is_x86_feature_detected!("avx2")),
            ("fma", std::arch::is_x86_feature_detected!("fma")),
            ("avx512f", std::arch::is_x86_feature_detected!("avx512f")),
        ] {
            if available {
                features.push(name);
            }
        }
    }
    #[cfg(target_arch = "aarch64")]
    {
        for (name, available) in [
            ("neon", std::arch::is_aarch64_feature_detected!("neon")),
            ("fp16", std::arch::is_aarch64_feature_detected!("fp16")),
            ("fcma", std::arch::is_aarch64_feature_detected!("fcma")),
            ("sve", std::arch::is_aarch64_feature_detected!("sve")),
        ] {
            if available {
                features.push(name);
            }
        }
    }
    #[cfg(target_arch = "wasm32")]
    if gemm::get_wasm_simd128() {
        features.push("simd128");
    }
    if features.is_empty() {
        "scalar".to_owned()
    } else {
        features.join(",")
    }
}

fn floating_point_control() -> String {
    #[cfg(target_arch = "x86_64")]
    {
        let mut x87_control = 0_u16;
        // SAFETY: `fnstcw` writes one aligned two-byte control-word snapshot.
        unsafe {
            core::arch::asm!(
                "fnstcw [{control}]",
                control = in(reg) core::ptr::from_mut(&mut x87_control),
                options(nostack, preserves_flags)
            );
        }
        // SAFETY: reading MXCSR has no memory or control-flow preconditions.
        let mxcsr = unsafe { core::arch::x86_64::_mm_getcsr() };
        format!("x87=0x{x87_control:04x};mxcsr=0x{mxcsr:08x}")
    }
    #[cfg(target_arch = "x86")]
    {
        let mut x87_control = 0_u16;
        // SAFETY: `fnstcw` writes one aligned two-byte control-word snapshot.
        unsafe {
            core::arch::asm!(
                "fnstcw [{control}]",
                control = in(reg) core::ptr::from_mut(&mut x87_control),
                options(nostack, preserves_flags)
            );
        }
        // SAFETY: reading MXCSR has no memory or control-flow preconditions.
        let mxcsr = unsafe { core::arch::x86::_mm_getcsr() };
        format!("x87=0x{x87_control:04x};mxcsr=0x{mxcsr:08x}")
    }
    #[cfg(target_arch = "aarch64")]
    {
        let fpcr: u64;
        // SAFETY: reading FPCR observes process-local floating-point controls.
        unsafe {
            core::arch::asm!("mrs {value}, fpcr", value = out(reg) fpcr, options(nomem, nostack, preserves_flags));
        }
        format!("fpcr=0x{fpcr:016x}")
    }
    #[cfg(target_arch = "wasm32")]
    {
        "wasm-fixed".to_owned()
    }
    #[cfg(not(any(
        target_arch = "x86",
        target_arch = "x86_64",
        target_arch = "aarch64",
        target_arch = "wasm32"
    )))]
    {
        "unobserved".to_owned()
    }
}

fn observed_floating_point_control() -> String {
    let caller = floating_point_control();
    let mut workers = rayon::broadcast(|context| {
        format!("worker-{}={}", context.index(), floating_point_control())
    });
    workers.sort_unstable();
    format!("caller={caller};{}", workers.join(";"))
}

#[cfg(target_os = "macos")]
fn loaded_math_library_identities() -> io::Result<String> {
    // SAFETY: dyld's image table and image names remain valid while loaded.
    let count = unsafe { _dyld_image_count() };
    let mut identities = Vec::new();
    for index in 0..count {
        // SAFETY: an index below the observed image count is valid.
        let name = unsafe { _dyld_get_image_name(index) };
        if name.is_null() {
            continue;
        }
        // SAFETY: dyld returns a NUL-terminated process-lifetime path.
        let name = unsafe { CStr::from_ptr(name) }.to_string_lossy();
        if !is_math_library(&name) {
            continue;
        }
        // SAFETY: an index below the observed image count is valid.
        let header = unsafe { _dyld_get_image_header(index) };
        let uuid = macho_uuid(header)?;
        identities.push(format!("{name}:{}", hex_uuid(uuid)));
    }
    identities.sort_unstable();
    identities.dedup();
    if identities.is_empty() {
        Err(io::Error::new(
            io::ErrorKind::NotFound,
            "no mapped system math image was identifiable",
        ))
    } else {
        Ok(identities.join(","))
    }
}

#[cfg(target_os = "linux")]
fn loaded_math_library_identities() -> io::Result<String> {
    use std::os::unix::fs::MetadataExt as _;

    let maps = std::fs::read_to_string("/proc/self/maps")?;
    let mut identities = Vec::new();
    for line in maps.lines() {
        let mut fields = line.split_whitespace();
        let _range = fields.next();
        let _permissions = fields.next();
        let _offset = fields.next();
        let device = fields.next();
        let inode = fields.next();
        let path = fields.next();
        let (Some(device), Some(inode), Some(path)) = (device, inode, path) else {
            continue;
        };
        if !is_math_library(path) {
            continue;
        }
        let mapped_inode = inode
            .parse::<u64>()
            .map_err(|_error| io::Error::new(io::ErrorKind::InvalidData, "invalid maps inode"))?;
        let file = std::fs::File::open(path)?;
        let metadata = file.metadata()?;
        if metadata.ino() != mapped_inode {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "mapped math library path no longer names the mapped inode",
            ));
        }
        let digest = hash_reader(file)?;
        identities.push(format!("{device}:{mapped_inode}:{path}:{digest}"));
    }
    identities.sort_unstable();
    identities.dedup();
    if identities.is_empty() {
        Err(io::Error::new(
            io::ErrorKind::NotFound,
            "no mapped system math image was identifiable",
        ))
    } else {
        Ok(identities.join(","))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn loaded_math_library_identities() -> io::Result<String> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "M0 cannot identify mapped math libraries on this operating system",
    ))
}

fn is_math_library(name: &str) -> bool {
    name.contains("libSystem")
        || name.contains("/libm.")
        || name.contains("/libm-")
        || name.contains("Accelerate.framework")
        || name.contains("vecLib.framework")
}

fn gemm_kernel() -> &'static str {
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        if std::arch::is_x86_feature_detected!("fma") {
            "fma"
        } else {
            "scalar"
        }
    }
    #[cfg(target_arch = "aarch64")]
    {
        if std::arch::is_aarch64_feature_detected!("neon") {
            "neon"
        } else {
            "scalar"
        }
    }
    #[cfg(target_arch = "wasm32")]
    {
        if gemm::get_wasm_simd128() {
            "simd128"
        } else {
            "scalar"
        }
    }
    #[cfg(not(any(
        target_arch = "x86",
        target_arch = "x86_64",
        target_arch = "aarch64",
        target_arch = "wasm32",
    )))]
    {
        "scalar"
    }
}

#[cfg(unix)]
fn operating_system_identity() -> io::Result<String> {
    let mut information = core::mem::MaybeUninit::<libc::utsname>::uninit();
    // SAFETY: `uname` initializes the complete `utsname` output on success.
    if unsafe { libc::uname(information.as_mut_ptr()) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful call above initialized every field.
    let information = unsafe { information.assume_init() };
    let identity = format!(
        "sysname={};release={};version={};machine={};libc={}",
        c_string(information.sysname.as_ptr()),
        c_string(information.release.as_ptr()),
        c_string(information.version.as_ptr()),
        c_string(information.machine.as_ptr()),
        c_runtime_identity(),
    );
    Ok(identity)
}

#[cfg(not(unix))]
fn operating_system_identity() -> io::Result<String> {
    Ok(format!(
        "os={};arch={};libc=unknown",
        std::env::consts::OS,
        std::env::consts::ARCH
    ))
}

#[cfg(unix)]
fn c_string(pointer: *const libc::c_char) -> String {
    // SAFETY: every `utsname` field is a NUL-terminated C character array.
    unsafe { CStr::from_ptr(pointer) }
        .to_string_lossy()
        .into_owned()
}

#[cfg(all(target_os = "linux", target_env = "gnu"))]
fn c_runtime_identity() -> String {
    // SAFETY: glibc returns a process-lifetime NUL-terminated version string.
    unsafe { CStr::from_ptr(libc::gnu_get_libc_version()) }
        .to_string_lossy()
        .into_owned()
}

#[cfg(target_os = "macos")]
fn c_runtime_identity() -> String {
    "libSystem-os-bound".to_owned()
}

#[cfg(all(
    unix,
    not(any(all(target_os = "linux", target_env = "gnu"), target_os = "macos"))
))]
fn c_runtime_identity() -> String {
    "non-glibc".to_owned()
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct MachHeader64 {
    magic: u32,
    cpu_type: i32,
    cpu_subtype: i32,
    file_type: u32,
    command_count: u32,
    command_bytes: u32,
    flags: u32,
    reserved: u32,
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone)]
struct MachLoadCommand {
    command: u32,
    bytes: u32,
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn _dyld_image_count() -> u32;
    fn _dyld_get_image_name(image_index: u32) -> *const libc::c_char;
    fn _dyld_get_image_header(image_index: u32) -> *const MachHeader64;
}

#[cfg(target_os = "macos")]
fn running_macho_uuid() -> io::Result<[u8; 16]> {
    // SAFETY: dyld owns image zero for the process lifetime.
    macho_uuid(unsafe { _dyld_get_image_header(0) })
}

#[cfg(target_os = "macos")]
fn macho_uuid(header: *const MachHeader64) -> io::Result<[u8; 16]> {
    const MACH_HEADER_64_MAGIC: u32 = 0xFEED_FACF;
    const LOAD_COMMAND_UUID: u32 = 0x1B;
    const UUID_COMMAND_BYTES: usize = 24;

    if header.is_null() {
        return Err(invalid_image("dyld returned no image"));
    }
    // SAFETY: a non-null image-zero pointer addresses its mapped Mach header.
    let header = unsafe { &*header };
    if header.magic != MACH_HEADER_64_MAGIC {
        return Err(invalid_image("main image is not a native 64-bit Mach-O"));
    }
    let command_region_bytes =
        usize::try_from(header.command_bytes).map_err(|_error| invalid_image("command size"))?;
    let mut offset = core::mem::size_of::<MachHeader64>();
    let command_region_end = offset
        .checked_add(command_region_bytes)
        .ok_or_else(|| invalid_image("command region overflow"))?;
    for _ in 0..header.command_count {
        let command_end = offset
            .checked_add(core::mem::size_of::<MachLoadCommand>())
            .ok_or_else(|| invalid_image("load-command overflow"))?;
        if command_end > command_region_end {
            return Err(invalid_image("truncated load-command table"));
        }
        // SAFETY: bounds above keep the read inside dyld's mapped load commands.
        let command: MachLoadCommand = unsafe {
            core::ptr::read_unaligned(core::ptr::from_ref(header).cast::<u8>().add(offset).cast())
        };
        let bytes =
            usize::try_from(command.bytes).map_err(|_error| invalid_image("load-command size"))?;
        let next = offset
            .checked_add(bytes)
            .ok_or_else(|| invalid_image("load-command size overflow"))?;
        if bytes < core::mem::size_of::<MachLoadCommand>() || next > command_region_end {
            return Err(invalid_image("invalid load-command size"));
        }
        if command.command == LOAD_COMMAND_UUID {
            if bytes < UUID_COMMAND_BYTES {
                return Err(invalid_image("truncated UUID command"));
            }
            let mut uuid = [0; 16];
            // SAFETY: the validated UUID command contains sixteen bytes after its header.
            unsafe {
                core::ptr::copy_nonoverlapping(
                    core::ptr::from_ref(header)
                        .cast::<u8>()
                        .add(offset + core::mem::size_of::<MachLoadCommand>()),
                    uuid.as_mut_ptr(),
                    uuid.len(),
                );
            }
            return Ok(uuid);
        }
        offset = next;
    }
    Err(invalid_image("mapped image has no LC_UUID"))
}

#[cfg(target_os = "macos")]
fn invalid_image(reason: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, reason)
}

#[cfg(target_os = "macos")]
fn hex_uuid(uuid: [u8; 16]) -> String {
    use core::fmt::Write as _;

    uuid.into_iter()
        .fold(String::with_capacity(32), |mut encoded, byte| {
            write!(encoded, "{byte:02x}").expect("writing to a String should succeed");
            encoded
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_identity_is_complete_and_running_image_bound() {
        let runtime = observe_arithmetic_runtime().expect("runtime should be observable");
        assert!(!runtime.operating_system.is_empty());
        assert!(!runtime.cpu_features.is_empty());
        assert!(!runtime.floating_point_control.is_empty());
        assert!(!runtime.math_library_images.is_empty());
        assert_ne!(
            running_binary_fingerprint().expect("running image should identify"),
            ContentHash::from_bytes([0; 32])
        );
        assert!(std::num::NonZeroUsize::new(runtime.candle_cpu_threads).is_some());
    }
}
