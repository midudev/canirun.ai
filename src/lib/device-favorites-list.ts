import {
  DEVICE_FAVORITES_EVENT,
  clearDeviceFavorites,
  readDeviceFavorites,
  toggleDeviceFavorite,
} from "@/lib/device-favorites"

interface Options {
  /** Container the device cards live in; also where star clicks are delegated. */
  root: HTMLElement
  /** The page's own device cards, in document order. */
  cards: HTMLElement[]
  /** The page's search predicate, reused so clones filter identically. */
  matches: (card: HTMLElement, query: string) => boolean
  /** Called after the favorite list changes, so the page can re-run its filter. */
  onChange: () => void
}

export interface DeviceFavoritesList {
  /** Applies the page's current search query to the favorite clones. */
  applyQuery: (query: string) => void
}

/**
 * Drives the favorites shelf rendered by `DeviceFavorites.astro`: clones the
 * favorited cards to the top of the page and keeps every star button in sync.
 * Returns null when the shelf markup is absent.
 */
export function initDeviceFavoritesList(options: Options): DeviceFavoritesList | null {
  const { root, cards, matches, onChange } = options

  const section = document.getElementById("favorites-section")
  const list = document.getElementById("favorites-list")
  const count = document.getElementById("favorites-count")
  const empty = document.getElementById("favorites-empty")
  const clear = document.getElementById("favorites-clear")
  if (!section || !list || !count || !empty || !clear) return null

  let favorites = readDeviceFavorites()

  function syncButtons() {
    const active = new Set(favorites)
    for (const button of root.querySelectorAll<HTMLElement>(".device-favorite")) {
      const key = button.closest<HTMLElement>(".device-card")?.dataset.key
      if (!key) continue
      const isFavorite = active.has(key)
      const name = button.dataset.label ?? "this device"
      button.setAttribute("aria-pressed", String(isFavorite))
      button.setAttribute(
        "aria-label",
        isFavorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`,
      )
    }
  }

  function render() {
    list!.replaceChildren()
    let rendered = 0
    for (const key of favorites) {
      const source = cards.find((card) => card.dataset.key === key)
      if (!source) continue
      const clone = source.cloneNode(true) as HTMLElement
      clone.hidden = false
      list!.append(clone)
      rendered += 1
    }
    count!.textContent = `(${rendered})`
    section!.hidden = rendered === 0
    syncButtons()
  }

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(".device-favorite")
    if (!button) return
    event.preventDefault()
    const key = button.closest<HTMLElement>(".device-card")?.dataset.key
    if (!key) return
    favorites = toggleDeviceFavorite(key)
    render()
    onChange()
  })

  clear.addEventListener("click", () => {
    clearDeviceFavorites()
    favorites = []
    render()
    onChange()
  })

  // A hardware picker elsewhere on the page can change the same list.
  window.addEventListener(DEVICE_FAVORITES_EVENT, (event) => {
    const next = (event as CustomEvent<string[]>).detail
    if (!Array.isArray(next) || next.join(" ") === favorites.join(" ")) return
    favorites = next
    render()
    onChange()
  })

  render()

  return {
    applyQuery(query: string) {
      let visible = 0
      for (const clone of list!.querySelectorAll<HTMLElement>(".device-card")) {
        const match = matches(clone, query)
        clone.hidden = !match
        if (match) visible += 1
      }
      empty!.classList.toggle("hidden", visible > 0 || favorites.length === 0)
    },
  }
}
