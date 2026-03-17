// ── Types ──────────────────────────────────────────────────

export interface HardwareInfo {
  gpuRenderer: string | null;
  gpuVendor: string | null;
  gpuCores: number | null;
  ramGB: number | null;
  estimatedVRAM: number | null;
  memoryBandwidth: number | null;
  systemRAM: number | null;
  deviceMemoryRaw: number | null;
  webgpu: boolean;
  webgpuDevice: string | null;
  webgpuArch: string | null;
  isAppleSilicon: boolean;
  totalUsableRAM: number | null;
  platform: string | null;
  cpuBenchmark: number | null;
  isMobile: boolean;
  deviceName: string | null;
}

export type ModelStatus = "can-run" | "tight" | "can-run-slow" | "cannot-run" | "unknown";
export type Grade = "S" | "A" | "B" | "C" | "D" | "F" | "?";

export interface GradeInfo {
  letter: string;
  label: string;
  color: string;
}

// ── GPU Database ───────────────────────────────────────────

export const GPU_DB: Record<string, { vram: number; bw: number; cores: number }> = {
  "RTX 5090": { vram: 32, bw: 1792, cores: 21760 },
  "RTX 5080": { vram: 16, bw: 960, cores: 10752 },
  "RTX 5070 Ti": { vram: 16, bw: 896, cores: 8960 },
  "RTX 5070": { vram: 12, bw: 672, cores: 6144 },
  "RTX 5060 Ti 16GB": { vram: 16, bw: 448, cores: 4608 },
  "RTX 5060 Ti": { vram: 8, bw: 448, cores: 4608 },
  "RTX 5060": { vram: 8, bw: 448, cores: 3840 },
  "RTX 5050": { vram: 8, bw: 320, cores: 2560 },
  "RTX 4090": { vram: 24, bw: 1008, cores: 16384 },
  "RTX 4080 SUPER": { vram: 16, bw: 736, cores: 10240 },
  "RTX 4080": { vram: 16, bw: 717, cores: 9728 },
  "RTX 4070 Ti SUPER": { vram: 16, bw: 672, cores: 8448 },
  "RTX 4070 Ti": { vram: 12, bw: 504, cores: 7680 },
  "RTX 4070 SUPER": { vram: 12, bw: 504, cores: 7168 },
  "RTX 4070": { vram: 12, bw: 504, cores: 5888 },
  "RTX 4060 Ti 16GB": { vram: 16, bw: 288, cores: 4352 },
  "RTX 4060 Ti": { vram: 8, bw: 288, cores: 4352 },
  "RTX 4060": { vram: 8, bw: 272, cores: 3072 },
  "RTX 3090 Ti": { vram: 24, bw: 1008, cores: 10752 },
  "RTX 3090": { vram: 24, bw: 936, cores: 10496 },
  "RTX 3080 Ti": { vram: 12, bw: 912, cores: 10240 },
  "RTX 3080 12GB": { vram: 12, bw: 912, cores: 8960 },
  "RTX 3080": { vram: 10, bw: 760, cores: 8704 },
  "RTX 3070 Ti": { vram: 8, bw: 608, cores: 6144 },
  "RTX 3070": { vram: 8, bw: 448, cores: 5888 },
  "RTX 3060 Ti": { vram: 8, bw: 448, cores: 4864 },
  "RTX 3060": { vram: 12, bw: 360, cores: 3584 },
  "RTX 3050": { vram: 8, bw: 224, cores: 2560 },

  // NVIDIA Laptop GPUs — RTX 50 series
  "RTX 5090 Laptop": { vram: 24, bw: 896, cores: 10496 },
  "RTX 5080 Laptop": { vram: 16, bw: 896, cores: 7680 },
  "RTX 5070 Ti Laptop": { vram: 16, bw: 672, cores: 5888 },
  "RTX 5070 Laptop": { vram: 12, bw: 672, cores: 4608 },
  "RTX 5060 Laptop": { vram: 8, bw: 384, cores: 3328 },
  "RTX 5050 Laptop": { vram: 8, bw: 384, cores: 2560 },

  // NVIDIA Laptop GPUs — RTX 40 series
  "RTX 4090 Laptop": { vram: 16, bw: 576, cores: 9728 },
  "RTX 4080 Laptop": { vram: 12, bw: 432, cores: 7424 },
  "RTX 4070 Laptop": { vram: 8, bw: 256, cores: 4608 },
  "RTX 4060 Laptop": { vram: 8, bw: 256, cores: 3072 },
  "RTX 4050 Laptop": { vram: 6, bw: 192, cores: 2560 },

  // NVIDIA Laptop GPUs — RTX 30 series
  "RTX 3080 Ti Laptop": { vram: 16, bw: 512, cores: 7424 },
  "RTX 3080 Laptop": { vram: 16, bw: 448, cores: 6144 },
  "RTX 3070 Ti Laptop": { vram: 8, bw: 448, cores: 5120 },
  "RTX 3070 Laptop": { vram: 8, bw: 448, cores: 5120 },
  "RTX 3060 Laptop": { vram: 6, bw: 336, cores: 3840 },
  "RTX 3050 Ti Laptop": { vram: 4, bw: 192, cores: 2560 },
  "RTX 3050 Laptop": { vram: 4, bw: 192, cores: 2048 },
  "RTX PRO 6000": { vram: 96, bw: 1792, cores: 24064 },
  "RTX 6000 Ada": { vram: 48, bw: 960, cores: 18176 },
  "RTX 5880 Ada": { vram: 48, bw: 960, cores: 14080 },
  "RTX 5000 Ada": { vram: 32, bw: 576, cores: 12800 },
  "RTX 4500 Ada": { vram: 24, bw: 432, cores: 7680 },
  "RTX 4000 SFF Ada": { vram: 20, bw: 360, cores: 6144 },
  "RTX 4000 Ada": { vram: 20, bw: 360, cores: 6144 },
  "RTX 3500 Ada": { vram: 12, bw: 288, cores: 5120 },
  "RTX 2000 Ada": { vram: 16, bw: 224, cores: 2816 },
  "RTX A6000": { vram: 48, bw: 768, cores: 10752 },
  "RTX A5500": { vram: 24, bw: 768, cores: 10240 },
  "RTX A5000": { vram: 24, bw: 768, cores: 8192 },
  "RTX A4500": { vram: 20, bw: 640, cores: 7168 },
  "RTX A4000": { vram: 16, bw: 448, cores: 6144 },
  "RTX A2000": { vram: 6, bw: 288, cores: 3328 },

  // RTX 20 series - importantes
  "RTX 2080 Ti": { vram: 11, bw: 616, cores: 4352 },
  "RTX 2080 SUPER": { vram: 8, bw: 496, cores: 3072 },
  "RTX 2080": { vram: 8, bw: 448, cores: 2944 },
  "RTX 2070 SUPER": { vram: 8, bw: 448, cores: 2560 },
  "RTX 2070": { vram: 8, bw: 448, cores: 2304 },
  "RTX 2060 SUPER": { vram: 8, bw: 448, cores: 2176 },
  "RTX 2060": { vram: 6, bw: 336, cores: 1920 },

  // Variantes útiles
  "RTX 2060 12GB": { vram: 12, bw: 336, cores: 2176 },
  "RTX 3050 6GB": { vram: 6, bw: 168, cores: 2304 },

  "A100": { vram: 80, bw: 2039, cores: 6912 },
  "H100": { vram: 80, bw: 3350, cores: 14592 },
  "GH200": { vram: 96, bw: 4000, cores: 16896 },
  "DGX Spark": { vram: 128, bw: 273, cores: 6144 },
  "L40S": { vram: 48, bw: 864, cores: 18176 },
  "L4": { vram: 24, bw: 300, cores: 7424 },
  "T4": { vram: 16, bw: 300, cores: 2560 },
  "Tesla P40": { vram: 24, bw: 346, cores: 3840 },
  "RX 7900 XTX": { vram: 24, bw: 960, cores: 6144 },
  "RX 7900 XT": { vram: 20, bw: 800, cores: 5376 },
  "RX 7800 XT": { vram: 16, bw: 624, cores: 3840 },
  "RX 7700 XT": { vram: 12, bw: 432, cores: 3456 },
  "RX 7600 XT": { vram: 16, bw: 288, cores: 2048 },
  "RX 7600": { vram: 8, bw: 288, cores: 2048 },
  "RX 6900 XT": { vram: 16, bw: 512, cores: 5120 },
  "RX 6800 XT": { vram: 16, bw: 512, cores: 4608 },
  "RX 6800": { vram: 16, bw: 512, cores: 3840 },
  "RX 6750 XT": { vram: 12, bw: 432, cores: 2560 },
  "RX 6700 XT": { vram: 12, bw: 384, cores: 2560 },
  "RX 6650 XT": { vram: 8, bw: 280, cores: 2048 },
  "RX 6600 XT": { vram: 8, bw: 256, cores: 2048 },
  "RX 6600": { vram: 8, bw: 224, cores: 1792 },
  "RX 6500 XT": { vram: 4, bw: 144, cores: 1024 },
  "Arc A770": { vram: 16, bw: 560, cores: 4096 },
  "Arc A750": { vram: 8, bw: 512, cores: 3584 },
  "Arc A580": { vram: 8, bw: 512, cores: 3072 },
  "Arc A380": { vram: 6, bw: 186, cores: 1024 },

  // GTX 16 series
  "GTX 1660 Ti": { vram: 6, bw: 288, cores: 1536 },
  "GTX 1660 SUPER": { vram: 6, bw: 336, cores: 1408 },
  "GTX 1660": { vram: 6, bw: 192, cores: 1408 },
  "GTX 1650 SUPER": { vram: 4, bw: 192, cores: 1280 },
  "GTX 1650 Ti": { vram: 4, bw: 192, cores: 1024 },
  "GTX 1650": { vram: 4, bw: 128, cores: 896 },
  "GTX 1630": { vram: 4, bw: 96, cores: 512 },

  // GTX 10 series
  "GTX 1080 Ti": { vram: 11, bw: 484, cores: 3584 },
  "GTX 1080": { vram: 8, bw: 320, cores: 2560 },
  "GTX 1070 Ti": { vram: 8, bw: 256, cores: 2432 },
  "GTX 1070": { vram: 8, bw: 256, cores: 1920 },
  "GTX 1060 6GB": { vram: 6, bw: 192, cores: 1280 },
  "GTX 1060 3GB": { vram: 3, bw: 192, cores: 1152 },
  "GTX 1060": { vram: 6, bw: 192, cores: 1280 },
  "GTX 1050 Ti": { vram: 4, bw: 112, cores: 768 },
  "GTX 1050": { vram: 2, bw: 112, cores: 640 },

  // GTX 9 series
  "GTX 980 Ti": { vram: 6, bw: 336, cores: 2816 },
  "GTX 980": { vram: 4, bw: 224, cores: 2048 },
  "GTX 970": { vram: 4, bw: 224, cores: 1664 },
  "GTX 960": { vram: 2, bw: 112, cores: 1024 },
  "GTX 950": { vram: 2, bw: 105, cores: 768 },

  // NVIDIA Quadro / professional (Turing)
  "Quadro RTX 8000": { vram: 48, bw: 672, cores: 4608 },
  "Quadro RTX 6000": { vram: 24, bw: 672, cores: 4608 },
  "Quadro RTX 5000": { vram: 16, bw: 448, cores: 3072 },
  "Quadro RTX 4000": { vram: 8, bw: 416, cores: 2304 },
  "Quadro RTX 3000": { vram: 6, bw: 336, cores: 1920 },
  "Quadro T2000": { vram: 4, bw: 128, cores: 1024 },
  "Quadro T1000": { vram: 4, bw: 160, cores: 896 },
  "T1200": { vram: 4, bw: 160, cores: 1024 },
  "NVIDIA T600": { vram: 4, bw: 160, cores: 640 },
  "NVIDIA T550": { vram: 4, bw: 128, cores: 1024 },
  "NVIDIA T500": { vram: 4, bw: 128, cores: 1024 },

  // NVIDIA Quadro / professional (Pascal)
  "Quadro P5200": { vram: 16, bw: 256, cores: 2560 },
  "Quadro P5000": { vram: 16, bw: 288, cores: 2560 },
  "Quadro P4200": { vram: 8, bw: 224, cores: 1792 },
  "Quadro P4000": { vram: 8, bw: 243, cores: 1792 },
  "Quadro P3000": { vram: 6, bw: 168, cores: 1280 },
  "Quadro P3200": { vram: 6, bw: 192, cores: 1280 },
  "Quadro P2000": { vram: 5, bw: 140, cores: 1024 },
  "Quadro P1000": { vram: 4, bw: 82, cores: 640 },
  "Quadro P620": { vram: 2, bw: 80, cores: 512 },
  "Quadro P600": { vram: 2, bw: 64, cores: 384 },
  "Quadro P520": { vram: 2, bw: 80, cores: 384 },
  "Quadro P500": { vram: 2, bw: 64, cores: 256 },

  // NVIDIA Quadro / professional (Maxwell)
  "Quadro M5500": { vram: 8, bw: 211, cores: 2048 },
  "Quadro M5000M": { vram: 8, bw: 160, cores: 1536 },
  "Quadro M4000M": { vram: 4, bw: 160, cores: 1024 },
  "Quadro M3000M": { vram: 4, bw: 160, cores: 1024 },
  "Quadro M2200": { vram: 4, bw: 140, cores: 1024 },
  "Quadro M2000M": { vram: 4, bw: 80, cores: 640 },
  "Quadro M1200": { vram: 4, bw: 128, cores: 640 },
  "Quadro M1000M": { vram: 2, bw: 80, cores: 512 },
  "Quadro M620": { vram: 2, bw: 80, cores: 512 },
  "Quadro M600M": { vram: 2, bw: 64, cores: 384 },
  "Quadro M520": { vram: 2, bw: 80, cores: 384 },
  "Quadro M500M": { vram: 2, bw: 64, cores: 384 },

  // NVIDIA Quadro / professional (Kepler)
  "Quadro K5100M": { vram: 8, bw: 160, cores: 1536 },
  "Quadro K5000M": { vram: 4, bw: 173, cores: 1344 },
  "Quadro K4100M": { vram: 4, bw: 115, cores: 1152 },
  "Quadro K4000M": { vram: 4, bw: 134, cores: 960 },
  "Quadro K3100M": { vram: 4, bw: 80, cores: 768 },
  "Quadro K3000M": { vram: 2, bw: 80, cores: 576 },
  "Quadro K2100M": { vram: 2, bw: 64, cores: 576 },
  "Quadro K2000M": { vram: 2, bw: 64, cores: 384 },
  "Quadro K1100M": { vram: 2, bw: 64, cores: 384 },
  "Quadro K1000M": { vram: 2, bw: 64, cores: 384 },
  "Quadro K620M": { vram: 2, bw: 64, cores: 384 },
  "Quadro K610M": { vram: 1, bw: 29, cores: 192 },
  "Quadro K510M": { vram: 2, bw: 80, cores: 384 },
  "Quadro K500M": { vram: 2, bw: 64, cores: 192 },

  // NVIDIA RTX Ampere workstation entries missing from old Quadro matrix
  "RTX A3000": { vram: 6, bw: 192, cores: 4096 },
  "RTX A3000 12GB": { vram: 12, bw: 336, cores: 4096 },
  "RTX A2000 8GB": { vram: 8, bw: 288, cores: 3328 },
  "RTX A1000": { vram: 4, bw: 192, cores: 2048 },
  "RTX A500": { vram: 4, bw: 128, cores: 2048 },

  // AMD RX 5xxx (RDNA 1)
  "RX 5700 XT": { vram: 8, bw: 448, cores: 2560 },
  "RX 5700": { vram: 8, bw: 448, cores: 2304 },
  "RX 5600 XT": { vram: 6, bw: 288, cores: 2304 },
  "RX 5500 XT": { vram: 8, bw: 224, cores: 1408 },

  // AMD RX 500 series (Polaris)
  "RX 590": { vram: 8, bw: 256, cores: 2304 },
  "RX 580": { vram: 8, bw: 256, cores: 2304 },
  "RX 570": { vram: 4, bw: 224, cores: 2048 },
  "RX 560": { vram: 4, bw: 112, cores: 1024 },

  // AMD RX Vega
  "Radeon VII": { vram: 16, bw: 1024, cores: 3840 },
  "Vega 64": { vram: 8, bw: 484, cores: 4096 },
  "Vega 56": { vram: 8, bw: 410, cores: 3584 },

  // AMD RX 9xxx (RDNA 4)
  "RX 9070 XT": { vram: 16, bw: 650, cores: 4096 },
  "RX 9070": { vram: 16, bw: 540, cores: 3584 },

  // AMD Discrete Laptop GPUs (RX 7000M/S)
  "RX 7900M": { vram: 16, bw: 720, cores: 4608 },
  "RX 7700S": { vram: 8, bw: 288, cores: 2048 },
  "RX 7600M XT": { vram: 8, bw: 288, cores: 2048 },
  "RX 7600M": { vram: 8, bw: 288, cores: 1792 },
  "RX 7600S": { vram: 8, bw: 288, cores: 1792 },

  // AMD Discrete Laptop GPUs (RX 6000M)
  "RX 6800M": { vram: 12, bw: 384, cores: 2560 },
  "RX 6700M": { vram: 10, bw: 320, cores: 2304 },
  "RX 6600M": { vram: 8, bw: 256, cores: 1792 },
  "RX 6500M": { vram: 4, bw: 144, cores: 1024 },

  // AMD Integrated GPUs (Ryzen APUs)
  "Ryzen AI MAX+ 395": { vram: 96, bw: 256, cores: 2560 },
  "Radeon 890M": { vram: 0, bw: 89, cores: 1024 },
  "Radeon 880M": { vram: 0, bw: 89, cores: 768 },
  "Radeon 780M": { vram: 0, bw: 89, cores: 768 },
  "Radeon 760M": { vram: 0, bw: 89, cores: 512 },
  "Radeon 680M": { vram: 0, bw: 77, cores: 768 },
  "Radeon 660M": { vram: 0, bw: 77, cores: 384 },
  "Vega 8": { vram: 0, bw: 51, cores: 512 },
  "Vega 7": { vram: 0, bw: 51, cores: 448 },

  // Intel Arc Laptop GPUs
  "Arc A770M": { vram: 16, bw: 512, cores: 4096 },
  "Arc A550M": { vram: 8, bw: 224, cores: 2048 },
  "Arc A370M": { vram: 4, bw: 112, cores: 1024 },

  // Intel integrated
  "Iris Xe": { vram: 0, bw: 68, cores: 96 },
  "Iris Plus": { vram: 0, bw: 50, cores: 64 },
  "UHD 770": { vram: 0, bw: 76, cores: 32 },
  "UHD 730": { vram: 0, bw: 76, cores: 24 },
  "UHD Graphics 630": { vram: 0, bw: 42, cores: 24 },
  "UHD Graphics 620": { vram: 0, bw: 34, cores: 24 },
};

export const APPLE_DB: Record<string, { ram: number; bw: number; cpuCores: number; gpuCores: number }> = {
  "m5 max": { ram: 36, bw: 614, cpuCores: 18, gpuCores: 40 },
  "m5 pro": { ram: 24, bw: 307, cpuCores: 18, gpuCores: 20 },
  "m5": { ram: 16, bw: 153, cpuCores: 10, gpuCores: 10 },
  "m4 max": { ram: 36, bw: 546, cpuCores: 16, gpuCores: 32 },
  "m4 pro": { ram: 24, bw: 273, cpuCores: 14, gpuCores: 18 },
  "m4": { ram: 16, bw: 120, cpuCores: 10, gpuCores: 10 },
  "m3 ultra": { ram: 64, bw: 819, cpuCores: 24, gpuCores: 60 },
  "m3 max": { ram: 36, bw: 408, cpuCores: 16, gpuCores: 30 },
  "m3 pro": { ram: 18, bw: 150, cpuCores: 12, gpuCores: 14 },
  "m3": { ram: 8, bw: 100, cpuCores: 8, gpuCores: 10 },
  "m2 ultra": { ram: 64, bw: 819, cpuCores: 24, gpuCores: 60 },
  "m2 max": { ram: 32, bw: 408, cpuCores: 12, gpuCores: 30 },
  "m2 pro": { ram: 16, bw: 200, cpuCores: 10, gpuCores: 16 },
  "m2": { ram: 8, bw: 100, cpuCores: 8, gpuCores: 10 },
  "m1 ultra": { ram: 64, bw: 819, cpuCores: 20, gpuCores: 48 },
  "m1 max": { ram: 32, bw: 408, cpuCores: 10, gpuCores: 24 },
  "m1 pro": { ram: 16, bw: 200, cpuCores: 10, gpuCores: 14 },
  "m1": { ram: 8, bw: 68, cpuCores: 8, gpuCores: 7 },
};

// ── Mobile GPU Database (Android) ──────────────────────────

export const MOBILE_GPU_DB: Record<string, { bw: number; ram?: number }> = {
  "Adreno 830": { bw: 90 },
  "Adreno 750": { bw: 77 },
  "Adreno 740": { bw: 62 },
  "Adreno 735": { bw: 51 },
  "Adreno 730": { bw: 51 },
  "Adreno 725": { bw: 44 },
  "Adreno 720": { bw: 38 },
  "Adreno 710": { bw: 34 },
  "Adreno 660": { bw: 44 },
  "Adreno 650": { bw: 44 },
  "Adreno 642": { bw: 17 },
  "Adreno 640": { bw: 34 },
  "Adreno 630": { bw: 30 },
  "Adreno 620": { bw: 17 },
  "Adreno 619": { bw: 17 },
  "Adreno 618": { bw: 14 },
  "Adreno 616": { bw: 14 },
  "Adreno 612": { bw: 10 },
  "Immortalis-G925": { bw: 77 },
  "Immortalis-G720": { bw: 77 },
  "Immortalis-G715": { bw: 51 },
  "Mali-G925": { bw: 77 },
  "Mali-G720": { bw: 77 },
  "Mali-G715": { bw: 51 },
  "Mali-G710": { bw: 44 },
  "Mali-G78": { bw: 35 },
  "Mali-G77": { bw: 30 },
  "Mali-G76": { bw: 25 },
  "Mali-G72": { bw: 20 },
  "Mali-G71": { bw: 15 },
  "Mali-G57": { bw: 17 },
  "Mali-G52": { bw: 12 },
  "Xclipse 940": { bw: 51 },
  "Xclipse 930": { bw: 44 },
  "Xclipse 920": { bw: 38 },
  "Tensor G5": { bw: 56, ram: 16 },
  "Tensor G4": { bw: 51, ram: 12 },
  "Tensor G3": { bw: 51, ram: 8 },
  "Tensor G2": { bw: 44, ram: 8 },
  "Tensor G1": { bw: 35, ram: 8 },
};

// ── SBC / Embedded Database ────────────────────────────────

export const SBC_DB: Record<string, { ram: number; bw: number }> = {
  "Raspberry Pi 5 (8 GB)": { ram: 8, bw: 32 },
  "Raspberry Pi 5 (4 GB)": { ram: 4, bw: 32 },
  "Raspberry Pi 4 (8 GB)": { ram: 8, bw: 13 },
  "Raspberry Pi 4 (4 GB)": { ram: 4, bw: 13 },
};

// ── iOS Device Detection ──────────────────────────────────

interface MobileDeviceInfo {
  name: string;
  ram: number;
  bw: number;
  cpuCores: number;
  gpuCores: number;
  isTablet: boolean;
}

function detectIOSDevice(cpuBenchmark: number): MobileDeviceInfo {
  const w = Math.min(screen.width, screen.height);
  const h = Math.max(screen.width, screen.height);
  const dpr = window.devicePixelRatio;
  const key = `${w}x${h}x${dpr}`;

  // iPad detection (logical width ≥ 744pt)
  if (w >= 744) {
    if (cpuBenchmark > 100) return { name: "iPad Pro (M-series)", ram: 16, bw: 100, cpuCores: 10, gpuCores: 10, isTablet: true };
    if (cpuBenchmark > 80) return { name: "iPad Air", ram: 8, bw: 68, cpuCores: 8, gpuCores: 10, isTablet: true };
    return { name: "iPad", ram: 4, bw: 42, cpuCores: 6, gpuCores: 4, isTablet: true };
  }

  // Screen sizes exclusive to Pro / Pro Max models (higher RAM)
  const proMaxScreens = ["440x956x3"];
  const proScreens = ["402x874x3"];
  const isPro = proScreens.includes(key) || proMaxScreens.includes(key);
  const suffix = proMaxScreens.includes(key) ? " Pro Max" : proScreens.includes(key) ? " Pro" : "";

  // Estimate chip generation from CPU benchmark + screen tier
  if (cpuBenchmark > 115) return { name: `iPhone${suffix} (A19 Pro)`, ram: 8, bw: 77, cpuCores: 6, gpuCores: 6, isTablet: false };
  if (cpuBenchmark > 105) return { name: `iPhone${suffix} (A18 Pro)`, ram: 8, bw: 68, cpuCores: 6, gpuCores: 6, isTablet: false };
  if (cpuBenchmark > 97) return { name: `iPhone${suffix} (A18)`, ram: 8, bw: 60, cpuCores: 6, gpuCores: 5, isTablet: false };
  if (cpuBenchmark > 90) return { name: `iPhone${suffix} (A17 Pro)`, ram: 8, bw: 68, cpuCores: 6, gpuCores: 6, isTablet: false };
  if (cpuBenchmark > 75) return { name: `iPhone (A16)`, ram: isPro ? 8 : 6, bw: 51, cpuCores: 6, gpuCores: 5, isTablet: false };
  if (cpuBenchmark > 60) return { name: `iPhone (A15)`, ram: 6, bw: 51, cpuCores: 6, gpuCores: 5, isTablet: false };
  if (cpuBenchmark > 45) return { name: `iPhone (A14)`, ram: 4, bw: 42, cpuCores: 6, gpuCores: 4, isTablet: false };
  return { name: "iPhone (A13 or older)", ram: 4, bw: 34, cpuCores: 6, gpuCores: 4, isTablet: false };
}

function matchMobileGPU(renderer: string): { name: string; bw: number } | null {
  const normalized = renderer.toUpperCase().replace(/\(TM\)/gi, "").replace(/\s+/g, " ").trim();
  for (const [name, data] of Object.entries(MOBILE_GPU_DB)) {
    if (normalized.includes(name.toUpperCase())) return { name, bw: data.bw };
  }
  return null;
}

// ── Apple Silicon identification (Safari fallback) ────────
// Safari hides the specific chip name, so we identify it by comparing measured
// hardware signals against known APPLE_DB entries using weighted scoring.

function identifyAppleChip(signals: {
  measuredBW: number | null;
  estimatedRAM: number | null;
  estimatedGPUCores: number | null;
  cpuBenchmark: number;
  cpuCores: number;
}): string | null {
  const { measuredBW, estimatedRAM, estimatedGPUCores, cpuBenchmark, cpuCores } = signals;
  const hasGPUSignals = estimatedRAM !== null || estimatedGPUCores !== null;

  let bestChip: string | null = null;
  let bestScore = -1;

  for (const [chip, data] of Object.entries(APPLE_DB)) {
    let score = 0;

    // Bandwidth — strongest when from WebGPU (accurate), nearly useless from WebGL
    // on Safari (Metal backend has very different efficiency than Chrome/ANGLE's 0.35)
    if (measuredBW !== null) {
      const ratio = measuredBW / data.bw;
      const bwWeight = hasGPUSignals ? 35 : 3;
      score += bwWeight * Math.max(0, 1 - Math.abs(1 - ratio));
    }

    // RAM from WebGPU maxBufferSize
    if (estimatedRAM !== null) {
      const ratio = estimatedRAM / data.ram;
      score += 25 * Math.max(0, 1 - Math.abs(1 - ratio));
    }

    // GPU cores from WebGPU compute benchmark
    if (estimatedGPUCores !== null) {
      const ratio = estimatedGPUCores / data.gpuCores;
      score += 20 * Math.max(0, 1 - Math.abs(1 - ratio));
    }

    // CPU cores from navigator.hardwareConcurrency — most reliable signal in Safari
    if (cpuCores > 0) {
      const diff = Math.abs(cpuCores - data.cpuCores);
      score += 20 * Math.max(0, 1 - diff / 8);
    }

    // CPU benchmark → chip generation (M1≈67, M2≈82, M3≈95, M4≈107, M5≈120)
    const gen = parseInt(chip.match(/m(\d)/)?.[1] || "0");
    if (gen > 0 && cpuBenchmark > 0) {
      const centers: Record<number, number> = { 1: 67, 2: 82, 3: 95, 4: 107, 5: 120 };
      const center = centers[gen] ?? 67;
      const diff = Math.abs(cpuBenchmark - center);
      score += Math.max(0, 10 - diff * 0.4);
    }

    if (score > bestScore) {
      bestScore = score;
      bestChip = chip;
    }
  }

  return bestScore > 5 ? bestChip : null;
}

// ── Detection ──────────────────────────────────────────────

function getGPUInfo(): { renderer: string | null; vendor: string | null } {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { renderer: null, vendor: null };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) {
      return {
        renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
        vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
      };
    }
    // Fallback for browsers that block WEBGL_debug_renderer_info (Safari 16.4+)
    return {
      renderer: gl.getParameter(gl.RENDERER),
      vendor: gl.getParameter(gl.VENDOR),
    };
  } catch {
    return { renderer: null, vendor: null };
  }
}

export function matchGPU(renderer: string): { vram: number; bw: number; cores: number } | null {
  const upper = renderer.toUpperCase().replace(/\(TM\)/g, "").replace(/\s+/g, " ").trim();
  let best: { vram: number; bw: number; cores: number } | null = null;
  let bestLen = 0;
  for (const [name, data] of Object.entries(GPU_DB)) {
    if (upper.includes(name.toUpperCase()) && name.length > bestLen) {
      best = data;
      bestLen = name.length;
    }
  }
  return best;
}

export function parseVRAMFromName(renderer: string): number | null {
  const m = renderer.match(/\((\d+)\s*GB\)/i) || renderer.match(/\b(\d+)\s*GB\b/i);
  if (m) {
    const gb = parseInt(m[1], 10);
    if (gb >= 1 && gb <= 128) return gb;
  }
  return null;
}

export function matchApple(renderer: string): { ram: number; bw: number; cpuCores: number; gpuCores: number } | null {
  const lower = renderer.toLowerCase();
  for (const [chip, data] of Object.entries(APPLE_DB)) {
    if (lower.includes(chip)) return data;
  }
  if (lower.includes("apple")) return APPLE_DB["m1"];
  return null;
}

export function isAppleSiliconCheck(renderer: string): boolean {
  const r = renderer.toLowerCase();
  return r.includes("apple") && (r.includes("m1") || r.includes("m2") || r.includes("m3") || r.includes("m4") || r.includes("m5") || r.includes("gpu"));
}

export function cleanGPUName(renderer: string): string {
  let name = renderer
    .replace(/^ANGLE\s*\(\s*/, "")
    .replace(/\)\s*$/, "")
    .replace(/,\s*ANGLE Metal Renderer:\s*/, " — ")
    .replace(/,\s*Unspecified Version\s*/i, "")
    .replace(/,\s*Direct3D.*$/i, "")
    .replace(/,\s*OpenGL.*$/i, "")
    .replace(/,\s*Vulkan.*$/i, "")
    .replace(/\s+Direct3D\d*/i, "")
    .replace(/vs_\d+_\d+.*$/, "")
    .replace(/\(0x[0-9A-Fa-f]+\)/g, "")
    .replace(/\s*\(\d+\s*GB\)/gi, "")
    .replace(/\s+\d+\s*GB\b/gi, "")
    .replace(/^(NVIDIA|AMD|Intel),\s*\1\b/i, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  const metalMatch = name.match(/Apple\s*(?:—\s*)?(.+)/i);
  if (metalMatch) name = metalMatch[1].trim() || name;
  return name;
}

// ── CPU Benchmark (single-core, ~30ms) ────────────────────

function runCPUBenchmark(): number {
  const iterations = 2_000_000;
  const start = performance.now();
  let x = 0;
  for (let i = 0; i < iterations; i++) {
    x += Math.sqrt(i) * Math.sin(i) + Math.cos(i);
  }
  const elapsed = performance.now() - start;
  // Prevent dead code elimination
  if (x === Infinity) console.log(x);
  // Score: ops per millisecond, normalized so ~100 = fast modern CPU
  return Math.round((iterations / elapsed) * 0.05);
}

// ── Platform detection ────────────────────────────────────

function detectPlatform(): string | null {
  const ua = navigator.userAgent;
  // iPhone/iPad must be checked before "Mac OS X" — iOS UAs contain both
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Mac OS X")) return "macOS";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("CrOS")) return "ChromeOS";
  if (ua.includes("Linux")) return "Linux";
  return null;
}

// ── WebGPU adapter info ───────────────────────────────────

async function getWebGPUInfo(): Promise<{
  supported: boolean;
  device: string | null;
  arch: string | null;
  adapter: any;
}> {
  try {
    if (!("gpu" in navigator)) return { supported: false, device: null, arch: null, adapter: null };
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) return { supported: false, device: null, arch: null, adapter: null };

    let device: string | null = null;
    let arch: string | null = null;

    // requestAdapterInfo() — available in Chrome 113+
    if (adapter.info) {
      const info = adapter.info;
      device = info.device || info.description || null;
      arch = info.architecture || null;
    } else if (typeof adapter.requestAdapterInfo === "function") {
      try {
        const info = await adapter.requestAdapterInfo();
        device = info.device || info.description || null;
        arch = info.architecture || null;
      } catch {}
    }

    return { supported: true, device, arch, adapter };
  } catch {
    return { supported: false, device: null, arch: null, adapter: null };
  }
}

// ── GPU Core Estimation (WebGPU benchmark fallback) ───────

const GFLOPS_PER_CORE: Record<string, number> = {
  apple: 400,
  nvidia: 5,
  amd: 4.5,
  ati: 4.5,
  intel: 16,
  qualcomm: 3,
  arm: 8,
};

async function estimateGPUCores(adapter: any, vendor: string | null): Promise<number | null> {
  try {
    const device = await adapter.requestDevice();
    const numElements = 512 * 1024;
    const iterations = 512;

    const module = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read_write> data: array<f32>;
        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) id: vec3u) {
          let idx = id.x;
          if (idx >= ${numElements}u) { return; }
          var x: f32 = f32(idx) * 0.001;
          for (var i: u32 = 0; i < ${iterations}u; i++) {
            x = x * 1.0001 + 0.0001;
          }
          data[idx] = x;
        }
      `,
    });

    const buffer = device.createBuffer({
      size: numElements * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer } }],
    });

    const dispatch = () => {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(numElements / 256));
      pass.end();
      device.queue.submit([enc.finish()]);
      return device.queue.onSubmittedWorkDone();
    };

    // Warmup pass
    await dispatch();

    // Timed pass
    const start = performance.now();
    await dispatch();
    const elapsed = performance.now() - start;

    buffer.destroy();
    device.destroy();

    // 2 FLOPs per iteration (multiply + add)
    const gflops = (numElements * iterations * 2) / elapsed / 1e6;

    const v = (vendor || "").toLowerCase();
    for (const [key, ratio] of Object.entries(GFLOPS_PER_CORE)) {
      if (v.includes(key)) return Math.round(gflops / ratio);
    }
    return null;
  } catch {
    return null;
  }
}

async function estimateBandwidthFromWebGPU(adapter: any): Promise<number | null> {
  try {
    const device = await adapter.requestDevice();
    const numElements = 4 * 1024 * 1024;
    const byteSize = numElements * 16;

    const module = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read> src: array<vec4<f32>>;
        @group(0) @binding(1) var<storage, read_write> dst: array<vec4<f32>>;
        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) id: vec3u) {
          if (id.x < ${numElements}u) {
            dst[id.x] = src[id.x];
          }
        }
      `,
    });

    const srcBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE,
    });
    const dstBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE,
    });

    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: srcBuffer } },
        { binding: 1, resource: { buffer: dstBuffer } },
      ],
    });

    const submit = () => {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(numElements / 256));
      pass.end();
      device.queue.submit([enc.finish()]);
    };

    submit();
    await device.queue.onSubmittedWorkDone();

    const passes = 10;
    const start = performance.now();
    for (let i = 0; i < passes; i++) submit();
    await device.queue.onSubmittedWorkDone();
    const elapsed = performance.now() - start;

    srcBuffer.destroy();
    dstBuffer.destroy();
    device.destroy();

    const totalBytes = byteSize * 2 * passes;
    const measuredGBs = totalBytes / elapsed / 1e6;
    // Compute-copy typically achieves ~60% of peak HW bandwidth
    return Math.round(measuredGBs / 0.6);
  } catch {
    return null;
  }
}

function estimateBandwidthFromWebGL(): number | null {
  try {
    const canvas = document.createElement("canvas");
    const size = 2048;
    canvas.width = size;
    canvas.height = size;
    const gl = canvas.getContext("webgl2");
    if (!gl) return null;

    const READS = 32;
    const vsSource = `#version 300 es
      in vec2 a_pos;
      out vec2 v_uv;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
        v_uv = a_pos * 0.5 + 0.5;
      }`;
    const fsSource = `#version 300 es
      precision highp float;
      uniform sampler2D u_tex;
      in vec2 v_uv;
      out vec4 o;
      void main() {
        vec4 s = vec4(0.0);
        float step = 1.0 / ${size}.0;
        for (int i = 0; i < ${READS}; i++) {
          s += texture(u_tex, fract(v_uv + vec2(float(i) * step, float(i) * step * 0.73)));
        }
        o = s * ${(1 / READS).toFixed(6)};
      }`;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const texData = new Uint8Array(size * size * 4);
    for (let i = 0; i < texData.length; i++) texData[i] = (i * 7 + 13) & 0xff;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, texData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    const rt = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rt);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt, 0);

    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, "u_tex"), 0);
    gl.viewport(0, 0, size, size);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish();

    const passes = 10;
    const start = performance.now();
    for (let i = 0; i < passes; i++) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish();
    const elapsed = performance.now() - start;

    gl.deleteTexture(tex);
    gl.deleteTexture(rt);
    gl.deleteFramebuffer(fb);
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteBuffer(buf);

    const bytesRead = size * size * READS * 4 * passes;
    const bytesWritten = size * size * 4 * passes;
    const measuredGBs = (bytesRead + bytesWritten) / elapsed / 1e6;
    // WebGL fragment shaders typically achieve ~30-45% of peak HW bandwidth
    const estimated = Math.round(measuredGBs / 0.35);

    if (estimated < 15 || estimated > 4000) return null;
    return estimated;
  } catch {
    return null;
  }
}

function estimateBandwidthHeuristic(
  renderer: string | null,
  vendor: string | null,
  vram: number | null,
  platform: string | null,
): number | null {
  if (!renderer && !vendor) return null;
  const upper = (renderer || "").toUpperCase();
  const v = (vendor || "").toUpperCase();

  const isNvidia = v.includes("NVIDIA") || upper.includes("NVIDIA") || upper.includes("GEFORCE");
  const isAmd = v.includes("AMD") || v.includes("ATI") || upper.includes("RADEON");
  const isIntel = v.includes("INTEL") || upper.includes("INTEL");

  if (isIntel && (upper.includes("UHD") || upper.includes("IRIS") || upper.includes("HD GRAPHICS"))) {
    return 50;
  }

  if (isNvidia) {
    if (upper.includes("RTX")) {
      if (vram && vram >= 20) return 700;
      if (vram && vram >= 12) return 450;
      if (vram && vram >= 8) return 300;
      return 250;
    }
    if (upper.includes("GTX")) {
      if (vram && vram >= 8) return 250;
      if (vram && vram >= 4) return 150;
      return 112;
    }
    if (vram && vram >= 8) return 300;
    return 150;
  }

  if (isAmd) {
    if (upper.includes("RADEON GRAPHICS") || upper.includes("RADEON(TM) GRAPHICS")) {
      return 55;
    }
    if (vram && vram >= 16) return 500;
    if (vram && vram >= 8) return 300;
    if (vram && vram >= 4) return 180;
    return 150;
  }

  // Generic fallback: assume DDR5 dual-channel for desktop
  if (platform === "Windows" || platform === "Linux") return 60;
  return null;
}

function estimateVRAMFromWebGPU(adapter: any): number | null {
  try {
    const maxBuffer = adapter.limits?.maxBufferSize;
    if (!maxBuffer) return null;

    const maxBufferGB = maxBuffer / (1024 ** 3);
    if (maxBufferGB < 0.5) return null;

    const rawEstimate = maxBufferGB * 2;
    const commonSizes = [2, 3, 4, 6, 8, 10, 11, 12, 16, 20, 24, 32, 48, 64, 80, 128, 192];
    let closest = commonSizes[0];
    for (const size of commonSizes) {
      if (Math.abs(size - rawEstimate) < Math.abs(closest - rawEstimate)) {
        closest = size;
      }
    }
    return closest >= 2 ? closest : null;
  } catch {
    return null;
  }
}

export async function detectHardware(): Promise<HardwareInfo> {
  const deviceMemory = (navigator as any).deviceMemory || null;
  const { renderer, vendor } = getGPUInfo();
  const platform = detectPlatform();

  const cpuBenchmark = runCPUBenchmark();
  const webgpuInfo = await getWebGPUInfo();

  let isApple = renderer ? isAppleSiliconCheck(renderer) : false;
  const gpuMatch = renderer ? matchGPU(renderer) : null;
  let appleMatch = renderer ? matchApple(renderer) : null;
  const parsedVRAM = renderer ? parseVRAMFromName(renderer) : null;
  const isMobile = platform === "iOS" || platform === "Android";

  // Safari hides specific chip names (returns "Apple GPU") — defer identification
  // until WebGPU/WebGL benchmarks provide real hardware measurements
  const rendererHasSpecificChip = renderer ? /\bm[1-9]\b/i.test(renderer) : false;
  const deferAppleId = platform === "macOS" && !rendererHasSpecificChip
    && (isApple || vendor?.toLowerCase().includes("apple") === true);
  if (deferAppleId) isApple = true;

  let totalUsableRAM: number | null = null;
  let estimatedVRAM: number | null = null;
  let memoryBandwidth: number | null = null;
  let deviceName: string | null = null;
  let gpuCores: number | null = null;

  if (platform === "iOS") {
    const iosDevice = detectIOSDevice(cpuBenchmark);
    deviceName = iosDevice.name;
    totalUsableRAM = iosDevice.ram;
    memoryBandwidth = iosDevice.bw;
    gpuCores = iosDevice.gpuCores;
    isApple = iosDevice.isTablet && cpuBenchmark > 100;
  } else if (platform === "Android") {
    const mobileGPU = renderer ? matchMobileGPU(renderer) : null;
    if (mobileGPU) {
      memoryBandwidth = mobileGPU.bw;
      deviceName = mobileGPU.name;
    }
    totalUsableRAM = deviceMemory;
    isApple = false;
  } else if (isApple && appleMatch && !deferAppleId) {
    totalUsableRAM = appleMatch.ram;
    memoryBandwidth = appleMatch.bw;
    gpuCores = appleMatch.gpuCores;
  } else if (gpuMatch) {
    estimatedVRAM = parsedVRAM ?? gpuMatch.vram;
    memoryBandwidth = gpuMatch.bw;
    gpuCores = gpuMatch.cores;
    totalUsableRAM = estimatedVRAM;
  } else {
    totalUsableRAM = deviceMemory;
    if (parsedVRAM) {
      estimatedVRAM = parsedVRAM;
      totalUsableRAM = parsedVRAM;
    }
  }

  // Fallback: estimate GPU cores via WebGPU compute benchmark
  if (!gpuCores && webgpuInfo.adapter) {
    gpuCores = await estimateGPUCores(webgpuInfo.adapter, vendor);
  }

  // Fallback: estimate VRAM via WebGPU maxBufferSize for discrete desktop GPUs
  if (!estimatedVRAM && !isApple && !isMobile && webgpuInfo.adapter) {
    const webgpuVRAM = estimateVRAMFromWebGPU(webgpuInfo.adapter);
    if (webgpuVRAM) {
      estimatedVRAM = webgpuVRAM;
      totalUsableRAM = webgpuVRAM;
    }
  }

  // Fallback chain for bandwidth estimation:
  // 1. WebGPU copy benchmark (most accurate)
  if (!memoryBandwidth && webgpuInfo.adapter) {
    memoryBandwidth = await estimateBandwidthFromWebGPU(webgpuInfo.adapter);
  }
  // 2. WebGL2 texture-read benchmark
  if (!memoryBandwidth) {
    memoryBandwidth = estimateBandwidthFromWebGL();
  }
  // 3. Heuristic based on GPU vendor, name, and VRAM
  if (!memoryBandwidth) {
    memoryBandwidth = estimateBandwidthHeuristic(renderer, vendor, estimatedVRAM ?? parsedVRAM, platform);
  }

  // Deferred Apple Silicon identification — now we have real measurements
  if (deferAppleId) {
    let ramSignal: number | null = null;
    if (webgpuInfo.adapter) {
      ramSignal = estimateVRAMFromWebGPU(webgpuInfo.adapter);
    }

    const chipName = identifyAppleChip({
      measuredBW: memoryBandwidth,
      estimatedRAM: ramSignal,
      estimatedGPUCores: gpuCores,
      cpuBenchmark,
      cpuCores: navigator.hardwareConcurrency || 0,
    });

    if (chipName && APPLE_DB[chipName]) {
      const data = APPLE_DB[chipName];
      totalUsableRAM = data.ram;
      memoryBandwidth = data.bw;
      gpuCores = data.gpuCores;
      deviceName = "Apple " + chipName.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
    }
  }

  // Apple Silicon: unified memory, no offloading possible
  // navigator.deviceMemory caps at 8 — we can only distinguish ≥8 GB vs <8 GB
  let systemRAM: number | null;
  if (isApple || isMobile) {
    systemRAM = null;
  } else if (deviceMemory != null) {
    systemRAM = deviceMemory >= 8 ? 16 : 4;
  } else {
    systemRAM = 16;
  }

  return {
    gpuRenderer: renderer,
    gpuVendor: vendor,
    gpuCores,
    ramGB: totalUsableRAM,
    estimatedVRAM,
    memoryBandwidth,
    systemRAM,
    deviceMemoryRaw: deviceMemory,
    webgpu: webgpuInfo.supported,
    webgpuDevice: webgpuInfo.device,
    webgpuArch: webgpuInfo.arch,
    isAppleSilicon: isApple,
    totalUsableRAM,
    platform,
    cpuBenchmark,
    isMobile,
    deviceName,
  };
}

// ── Evaluation ─────────────────────────────────────────────

export function evaluateModel(vramNeeded: number, hw: HardwareInfo): ModelStatus {
  // Mobile (non-Apple-Silicon): OS reserves 45-50% of RAM
  if (hw.isMobile && !hw.isAppleSilicon && hw.totalUsableRAM) {
    const factor = hw.platform === "iOS" ? 0.50 : 0.55;
    const usable = hw.totalUsableRAM * factor;
    if (vramNeeded <= usable * 0.7) return "can-run";
    if (vramNeeded <= usable) return "tight";
    return "cannot-run";
  }
  if (hw.isAppleSilicon && hw.totalUsableRAM) {
    const usable = hw.totalUsableRAM * 0.75;
    if (vramNeeded <= usable * 0.7) return "can-run";
    if (vramNeeded <= usable) return "tight";
    return "cannot-run";
  }
  if (hw.estimatedVRAM) {
    if (vramNeeded <= hw.estimatedVRAM * 0.85) return "can-run";
    if (vramNeeded <= hw.estimatedVRAM * 1.1) return "tight";
    // Doesn't fit in VRAM — check CPU offloading via system RAM
    if (hw.systemRAM && hw.systemRAM > hw.estimatedVRAM) {
      const usableRAM = hw.systemRAM * 0.70;
      const totalOffload = hw.estimatedVRAM + usableRAM;
      if (vramNeeded <= totalOffload) return "can-run-slow";
    }
    return "cannot-run";
  }
  if (hw.totalUsableRAM) {
    const usable = hw.totalUsableRAM * 0.7;
    if (vramNeeded <= usable * 0.7) return "can-run";
    if (vramNeeded <= usable) return "tight";
    return "cannot-run";
  }
  return "unknown";
}

const SYSTEM_RAM_BW_GBS = 50; // DDR5 dual-channel ~50 GB/s

export function estimateTokensPerSecond(modelVRAM: number, hw: HardwareInfo): number | null {
  if (!hw.memoryBandwidth) return null;
  let efficiency: number;
  if (hw.isMobile && !hw.isAppleSilicon) {
    efficiency = 0.40;
  } else if (hw.isAppleSilicon) {
    efficiency = 0.65;
  } else {
    efficiency = 0.70;
  }

  // If model needs offloading (exceeds VRAM but fits in VRAM+RAM)
  if (hw.estimatedVRAM && modelVRAM > hw.estimatedVRAM && hw.systemRAM) {
    const fractionVRAM = Math.min(1, hw.estimatedVRAM / modelVRAM);
    const fractionRAM = 1 - fractionVRAM;
    // Harmonic weighted mean — bottlenecked by the slower path
    const effectiveBW = 1 / (fractionVRAM / hw.memoryBandwidth + fractionRAM / SYSTEM_RAM_BW_GBS);
    const toks = (effectiveBW / modelVRAM) * efficiency * 0.85; // extra penalty for PCIe transfer overhead
    return Math.max(1, Math.round(toks));
  }

  const toks = (hw.memoryBandwidth / modelVRAM) * efficiency;
  return Math.round(toks);
}

export function memoryPercentage(vramNeeded: number, hw: HardwareInfo): number | null {
  if (hw.isMobile || hw.isAppleSilicon) {
    if (!hw.totalUsableRAM) return null;
    return Math.round((vramNeeded / hw.totalUsableRAM) * 100);
  }
  const vram = hw.estimatedVRAM || hw.totalUsableRAM;
  if (!vram) return null;
  // If offloading, show % of VRAM (will be >100%)
  return Math.round((vramNeeded / vram) * 100);
}

function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

export function computeScore(status: ModelStatus, toksPerSec: number | null, paramsBillions: number, memPct: number | null = null): number {
  if (status === "cannot-run" || status === "unknown") return 0;

  // Speed score — continuous interpolation for smooth distribution
  let speedScore = 0;
  if (toksPerSec !== null) {
    if (toksPerSec >= 80) speedScore = 100;
    else if (toksPerSec >= 40) speedScore = lerp(toksPerSec, 40, 80, 80, 100);
    else if (toksPerSec >= 20) speedScore = lerp(toksPerSec, 20, 40, 55, 80);
    else if (toksPerSec >= 10) speedScore = lerp(toksPerSec, 10, 20, 35, 55);
    else if (toksPerSec >= 5) speedScore = lerp(toksPerSec, 5, 10, 15, 35);
    else speedScore = lerp(Math.max(toksPerSec, 0), 0, 5, 0, 15);
  } else {
    speedScore = status === "can-run" ? 45 : 20;
  }

  // Memory headroom score — continuous interpolation
  let headroomScore = 45;
  if (memPct !== null) {
    if (memPct <= 20) headroomScore = 100;
    else if (memPct <= 40) headroomScore = lerp(memPct, 20, 40, 100, 75);
    else if (memPct <= 60) headroomScore = lerp(memPct, 40, 60, 75, 45);
    else if (memPct <= 80) headroomScore = lerp(memPct, 60, 80, 45, 20);
    else headroomScore = lerp(Math.min(memPct, 100), 80, 100, 20, 0);
  }

  // Quality bonus
  const qualityBonus = Math.min(12, Math.log2(paramsBillions + 1) * 2);

  const fitMultiplier = status === "can-run-slow" ? 0.60 : status === "tight" ? 0.75 : 1;

  return Math.round(((speedScore * 0.55 + headroomScore * 0.35 + qualityBonus) * fitMultiplier));
}

export function scoreToGrade(score: number, status: ModelStatus): Grade {
  if (status === "cannot-run") return "F";
  if (status === "unknown") return "?";
  if (status === "can-run-slow") {
    if (score >= 40) return "C";
    return "D";
  }
  if (score >= 85) return "S";
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

export interface ModelEvaluation {
  status: ModelStatus;
  toksPerSec: number | null;
  memPct: number | null;
  score: number;
  grade: Grade;
}

export function evaluateModelComplete(vramGB: number, hw: HardwareInfo, paramsBillions: number): ModelEvaluation {
  const status = evaluateModel(vramGB, hw);
  const toksPerSec = estimateTokensPerSecond(vramGB, hw);
  const memPct = memoryPercentage(vramGB, hw);
  const score = computeScore(status, toksPerSec, paramsBillions, memPct);
  const grade = scoreToGrade(score, status);
  return { status, toksPerSec, memPct, score, grade };
}

export function getDisplayName(hw: HardwareInfo): string {
  if (hw.deviceName) return hw.deviceName;
  if (hw.gpuRenderer) return cleanGPUName(hw.gpuRenderer);
  return "Unknown";
}

export const GRADES: Record<Grade, GradeInfo> = {
  "S": { letter: "S", label: "Runs great",  color: "#22c55e" },
  "A": { letter: "A", label: "Runs well",   color: "#4ade80" },
  "B": { letter: "B", label: "Decent",      color: "#a3e635" },
  "C": { letter: "C", label: "Tight fit",   color: "#f59e0b" },
  "D": { letter: "D", label: "Barely runs", color: "#f97316" },
  "F": { letter: "F", label: "Too heavy",   color: "#ef4444" },
  "?": { letter: "?", label: "Unknown",     color: "#56565f" },
};

// ── Hardware Overrides (localStorage) ──────────────────────

const HW_OVERRIDE_KEY = "canirun-hw-overrides";

export interface HardwareOverrides {
  device?: string;
  ramGB?: number;
  systemRAM?: number;
  memoryBandwidth?: number;
  gpuCores?: number;
  isAppleSilicon?: boolean;
  isMobile?: boolean;
  estimatedVRAM?: number | null;
}

export function getHardwareOverrides(): HardwareOverrides {
  try {
    const raw = localStorage.getItem(HW_OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveHardwareOverrides(overrides: HardwareOverrides): void {
  try {
    const clean: HardwareOverrides = {};
    if (overrides.device !== undefined) clean.device = overrides.device;
    if (overrides.ramGB !== undefined) clean.ramGB = overrides.ramGB;
    if (overrides.systemRAM !== undefined) clean.systemRAM = overrides.systemRAM;
    if (overrides.memoryBandwidth !== undefined) clean.memoryBandwidth = overrides.memoryBandwidth;
    if (overrides.gpuCores !== undefined) clean.gpuCores = overrides.gpuCores;
    if (overrides.isAppleSilicon !== undefined) clean.isAppleSilicon = overrides.isAppleSilicon;
    if (overrides.isMobile !== undefined) clean.isMobile = overrides.isMobile;
    if (overrides.estimatedVRAM !== undefined) clean.estimatedVRAM = overrides.estimatedVRAM;
    if (Object.keys(clean).length === 0) {
      localStorage.removeItem(HW_OVERRIDE_KEY);
    } else {
      localStorage.setItem(HW_OVERRIDE_KEY, JSON.stringify(clean));
    }
  } catch {}
}

export function applyOverrides(hw: HardwareInfo, overrides?: HardwareOverrides): HardwareInfo {
  const o = overrides ?? getHardwareOverrides();
  if (Object.keys(o).length === 0) return hw;
  const result = { ...hw };
  if (o.isAppleSilicon !== undefined) result.isAppleSilicon = o.isAppleSilicon;
  if (o.isMobile !== undefined) result.isMobile = o.isMobile;
  if (o.estimatedVRAM !== undefined) result.estimatedVRAM = o.estimatedVRAM;
  if (o.ramGB !== undefined) {
    result.ramGB = o.ramGB;
    result.totalUsableRAM = o.ramGB;
  }
  if (o.systemRAM !== undefined) result.systemRAM = o.systemRAM;
  if (o.memoryBandwidth !== undefined) result.memoryBandwidth = o.memoryBandwidth;
  if (o.gpuCores !== undefined) result.gpuCores = o.gpuCores;
  return result;
}

export function getDeviceOverrides(deviceKey: string): HardwareOverrides | null {
  if (deviceKey.startsWith("apple:")) {
    const chip = deviceKey.slice(6);
    const data = APPLE_DB[chip];
    if (!data) return null;
    return {
      device: deviceKey,
      ramGB: data.ram,
      memoryBandwidth: data.bw,
      gpuCores: data.gpuCores,
      isAppleSilicon: true,
      isMobile: false,
      estimatedVRAM: null,
    };
  }
  if (deviceKey.startsWith("gpu:")) {
    const name = deviceKey.slice(4);
    const data = GPU_DB[name];
    if (!data) return null;
    return {
      device: deviceKey,
      ramGB: data.vram,
      memoryBandwidth: data.bw,
      gpuCores: data.cores,
      isAppleSilicon: false,
      isMobile: false,
      estimatedVRAM: data.vram,
      systemRAM: 16,
    };
  }
  if (deviceKey.startsWith("mobile:")) {
    const name = deviceKey.slice(7);
    const data = MOBILE_GPU_DB[name];
    if (!data) return null;
    return {
      device: deviceKey,
      ramGB: data.ram,
      memoryBandwidth: data.bw,
      isAppleSilicon: false,
      isMobile: true,
    };
  }
  if (deviceKey.startsWith("sbc:")) {
    const name = deviceKey.slice(4);
    const data = SBC_DB[name];
    if (!data) return null;
    return {
      device: deviceKey,
      ramGB: data.ram,
      memoryBandwidth: data.bw,
      isAppleSilicon: false,
      isMobile: false,
      estimatedVRAM: null,
    };
  }
  return null;
}

export const RAM_OPTIONS = [2, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128, 192, 256, 384, 512];
export const SYSTEM_RAM_OPTIONS = [4, 8, 16, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
export const BW_OPTIONS = [50, 68, 100, 120, 150, 153, 200, 224, 256, 273, 288, 300, 307, 346, 360, 408, 432, 448, 504, 546, 614, 672, 768, 819, 960, 1008, 1024, 1792, 2039, 3350, 4000];
export function buildSelectOptions(presets: number[], detected: number | null): number[] {
  const set = new Set(presets);
  if (detected !== null && detected > 0) set.add(detected);
  return Array.from(set).sort((a, b) => a - b);
}

// ── GPU Categories (for device selector UI) ───────────────

export function getGPUCategory(name: string): string {
  // Pro/workstation cards must be checked BEFORE consumer series (e.g. "RTX 5000 Ada" vs "RTX 5090")
  if (name.includes("Ada") || name.startsWith("RTX PRO") || name.startsWith("RTX 6000") || name.startsWith("RTX 4500") || name.startsWith("RTX A") || name.startsWith("Quadro") || name.startsWith("NVIDIA T") || /^T\d{3,4}$/.test(name)) return "NVIDIA Pro";
  if (/^(A100|H100|GH200|DGX Spark|L40S|L4|T4|Tesla P40)$/.test(name)) return "NVIDIA Datacenter";
  if (name.startsWith("RTX 50")) return "NVIDIA RTX 50";
  if (name.startsWith("RTX 40")) return "NVIDIA RTX 40";
  if (name.startsWith("RTX 30")) return "NVIDIA RTX 30";
  if (name.startsWith("RTX 20")) return "NVIDIA RTX 20";
  if (name.startsWith("GTX 16")) return "NVIDIA GTX 16";
  if (name.startsWith("GTX 10")) return "NVIDIA GTX 10";
  if (name.startsWith("GTX 9")) return "NVIDIA GTX 9";
  if (name.startsWith("RX 9")) return "AMD RX 9000";
  if (name.startsWith("RX 7")) return "AMD RX 7000";
  if (name.startsWith("RX 6")) return "AMD RX 6000";
  if (name.startsWith("RX 5")) return "AMD RX 5000";
  if (name === "Radeon VII") return "AMD Older";
  if (name.startsWith("Radeon") || name.startsWith("Ryzen") || /^Vega \d$/.test(name)) return "AMD Integrated";
  if (name.startsWith("RX") || name.startsWith("Vega")) return "AMD Older";
  if (name.startsWith("Arc")) return "Intel Arc";
  if (name.startsWith("Iris") || name.startsWith("UHD")) return "Intel Integrated";
  return "Other";
}

export const DEVICE_CATEGORY_ORDER = [
  "Apple Silicon", "NVIDIA RTX 50", "NVIDIA RTX 40", "NVIDIA RTX 30", "NVIDIA RTX 20",
  "NVIDIA GTX 16", "NVIDIA GTX 10", "NVIDIA GTX 9", "NVIDIA Pro", "NVIDIA Datacenter",
  "AMD RX 9000", "AMD RX 7000", "AMD RX 6000", "AMD RX 5000", "AMD Older", "AMD Integrated",
  "Intel Arc", "Intel Integrated", "Mobile", "SBC / Embedded",
];
