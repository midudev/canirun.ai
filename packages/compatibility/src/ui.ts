import {
  GPU_DB,
  APPLE_DB,
  MOBILE_GPU_DB,
  SBC_DB,
  getGPUCategory,
  DEVICE_CATEGORY_ORDER,
  buildSelectOptions,
} from "./index.js";

// ── Chip Name Formatting ──────────────────────────────────

export function formatChipName(chip: string): string {
  return chip.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Select Width Measurement ──────────────────────────────

let _measureEl: HTMLSpanElement | null = null;

function getMeasureEl(): HTMLSpanElement {
  if (!_measureEl) {
    _measureEl = document.createElement("span");
    _measureEl.style.cssText = "visibility:hidden;position:absolute;white-space:nowrap;pointer-events:none";
  }
  if (!_measureEl.isConnected) document.body.appendChild(_measureEl);
  return _measureEl;
}

export function fitSelectWidth(select: HTMLSelectElement): void {
  const el = getMeasureEl();
  const text = select.options[select.selectedIndex]?.textContent ?? "";
  el.style.font = getComputedStyle(select).font;
  el.textContent = text;
  select.style.width = `${el.offsetWidth + 28}px`;
}

// ── Numeric Select Population ─────────────────────────────

export function populateSelect(
  select: HTMLSelectElement,
  presets: number[],
  detected: number | null,
  override: number | undefined,
  formatter: (v: number) => string,
): void {
  const options = buildSelectOptions(presets, detected);
  if (override !== undefined && override > 0 && !options.includes(override)) {
    options.push(override);
    options.sort((a, b) => a - b);
  }
  select.innerHTML = "";
  if (override === undefined && detected === null) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "—";
    placeholder.disabled = true;
    select.appendChild(placeholder);
  }
  for (const v of options) {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = formatter(v) + (v === detected ? " ✱" : "");
    select.appendChild(opt);
  }
  const custom = document.createElement("option");
  custom.value = CUSTOM_SELECT_VALUE;
  custom.textContent = "Custom…";
  select.appendChild(custom);
  select.value = String(override ?? detected ?? "");
  if (select.value !== CUSTOM_SELECT_VALUE) {
    select.dataset.prevValue = select.value;
  }
  fitSelectWidth(select);
}

export const CUSTOM_SELECT_VALUE = "__custom__";

export function setSelectEnabled(select: HTMLSelectElement, enabled: boolean): void {
  select.disabled = !enabled;
  select.classList.toggle("opacity-50", !enabled);
  select.classList.toggle("cursor-not-allowed", !enabled);
}

export function populateCountSelect(select: HTMLSelectElement, count: number): void {
  const values = [1, 2, 3, 4, 6, 8];
  const selected = values.includes(count) ? count : 1;
  select.innerHTML = "";
  for (const value of values) {
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = `×${value}`;
    select.appendChild(opt);
  }
  select.value = String(selected);
  fitSelectWidth(select);
}

export function openCustomNumberInput(
  select: HTMLSelectElement,
  options: {
    min: number;
    max: number;
    format: (value: number) => string;
    onCommit: (value: number) => void;
    onCancel: () => void;
  },
): void {
  const previous = select.dataset.prevValue ?? "";
  const input = document.createElement("input");
  input.type = "number";
  input.className = "hw-editable-input";
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = "1";
  input.inputMode = "numeric";
  input.setAttribute("aria-label", "Custom value");
  select.hidden = true;
  select.insertAdjacentElement("afterend", input);
  input.focus();

  let settled = false;
  const finish = (commit: boolean) => {
    if (settled) return;
    settled = true;
    const raw = Number(input.value);
    input.remove();
    select.hidden = false;
    const value = Math.round(raw);
    if (!commit || !Number.isFinite(raw) || value < options.min || value > options.max) {
      select.value = previous;
      options.onCancel();
      return;
    }
    const existing = Array.from(select.options).find((opt) => opt.value === String(value));
    if (!existing) {
      const opt = document.createElement("option");
      opt.value = String(value);
      opt.textContent = options.format(value);
      const customOpt = Array.from(select.options).find((opt) => opt.value === CUSTOM_SELECT_VALUE);
      select.insertBefore(opt, customOpt ?? null);
    }
    select.value = String(value);
    select.dataset.prevValue = String(value);
    options.onCommit(value);
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

// ── Device Options Grouping ───────────────────────────────

export interface DeviceOption {
  value: string;
  label: string;
}

export function buildGroupedDeviceOptions(): Record<string, DeviceOption[]> {
  const grouped: Record<string, DeviceOption[]> = {};

  for (const [chip, data] of Object.entries(APPLE_DB)) {
    const cat = "Apple Silicon";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ value: `apple:${chip}`, label: `${formatChipName(chip)} (${data.ram} GB)` });
  }

  for (const [name, data] of Object.entries(GPU_DB)) {
    const cat = getGPUCategory(name);
    if (!grouped[cat]) grouped[cat] = [];
    const memory = data.vram > 0 ? `${data.vram} GB` : "shared";
    grouped[cat].push({ value: `gpu:${name}`, label: `${name} (${memory})` });
  }

  for (const [name, data] of Object.entries(MOBILE_GPU_DB)) {
    const cat = "Mobile";
    if (!grouped[cat]) grouped[cat] = [];
    const label = data.ram ? `${name} (${data.ram} GB)` : name;
    grouped[cat].push({ value: `mobile:${name}`, label });
  }

  for (const [name, data] of Object.entries(SBC_DB)) {
    const cat = "SBC / Embedded";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ value: `sbc:${name}`, label: `${name} — ${data.ram} GB` });
  }

  return grouped;
}

export function appendDeviceOptgroups(
  select: HTMLSelectElement,
  storedDevice?: string,
): void {
  const grouped = buildGroupedDeviceOptions();
  for (const cat of DEVICE_CATEGORY_ORDER) {
    const items = grouped[cat];
    if (!items?.length) continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = cat;
    for (const item of items) {
      const opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.label;
      if (item.value === storedDevice) opt.selected = true;
      optgroup.appendChild(opt);
    }
    select.appendChild(optgroup);
  }
}
