import {
  DEVICE_FAVORITES_EVENT,
  readDeviceFavorites,
  toggleDeviceFavorite,
} from "@/lib/device-favorites"

const STAR_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'

interface Entry {
  value: string
  label: string
  group: string
}

/** `auto` / `custom` live outside an optgroup and are not real devices, so they cannot be favorited. */
function readEntries(select: HTMLSelectElement): Entry[] {
  return [...select.options].map((option) => ({
    value: option.value,
    label: (option.textContent ?? option.value).trim(),
    group:
      option.parentElement instanceof HTMLOptGroupElement
        ? option.parentElement.label
        : "",
  }))
}

/**
 * Replaces a native device `<select>` with a searchable popover that supports favorites.
 * The `<select>` stays in the DOM as the source of truth and still emits `change`,
 * so every existing listener keeps working untouched.
 */
export function enhanceDeviceSelect(select: HTMLSelectElement): void {
  if (select.dataset.devicePicker === "ready") {
    select.dispatchEvent(new CustomEvent("device-picker:refresh"))
    return
  }
  select.dataset.devicePicker = "ready"

  const wrapper = document.createElement("span")
  wrapper.className = "device-picker"

  const trigger = document.createElement("button")
  trigger.type = "button"
  trigger.className = "device-picker-trigger"
  trigger.setAttribute("aria-haspopup", "true")
  trigger.setAttribute("aria-expanded", "false")

  const panel = document.createElement("div")
  panel.className = "device-picker-panel"
  panel.hidden = true

  const search = document.createElement("input")
  search.type = "search"
  search.className = "device-picker-search"
  search.placeholder = "Search devices…"
  search.autocomplete = "off"
  search.spellcheck = false
  search.setAttribute("aria-label", "Search devices")

  const list = document.createElement("ul")
  list.className = "device-picker-list"

  const empty = document.createElement("p")
  empty.className = "device-picker-empty"
  empty.textContent = "No devices match that search."
  empty.hidden = true

  panel.append(search, list, empty)

  select.parentElement?.insertBefore(wrapper, select)
  wrapper.append(trigger, panel, select)
  select.classList.add("device-picker-native")
  select.tabIndex = -1
  select.setAttribute("aria-hidden", "true")

  function syncTrigger() {
    const selected = select.options[select.selectedIndex]
    trigger.textContent = (selected?.textContent ?? "—").trim()
    trigger.disabled = select.disabled
  }

  function renderList() {
    const query = search.value.trim().toLowerCase()
    const favorites = readDeviceFavorites()
    const favoriteSet = new Set(favorites)
    const entries = readEntries(select)
    const matching = entries.filter(
      (entry) =>
        !query ||
        entry.label.toLowerCase().includes(query) ||
        entry.group.toLowerCase().includes(query),
    )

    list.replaceChildren()

    const favoriteEntries = favorites
      .map((key) => matching.find((entry) => entry.value === key))
      .filter((entry): entry is Entry => entry !== undefined)

    if (favoriteEntries.length > 0) {
      list.append(buildGroup("Favorites", favoriteEntries, favoriteSet))
    }

    const seen = new Set<string>()
    for (const entry of matching) {
      if (seen.has(entry.group)) continue
      seen.add(entry.group)
      const items = matching.filter((item) => item.group === entry.group)
      list.append(buildGroup(entry.group, items, favoriteSet))
    }

    empty.hidden = matching.length > 0
  }

  function buildGroup(
    label: string,
    entries: Entry[],
    favoriteSet: Set<string>,
  ): DocumentFragment {
    const fragment = document.createDocumentFragment()

    if (label) {
      const heading = document.createElement("li")
      heading.className = "device-picker-group"
      heading.textContent = label
      fragment.append(heading)
    }

    for (const entry of entries) {
      const item = document.createElement("li")
      item.className = "device-picker-option"

      const choose = document.createElement("button")
      choose.type = "button"
      choose.className = "device-picker-choose"
      choose.textContent = entry.label
      choose.dataset.value = entry.value
      if (entry.value === select.value) choose.setAttribute("aria-current", "true")
      item.append(choose)

      // Only real devices (those inside an optgroup) can be favorited.
      if (entry.group) {
        const star = document.createElement("button")
        star.type = "button"
        star.className = "device-picker-favorite"
        star.dataset.value = entry.value
        const isFavorite = favoriteSet.has(entry.value)
        star.setAttribute("aria-pressed", String(isFavorite))
        star.setAttribute(
          "aria-label",
          isFavorite
            ? `Remove ${entry.label} from favorites`
            : `Add ${entry.label} to favorites`,
        )
        star.innerHTML = STAR_SVG
        item.append(star)
      }

      fragment.append(item)
    }

    return fragment
  }

  function open() {
    if (select.disabled) return
    panel.hidden = false
    trigger.setAttribute("aria-expanded", "true")
    search.value = ""
    renderList()
    // Anchor to the right edge when a left-anchored panel would leave the viewport.
    panel.classList.remove("device-picker-panel--end")
    const left = wrapper.getBoundingClientRect().left
    if (left + panel.offsetWidth > document.documentElement.clientWidth - 8) {
      panel.classList.add("device-picker-panel--end")
    }
    search.focus()
    list.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "center" })
  }

  function close(restoreFocus = false) {
    if (panel.hidden) return
    panel.hidden = true
    trigger.setAttribute("aria-expanded", "false")
    if (restoreFocus) trigger.focus()
  }

  function choose(value: string) {
    select.value = value
    syncTrigger()
    close(true)
    select.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function moveFocus(delta: number) {
    const options = [...list.querySelectorAll<HTMLButtonElement>(".device-picker-choose")]
    if (options.length === 0) return
    const index = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = index === -1 ? (delta > 0 ? 0 : options.length - 1) : index + delta
    options[Math.max(0, Math.min(options.length - 1, next))]?.focus()
  }

  trigger.addEventListener("click", () => {
    if (panel.hidden) open()
    else close(true)
  })

  search.addEventListener("input", renderList)

  panel.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null
    const star = target?.closest<HTMLElement>(".device-picker-favorite")
    if (star?.dataset.value) {
      toggleDeviceFavorite(star.dataset.value)
      return
    }
    const option = target?.closest<HTMLElement>(".device-picker-choose")
    if (option?.dataset.value) choose(option.dataset.value)
  })

  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      close(true)
      return
    }
    if (panel.hidden) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      moveFocus(1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      moveFocus(-1)
    }
  })

  wrapper.addEventListener("focusout", () => {
    // Let focus settle before deciding whether it left the picker entirely.
    requestAnimationFrame(() => {
      if (!wrapper.contains(document.activeElement)) close()
    })
  })

  // Sidebars re-render by replacing their markup, so these page-level listeners
  // detach themselves once their wrapper is gone.
  const onPointerDown = (event: PointerEvent) => {
    if (!wrapper.isConnected) {
      document.removeEventListener("pointerdown", onPointerDown)
      return
    }
    if (!wrapper.contains(event.target as Node)) close()
  }
  document.addEventListener("pointerdown", onPointerDown)

  const onFavoritesChange = () => {
    if (!wrapper.isConnected) {
      window.removeEventListener(DEVICE_FAVORITES_EVENT, onFavoritesChange)
      return
    }
    if (!panel.hidden) renderList()
  }
  window.addEventListener(DEVICE_FAVORITES_EVENT, onFavoritesChange)

  select.addEventListener("device-picker:refresh", () => {
    syncTrigger()
    if (!panel.hidden) renderList()
  })
  select.addEventListener("change", syncTrigger)

  syncTrigger()
}
