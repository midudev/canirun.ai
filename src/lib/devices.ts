import {
  APPLE_DB,
  DEVICE_CATEGORY_ORDER,
  GPU_DB,
  MOBILE_GPU_DB,
  SBC_DB,
  getGPUCategory,
} from "@/lib/hardware"
import { getAllDeviceSlugs, type DeviceSlugEntry } from "@/lib/device-slugs"

export type DeviceVendor =
  | "apple"
  | "nvidia"
  | "amd"
  | "intel"
  | "qualcomm"
  | "arm"
  | "samsung"
  | "google"
  | "raspberry"

export interface DeviceListing extends DeviceSlugEntry {
  category: string
  vendor: DeviceVendor
  memoryGB: number | null
  memoryKind: "vram" | "unified" | "ram"
  bandwidth: number
}

export interface DeviceCategoryGroup {
  category: string
  id: string
  devices: DeviceListing[]
}

export interface DeviceFamily {
  id: string
  name: string
  description: string
  vendors: DeviceVendor[]
  categories: DeviceCategoryGroup[]
  count: number
}

const FAMILIES: {
  id: string
  name: string
  description: string
  vendors: DeviceVendor[]
  categories: string[]
}[] = [
  {
    id: "apple-silicon",
    name: "Apple Silicon",
    description: "M-series Macs with unified memory.",
    vendors: ["apple"],
    categories: ["Apple Silicon"],
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    description: "GeForce, RTX Pro and datacenter GPUs.",
    vendors: ["nvidia"],
    categories: [
      "NVIDIA RTX 50",
      "NVIDIA RTX 40",
      "NVIDIA RTX 30",
      "NVIDIA RTX 20",
      "NVIDIA GTX 16",
      "NVIDIA GTX 10",
      "NVIDIA GTX 9",
      "NVIDIA Pro",
      "NVIDIA Datacenter",
    ],
  },
  {
    id: "amd",
    name: "AMD",
    description: "Radeon discrete GPUs and integrated graphics.",
    vendors: ["amd"],
    categories: [
      "AMD RX 9000",
      "AMD RX 7000",
      "AMD RX 6000",
      "AMD RX 5000",
      "AMD Older",
      "AMD Integrated",
    ],
  },
  {
    id: "intel",
    name: "Intel",
    description: "Arc discrete GPUs and integrated graphics.",
    vendors: ["intel"],
    categories: ["Intel Arc", "Intel Integrated"],
  },
  {
    id: "mobile",
    name: "Mobile",
    description: "Phone and tablet GPUs for on-device models.",
    vendors: ["qualcomm", "arm", "samsung", "google"],
    categories: ["Mobile"],
  },
  {
    id: "sbc",
    name: "SBC / Embedded",
    description: "Single-board computers such as Raspberry Pi.",
    vendors: ["raspberry"],
    categories: ["SBC / Embedded"],
  },
]

export function categoryToId(category: string): string {
  return category
    .toLowerCase()
    .replace(/[/]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function formatMemory(device: DeviceListing): string | null {
  if (device.memoryGB == null) return null
  if (device.memoryKind === "vram") return `${device.memoryGB} GB VRAM`
  if (device.memoryKind === "unified") return `${device.memoryGB} GB unified`
  return `${device.memoryGB} GB RAM`
}

export function getDeviceListings(): DeviceListing[] {
  return getAllDeviceSlugs().map((entry) => toListing(entry))
}

export function getDeviceListing(key: string): DeviceListing | undefined {
  return getDeviceListings().find((device) => device.key === key)
}

export function getDeviceFamilies(devices = getDeviceListings()): DeviceFamily[] {
  const byCategory = new Map<string, DeviceListing[]>()
  for (const category of DEVICE_CATEGORY_ORDER) {
    byCategory.set(category, [])
  }
  for (const device of devices) {
    const list = byCategory.get(device.category) ?? []
    list.push(device)
    byCategory.set(device.category, list)
  }

  const known = new Set(FAMILIES.flatMap((family) => family.categories))
  const families = FAMILIES.map((family) => {
    const categories = family.categories
      .map((category) => ({
        category,
        id: categoryToId(category),
        devices: byCategory.get(category) ?? [],
      }))
      .filter((group) => group.devices.length > 0)

    return {
      id: family.id,
      name: family.name,
      description: family.description,
      vendors: family.vendors,
      categories,
      count: categories.reduce((sum, group) => sum + group.devices.length, 0),
    }
  }).filter((family) => family.count > 0)

  const leftover = [...byCategory.entries()]
    .filter(([category, list]) => list.length > 0 && !known.has(category))
    .map(([category, list]) => ({
      category,
      id: categoryToId(category),
      devices: list,
    }))

  if (leftover.length > 0) {
    families.push({
      id: "other",
      name: "Other",
      description: "Additional devices that do not fit a vendor series.",
      vendors: [],
      categories: leftover,
      count: leftover.reduce((sum, group) => sum + group.devices.length, 0),
    })
  }

  return families
}

function vendorForGpu(category: string): DeviceVendor {
  if (category.startsWith("AMD")) return "amd"
  if (category.startsWith("Intel")) return "intel"
  return "nvidia"
}

function vendorForMobile(name: string): DeviceVendor {
  if (name.startsWith("Adreno")) return "qualcomm"
  if (name.startsWith("Xclipse")) return "samsung"
  if (name.startsWith("Tensor")) return "google"
  return "arm"
}

function toListing(entry: DeviceSlugEntry): DeviceListing {
  if (entry.key.startsWith("apple:")) {
    const data = APPLE_DB[entry.key.slice(6)]
    return {
      ...entry,
      category: "Apple Silicon",
      vendor: "apple",
      memoryGB: data?.ram ?? null,
      memoryKind: "unified",
      bandwidth: data?.bw ?? 0,
    }
  }

  if (entry.key.startsWith("gpu:")) {
    const name = entry.key.slice(4)
    const data = GPU_DB[name]
    const category = getGPUCategory(name)
    return {
      ...entry,
      category,
      vendor: vendorForGpu(category),
      memoryGB: data?.vram ?? null,
      memoryKind: "vram",
      bandwidth: data?.bw ?? 0,
    }
  }

  if (entry.key.startsWith("mobile:")) {
    const data = MOBILE_GPU_DB[entry.key.slice(7)]
    return {
      ...entry,
      category: "Mobile",
      vendor: vendorForMobile(entry.name),
      memoryGB: data?.ram ?? null,
      memoryKind: "ram",
      bandwidth: data?.bw ?? 0,
    }
  }

  const data = SBC_DB[entry.key.slice(4)]
  return {
    ...entry,
    category: "SBC / Embedded",
    vendor: "raspberry",
    memoryGB: data?.ram ?? null,
    memoryKind: "ram",
    bandwidth: data?.bw ?? 0,
  }
}
