// L1 Data detection used by kiddo 6.0.0 through yep-cache-line-size 0.9.3.
// Keep this probe aligned with that dependency when its build script changes.
type Detection = Result<u32, &'static str>;

// Register order: EAX, EBX, ECX, EDX. Injectable only for synthetic parity checks.
fn x86_l1_data(mut read: impl FnMut(u32, u32) -> [u32; 4]) -> Detection {
    let basic = read(0, 0);
    let extended = read(0x8000_0000, 0)[0];
    let vendor = [basic[1], basic[3], basic[2]];
    let amd = vendor == [0x6874_7541, 0x6974_6e65, 0x444d_4163];
    // Keep the supported boundary explicit; raw-cpuid classifies Hygon as AMD too.
    if !amd && vendor != [0x756e_6547, 0x4965_6e69, 0x6c65_746e] {
        return Err("unsupported-vendor");
    }
    if amd {
        if basic[0] < 1 {
            return Err("unsupported");
        }
        let features = read(1, 0)[0];
        let zen = (features >> 8) & 0xf == 0xf && (8..=10).contains(&((features >> 20) & 0xff));
        if zen {
            return if extended >= 0x8000_0005 {
                Ok(read(0x8000_0005, 0)[2] & 0xff)
            } else {
                Err("unsupported")
            };
        }
    }
    // raw-cpuid excludes basic leaf 4 on AMD and chooses its extended cache leaf.
    let leaf = if amd {
        if extended < 0x8000_001d {
            return Err("unsupported");
        }
        0x8000_001d
    } else {
        if basic[0] < 4 {
            return Err("unsupported");
        }
        4
    };
    let mut smallest = None;
    // An explicit fallback bounds a malformed/nonterminating emulated CPUID list.
    for subleaf in 0..256 {
        let cache = read(leaf, subleaf);
        let kind = cache[0] & 0x1f;
        if kind == 0 || kind > 3 {
            return smallest.ok_or("not-present");
        }
        if kind == 1 && (cache[0] >> 5) & 7 == 1 {
            let bytes = (cache[1] & 0xfff) + 1;
            smallest = Some(smallest.map_or(bytes, |old: u32| old.min(bytes)));
        }
    }
    Err("enumeration-limit")
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn native() -> Detection {
    // Rust checks OSXSAVE and XCR0 state as part of usable AVX detection.
    // LAHF/SAHF has no std detection macro, so check its extended CPUID bit.
    let extended = unsafe { std::arch::x86_64::__cpuid(0x8000_0000) }.eax;
    if extended < 0x8000_0001
        || unsafe { std::arch::x86_64::__cpuid(0x8000_0001) }.ecx & 1 == 0
        || !std::is_x86_feature_detected!("cmpxchg16b")
        || !std::is_x86_feature_detected!("popcnt")
        || !std::is_x86_feature_detected!("sse3")
        || !std::is_x86_feature_detected!("ssse3")
        || !std::is_x86_feature_detected!("sse4.1")
        || !std::is_x86_feature_detected!("sse4.2")
        || !std::is_x86_feature_detected!("avx")
        || !std::is_x86_feature_detected!("avx2")
        || !std::is_x86_feature_detected!("bmi1")
        || !std::is_x86_feature_detected!("bmi2")
        || !std::is_x86_feature_detected!("f16c")
        || !std::is_x86_feature_detected!("fma")
        || !std::is_x86_feature_detected!("lzcnt")
        || !std::is_x86_feature_detected!("movbe")
    {
        return Err("unsupported-x86-64-v3");
    }
    x86_l1_data(|leaf, subleaf| {
        let r = unsafe { std::arch::x86_64::__cpuid_count(leaf, subleaf) };
        [r.eax, r.ebx, r.ecx, r.edx]
    })
}

#[cfg(not(all(target_os = "linux", target_arch = "x86_64")))]
fn native() -> Detection {
    Err("unsupported-host")
}

fn main() {
    match native() {
        Ok(bytes) => println!("{{\"status\":\"ok\",\"bytes\":{bytes}}}"),
        Err(status) => println!("{{\"status\":\"{status}\"}}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(amd: bool, max: u32, extended: u32, family: u32, caches: &[[u32; 4]]) -> Detection {
        x86_l1_data(|leaf, subleaf| match leaf {
            0 => {
                if amd {
                    [max, 0x6874_7541, 0x444d_4163, 0x6974_6e65]
                } else {
                    [max, 0x756e_6547, 0x6c65_746e, 0x4965_6e69]
                }
            }
            0x8000_0000 => [extended, 0, 0, 0],
            1 => [family, 0, 0, 0],
            0x8000_0005 => [0, 0, caches[0][2], 0],
            4 | 0x8000_001d => caches.get(subleaf as usize).copied().unwrap_or([0; 4]),
            _ => panic!("unexpected leaf"),
        })
    }

    #[test]
    fn amd_zen_legacy_field_and_missing_leaf() {
        for family in 8..=10 {
            assert_eq!(
                fixture(
                    true,
                    1,
                    0x8000_0005,
                    (family << 20) | 0xf00,
                    &[[0, 0, 128, 0]]
                ),
                Ok(128)
            );
        }
        assert_eq!(
            fixture(true, 1, 0x8000_0004, 0x0080_0f00, &[]),
            Err("unsupported")
        );
        assert_eq!(fixture(true, 1, 0x8000_0005, 0x0080_0f00, &[[0; 4]]), Ok(0));
        assert_eq!(fixture(true, 0, 0x8000_001d, 0, &[]), Err("unsupported"));
    }

    #[test]
    fn generic_filters_level_and_type_then_takes_minimum() {
        let caches = [
            [0x22, 255, 0, 0],
            [0x43, 127, 0, 0],
            [0x21, 127, 0, 0],
            [0x21, 63, 0, 0],
        ];
        assert_eq!(fixture(false, 4, 0, 0, &caches), Ok(64));
        assert_eq!(fixture(true, 1, 0x8000_001d, 0x0070_0f00, &caches), Ok(64));
        assert_eq!(
            fixture(true, 4, 0x8000_001c, 0x0070_0f00, &caches),
            Err("unsupported")
        );
        assert_eq!(fixture(false, 3, 0, 0, &caches), Err("unsupported"));
    }

    #[test]
    fn generic_terminates_on_null_or_reserved_and_reports_no_data() {
        assert_eq!(
            fixture(false, 4, 0, 0, &[[0x22, 63, 0, 0]]),
            Err("not-present")
        );
        assert_eq!(
            fixture(false, 4, 0, 0, &[[4, 0, 0, 0], [0x21, 127, 0, 0]]),
            Err("not-present")
        );
        assert_eq!(
            fixture(
                false,
                4,
                0,
                0,
                &[[0x21, 63, 0, 0], [4, 0, 0, 0], [0x21, 31, 0, 0]]
            ),
            Ok(64)
        );
        assert_eq!(
            fixture(false, 4, 0, 0, &[[0x21, 63, 0, 0]; 256]),
            Err("enumeration-limit")
        );
    }

    #[test]
    fn hygon_and_unknown_vendors_fall_back_instead_of_using_intel_leaf() {
        for vendor in [[0x6f67_7948, 0x656e_6975, 0x6e65_476e], [0; 3]] {
            assert_eq!(
                x86_l1_data(|leaf, _| match leaf {
                    0 => [4, vendor[0], vendor[1], vendor[2]],
                    0x8000_0000 => [0x8000_001d, 0, 0, 0],
                    _ => panic!("unsupported vendor must not query a cache leaf"),
                }),
                Err("unsupported-vendor")
            );
        }
    }
}
