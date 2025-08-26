addEventListener("scheduled", (event) => {
  event.waitUntil(
    handleScheduled(event).then((response) => {
      // Scheduled events don't need responses, but dev mode expects one
      console.log("Scheduled event completed");
    }),
  );
});

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === "/__scheduled" && request.method === "POST") {
    const result = await handleScheduled();
    return result || new Response("Scheduled event triggered");
  }
  return new Response("Rust mirror worker is running");
}

async function handleScheduled(event) {
  console.log("Starting Rust mirror sync...");

  const TOOLCHAIN = "nightly-2025-07-28";
  const REQUIRED_COMPONENTS = [
    "rustfmt-preview",
    "clippy-preview",
    "llvm-tools-preview",
    "miri-preview",
    "rust-src",
    "rust-analyzer-preview",
    "rustc-codegen-cranelift-preview",
  ];
  const TARGET = "x86_64-unknown-linux-gnu";

  try {
    // Extract date from channel
    const dateMatch = TOOLCHAIN.match(/nightly-(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : null;

    if (!date) {
      throw new Error(`Unable to extract date from channel: ${TOOLCHAIN}`);
    }

    // 1. Download and parse channel manifest
    const manifestUrl = `https://static.rust-lang.org/dist/${date}/channel-rust-nightly.toml`;
    console.log(`Fetching manifest: ${manifestUrl}`);

    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      throw new Error(`Failed to fetch manifest: ${manifestResponse.status}`);
    }

    const manifestText = await manifestResponse.text();

    // DEBUG: Show first 50 lines of manifest
    console.log("=== MANIFEST DEBUG ===");
    console.log(manifestText.split("\n").slice(0, 50).join("\n"));
    console.log("=== END DEBUG ===");

    // 2. Parse TOML and extract package URLs
    const packageUrls = parseRustManifest(
      manifestText,
      TARGET,
      REQUIRED_COMPONENTS,
    );

    // 3. Mirror the manifest itself
    await mirrorFile(manifestUrl, `dist/${date}/channel-rust-nightly.toml`);

    // 4. Mirror all required packages
    for (const url of packageUrls) {
      const fileName = url.split("/").pop();
      await mirrorFile(url, `dist/${date}/${fileName}`);
    }

    console.log("Rust mirror sync completed successfully");
    return new Response("Sync completed");
  } catch (error) {
    console.error("Sync failed:", error);
    return new Response(`Sync failed: ${error.message}`, { status: 500 });
  }
}

function parseRustManifest(manifestText, target, requiredComponents) {
  console.log("Quick parsing manifest for required packages...");
  const urls = [];
  const lines = manifestText.split("\n");

  let currentSection = null;
  let inRelevantSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers like [pkg.rust.target.x86_64-unknown-linux-gnu]
    if (trimmed.startsWith("[pkg.")) {
      const sectionMatch = trimmed.match(
        /\[pkg\.([^.]+)(?:\.target\.([^\]]+))?\]/,
      );
      if (sectionMatch) {
        const pkg = sectionMatch[1];
        const sectionTarget = sectionMatch[2];

        // Check if this is a package we want
        const wantPackage = pkg === "rust" || requiredComponents.includes(pkg);
        // Check if this is the target we want (or no target specified)
        const rightTarget = !sectionTarget || sectionTarget === target;

        inRelevantSection = wantPackage && rightTarget;
        currentSection = pkg;
      }
      continue;
    }

    // Extract URLs from relevant sections (prefer xz_url for .tar.xz files)
    if (inRelevantSection && trimmed.startsWith("xz_url = ")) {
      const urlMatch = trimmed.match(/xz_url = "([^"]+)"/);
      if (urlMatch) {
        const url = urlMatch[1];
        urls.push(url);

        // Also add the .sha256 file
        urls.push(url + ".sha256");

        console.log(`Added: ${url} and ${url}.sha256`);
      }
    }
  }

  console.log(`Found ${urls.length} URLs to mirror`);
  return urls;
}

async function syncToolchain(channel, targets) {
  const baseUrl = "https://static.rust-lang.org";

  // Extract date from channel (e.g. "nightly-2025-07-28" -> "2025-07-28")
  const dateMatch = channel.match(/nightly-(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : null;

  if (!date) {
    throw new Error(`Unable to extract date from channel: ${channel}`);
  }

  for (const target of targets) {
    // Mirror the specific files your CI needs
    const files = [
      `dist/${date}/rust-nightly-${target}.tar.xz`,
      `dist/${date}/rust-nightly-${target}.tar.xz.sha256`,
      `dist/${date}/channel-rust-nightly.toml`,
    ];

    for (const file of files) {
      await mirrorFile(`${baseUrl}/${file}`, file);
    }
  }
}

async function syncComponent(channel, component, targets) {
  const baseUrl = "https://static.rust-lang.org";

  // Extract date from channel (e.g. "nightly-2025-07-28" -> "2025-07-28")
  const dateMatch = channel.match(/nightly-(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : null;

  if (!date) {
    throw new Error(`Unable to extract date from channel: ${channel}`);
  }

  for (const target of targets) {
    const files = [
      `dist/${date}/${component}-nightly-${target}.tar.xz`,
      `dist/${date}/${component}-nightly-${target}.tar.xz.sha256`,
    ];

    for (const file of files) {
      await mirrorFile(`${baseUrl}/${file}`, file);
    }
  }
}

async function mirrorFile(sourceUrl, targetKey) {
  console.log(`Mirroring: ${sourceUrl} -> ${targetKey}`);

  // In development mode, RUST_MIRROR_BUCKET might not be available
  if (typeof RUST_MIRROR_BUCKET === "undefined") {
    console.log(`DEV MODE: Would mirror ${sourceUrl} -> ${targetKey}`);
    return;
  }

  // Check if file already exists in R2
  try {
    const existing = await RUST_MIRROR_BUCKET.head(targetKey);
    if (existing) {
      console.log(`File already exists: ${targetKey}, size: ${existing.size}`);
      return;
    } else {
      console.log(`File does not exist: ${targetKey}`);
    }
  } catch (e) {
    console.log(
      `File does not exist (exception): ${targetKey}, error: ${e.message}`,
    );
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
  }

  await RUST_MIRROR_BUCKET.put(targetKey, response.body, {
    httpMetadata: {
      contentType:
        response.headers.get("content-type") || "application/octet-stream",
    },
  });

  console.log(`Successfully mirrored: ${targetKey}`);
}
