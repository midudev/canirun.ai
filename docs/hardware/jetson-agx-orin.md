# NVIDIA Jetson AGX Orin support

## Problem and behavior

Jetson AGX Orin was absent from the device catalog. Browser detection could fall
back to generic NVIDIA heuristics, which do not describe its shared memory.
Users can now select a known module under **SBC / Embedded**, including when
the browser cannot identify the module.

| Profile | Shared RAM | CUDA cores | Nominal memory bandwidth |
| --- | --- | --- | --- |
| AGX Orin 32GB | 32 GB | 1,792 | 204.8 GB/s |
| AGX Orin 64GB | 64 GB | 2,048 | 204.8 GB/s |
| AGX Orin Industrial | 64 GB | 2,048 | 204.8 GB/s |

Source: [NVIDIA Jetson Orin technical specifications](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/).
These are module specifications, not measured inference results. Select the
installed module rather than assuming every developer kit has the same RAM.

## Implementation and review map

- [Compatibility engine](../../packages/compatibility/src/index.ts): extends
  `SBC_DB` with optional vendor/core metadata and adds the three profiles.
  Existing embedded profiles retain Raspberry Pi branding by default.
- The same engine recognizes explicit AGX Orin names in WebGL renderer or
  WebGPU adapter information. It does not classify generic NVIDIA, Tegra,
  Orin NX, or Orin Nano names as AGX Orin. A family-only name leaves RAM and
  GPU core count unknown; `navigator.deviceMemory` is not used to guess the
  module. The explicit Industrial designation identifies the 64GB profile.
- Profiles set `isUnifiedMemory` and `isSbc`, clear dedicated VRAM, and use one
  memory pool. Existing evaluation reserves 25% of shared RAM for the OS and
  runtime. This is a heuristic, not a measurement of available RAM.
- Separate system-RAM offloading and identical discrete-GPU scaling do not
  apply. Embedded bandwidth remains on the nominal catalog value.
- Applying a catalog profile updates its display name so recommendation
  headings follow the selected device.
- [Device listings](../../src/lib/devices.ts): uses NVIDIA branding and unified
  memory labels for Jetson. Existing selector and slug generation automatically
  provide the options and device pages from the embedded database.
- [Hardware panel](../../src/components/ModelListContent.astro): labels shared
  capacity as “Unified”, explains the shared pool, and keeps the capacity
  selector editable even when detected RAM is unknown.
- [Regression tests](../../tests/hardware.test.ts): covers profile selection,
  slug round trips, memory fit thresholds, clearing discrete-memory state,
  multi-GPU scaling exclusion, explicit and ambiguous names, and mocked
  WebGL/WebGPU detection with capped browser memory.

## Detection limitations

The browser used during verification exposed
`NVIDIA Corporation, NVIDIA Tegra Orin (nvgpu)/integrated` and had no available
WebGPU adapter. That string cannot distinguish AGX Orin from other Orin
modules or identify installed RAM. Exact automatic identification remains
unavailable for this renderer; manual selection is the supported route.

The explicit-name detection branches were exercised using browser API mocks.
The three manual profiles were exercised in a real browser. No inference
runtime or model was run, and JetPack/CUDA runtime compatibility is not checked.

## Validation

Validation performed on 2026-10-23 using temporary Node.js 24.22.1 and the
repository's pinned pnpm 11.22.0:

```bash
pnpm install --frozen-lockfile
pnpm packages:build
pnpm test
pnpm build
git diff --check
```

- Shared packages compiled successfully.
- Full test suite: **357 tests passed across 19 files**.
- Production build completed; all three Jetson HTML pages and sitemap entries
  were verified.
- Browser search for “Orin” returned all three profiles with unified labels.
- Each device page showed the expected memory, core count, 204.8 GB/s locked
  bandwidth, disabled separate system RAM, and populated recommendations.
- Switching from four RTX 4090 GPUs to AGX Orin 32GB cleared discrete-memory
  and multi-GPU overrides. The new selection persisted after reload.
- Whitespace checks passed.

The initial sandboxed build was blocked by Astro's temporary font-server
socket; the build passed after allowing that local socket. The final build
included the hardware-label and selected-name fixes.

### Reviewer browser checklist

1. Run `pnpm dev` and open `/devices`; search for “Orin”.
2. Open each of these pages and inspect the hardware panel and recommendations:
   - `/device/nvidia-jetson-agx-orin-32-gb`
   - `/device/nvidia-jetson-agx-orin-64-gb`
   - `/device/nvidia-jetson-agx-orin-industrial-64-gb`
3. On `/models`, select RTX 4090, set the count to four, then select AGX Orin
   32GB. Confirm unified memory is 32GB, bandwidth is 204.8 GB/s, separate RAM
   cannot be edited, and the discrete GPU count control is hidden.
4. Reload and confirm the selection persists. Change capacity to verify that
   model fit updates without adding a separate memory pool.

## Benchmark follow-up

Benchmarks should be a separate contribution: the existing throughput formula
uses bandwidth and a generic unified-memory efficiency factor. Its Orin
estimates have not been calibrated, and hardware support does not establish
that any particular model reaches the displayed speed.

A useful first measurement can reuse an already-downloaded model and runtime.
Record the exact module, JetPack/L4T and CUDA versions, runtime version/build,
model revision and file hash, quantization, context and prompt/output lengths,
GPU offload settings, power mode, clocks, temperature, and other workloads.
After a warm-up, repeat the same workload and report individual runs plus a
median. Separate prompt processing from token generation and include peak
memory usage. Do not include model download or loading time in token-generation
throughput. Keep the prompt and measurement command with the results.

One such result is useful as a labeled observation. Calibrating a general
estimator requires multiple model sizes and architectures, and preferably
multiple power modes. A future dataset needs provenance and a schema that
keeps measured results distinct from estimates; a single run should not
replace the generic efficiency factor for all unified-memory devices.
