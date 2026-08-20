import { describe, expect, test } from "vitest";
import {
  enrichLinuxGpu,
  isWslEnvironment,
  parseCpuName,
  parseLspciGpu,
  parseMemTotalGB,
  parseNvidiaSmi,
} from "../src/hardware-linux";
import { parseAppleChip, parseMacGpuProfile } from "../src/hardware-macos";

describe("Linux and WSL hardware parsing", () => {
  test("detects WSL from kernel metadata or environment", () => {
    expect(isWslEnvironment("Linux version 5.15.153.1-microsoft-standard-WSL2", "", {})).toBe(true);
    expect(isWslEnvironment("Linux version 6.8", "6.8.0-generic", { WSL_DISTRO_NAME: "Ubuntu" })).toBe(true);
    expect(isWslEnvironment("Linux version 6.8", "6.8.0-generic", {})).toBe(false);
  });

  test("parses Linux memory and CPU fallbacks", () => {
    expect(parseMemTotalGB("MemTotal:       16384000 kB\nMemFree: 100 kB")).toBe(15.6);
    expect(parseCpuName("processor: 0\nmodel name : AMD Ryzen 9 7950X\n")).toBe("AMD Ryzen 9 7950X");
    expect(parseCpuName("processor: 0\nHardware : Apple Virtual Platform\n")).toBe("Apple Virtual Platform");
  });

  test("parses NVIDIA passthrough output", () => {
    expect(parseNvidiaSmi("NVIDIA GeForce RTX 4090, 24564, 00000000:01:00.0")).toMatchObject({
      name: "NVIDIA GeForce RTX 4090",
      vendor: "NVIDIA",
      vramMB: 24564,
      backend: "cuda",
    });
  });

  test("finds integrated and discrete GPUs from lspci", () => {
    expect(parseLspciGpu("00:02.0 VGA compatible controller: Intel Corporation Iris Xe Graphics (rev 0c)")).toMatchObject({
      vendor: "Intel",
      integrated: true,
    });
    expect(parseLspciGpu("03:00.0 3D controller: NVIDIA Corporation AD104 [GeForce RTX 4070] (rev a1)")).toMatchObject({
      vendor: "NVIDIA",
      integrated: false,
    });
  });

  test("enriches laptop and integrated GPUs from the shared catalog", () => {
    expect(enrichLinuxGpu({
      name: "NVIDIA Corporation AD106M [GeForce RTX 4070 Laptop GPU]",
      vendor: "NVIDIA",
      integrated: false,
    }, null)).toMatchObject({
      vramMB: 8192,
      bandwidthGBs: 256,
    });
    expect(enrichLinuxGpu({
      name: "AMD Radeon 780M Graphics",
      vendor: "AMD",
      integrated: true,
    }, null)).toMatchObject({
      vramMB: null,
      bandwidthGBs: 89,
    });
    expect(enrichLinuxGpu({
      name: "Intel Corporation Iris Xe Graphics",
      vendor: "Intel",
      integrated: true,
    }, null)).toMatchObject({
      vramMB: null,
      bandwidthGBs: 68,
    });
    expect(enrichLinuxGpu({
      name: "Intel Corporation DG2 [Arc A770 Graphics]",
      vendor: "Intel",
      integrated: true,
    }, null)).toMatchObject({
      integrated: false,
      vramMB: 16384,
      bandwidthGBs: 560,
    });
    expect(enrichLinuxGpu({
      name: "Acme Accelerator 12GB",
      vendor: "AMD",
      integrated: false,
    }, null).vramMB).toBe(12288);
  });
});

describe("macOS hardware parsing", () => {
  test("does not classify an unknown Apple chip as M1", () => {
    expect(parseAppleChip("Apple M6")).toBeNull();
    expect(parseAppleChip("Apple M4 Pro")).toBe("m4 pro");
  });

  test("parses Intel Mac display details", () => {
    const profile = parseMacGpuProfile(`
      Chipset Model: Intel Iris Plus Graphics
      Vendor: Intel
      VRAM (Dynamic, Max): 1536 MB
    `);
    expect(profile).toMatchObject({
      name: "Intel Iris Plus Graphics",
      vendor: "Intel",
      cores: null,
    });
  });

  test("parses dedicated Mac VRAM", () => {
    expect(parseMacGpuProfile(`
      Chipset Model: AMD Radeon Pro 5500M
      Vendor: AMD (0x1002)
      VRAM (Total): 8 GB
    `)).toMatchObject({
      vendor: "AMD",
      vramGB: 8,
    });
  });
});
