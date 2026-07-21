/**
 * map.js — a Snapp-style "tap or drag the pin to set delivery location" map,
 * built on Leaflet + OpenStreetMap tiles (no API key required).
 *
 * On every pin placement/move it reverse-geocodes the point (OpenStreetMap
 * Nominatim, accept-language=fa) into a human-readable Persian address and
 * shows it in the confirmation panel docked to the bottom of the map, so the
 * customer can read and confirm the exact address before placing the order —
 * the same pattern Snapp's delivery-location picker uses.
 */
(function () {
  const DEFAULT_CENTER = [35.7219, 51.3347]; // Tehran, Valiasr Sq. as a sensible default
  // Iran's rough bounding box — used to keep the map (panning/zoom) and both
  // the search and reverse-geocode results confined to Iran only, since
  // deliveries are only made within the country.
  const IRAN_BOUNDS = L.latLngBounds([24.5, 44.0], [39.9, 63.5]);
  const IRAN_VIEWBOX = "44.0,39.9,63.5,24.5"; // left,top,right,bottom for Nominatim
  let map, marker;
  let currentLocation = null; // { lat, lng, address }
  let geocodeRequestId = 0;

  function els() {
    return {
      panel: document.getElementById("address-confirm-panel"),
      text: document.getElementById("address-confirm-text"),
      status: document.getElementById("address-confirm-status"),
      searchInput: document.getElementById("map-search-input"),
      searchButton: document.getElementById("map-search-button"),
      searchResults: document.getElementById("map-search-results"),
    };
  }

  function setPanelState(state, text) {
    // state: "loading" | "ready" | "error"
    const { panel, text: textEl, status } = els();
    if (!panel || !textEl) return;
    panel.classList.remove("hidden");
    const t = window.KhorshidI18n ? window.KhorshidI18n.t : (k) => k;

    if (state === "loading") {
      textEl.textContent = t("cart_page.address_loading") || "در حال یافتن نشانی…";
      if (status) status.textContent = "⏳";
    } else if (state === "ready") {
      textEl.textContent = text;
      if (status) status.textContent = "✅";
    } else if (state === "error") {
      textEl.textContent = t("cart_page.address_unavailable") || "نشانی یافت نشد؛ مختصات ثبت شد.";
      if (status) status.textContent = "⚠️";
    }
  }

  async function reverseGeocode(lat, lng) {
    const requestId = ++geocodeRequestId;
    setPanelState("loading");
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=fa&zoom=18&countrycodes=ir`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await res.json();
      // a newer pin may have been dropped while this request was in flight
      if (requestId !== geocodeRequestId) return;

      const address = (data && data.display_name) || null;
      if (address) {
        currentLocation = { lat, lng, address };
        setPanelState("ready", address);
      } else {
        currentLocation = { lat, lng, address: null };
        setPanelState("error");
      }
    } catch (e) {
      if (requestId !== geocodeRequestId) return;
      currentLocation = { lat, lng, address: null };
      setPanelState("error");
    }
  }

  function placeMarker(lat, lng) {
    if (!IRAN_BOUNDS.contains([lat, lng])) return; // deliveries are only made within Iran
    if (!marker) {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        reverseGeocode(pos.lat, pos.lng);
      });
    } else {
      marker.setLatLng([lat, lng]);
    }
    reverseGeocode(lat, lng);
  }

  // --------------------------------------------------------------------- //
  // location search — lets the customer type their city/neighborhood
  // instead of hunting for it on the map (forward geocoding via the same
  // Nominatim service used for the reverse lookup above)
  // --------------------------------------------------------------------- //
  let searchRequestId = 0;
  let searchDebounce = null;

  function hideSearchResults() {
    const { searchResults } = els();
    if (!searchResults) return;
    searchResults.classList.add("hidden");
    searchResults.innerHTML = "";
  }

  function renderSearchResults(results) {
    const { searchResults } = els();
    if (!searchResults) return;
    const t = window.KhorshidI18n ? window.KhorshidI18n.t : (k) => k;
    const isDark = document.documentElement.classList.contains("dark");
    const textColor = isDark ? "#E4EEF8" : "#0F2A4A"; // khorshid-100 / khorshid-900
    const mutedColor = isDark ? "#8FBBDE" : "#3E7CB8"; // khorshid-300 / khorshid-500

    if (!results.length) {
      searchResults.innerHTML = `<li class="px-3.5 py-2.5" style="color:${mutedColor}">${
        t("cart_page.map_search_no_results") || "No results found."
      }</li>`;
      searchResults.classList.remove("hidden");
      return;
    }

    searchResults.innerHTML = results
      .map(
        (r, idx) =>
          `<li data-result-idx="${idx}" class="cursor-pointer truncate border-b border-khorshid-100 px-3.5 py-2.5 last:border-0 hover:bg-khorshid-100 dark:border-white/5 dark:hover:bg-white/5" style="color:${textColor}">${r.display_name}</li>`
      )
      .join("");
    searchResults.classList.remove("hidden");

    searchResults.querySelectorAll("[data-result-idx]").forEach((li) => {
      li.addEventListener("click", () => {
        const r = results[Number(li.getAttribute("data-result-idx"))];
        if (!r) return;
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        map.setView([lat, lng], 16);
        placeMarker(lat, lng);
        hideSearchResults();
        const { searchInput } = els();
        if (searchInput) searchInput.value = r.display_name;
      });
    });
  }

  async function searchLocation(query) {
    const requestId = ++searchRequestId;
    if (!query || !query.trim()) {
      hideSearchResults();
      return;
    }
    try {
      const lang = window.KhorshidI18n ? window.KhorshidI18n.currentLang() : "fa";
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        query
      )}&accept-language=${lang}&limit=6&countrycodes=ir&viewbox=${IRAN_VIEWBOX}&bounded=1`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (requestId !== searchRequestId) return; // a newer search superseded this one
      renderSearchResults(Array.isArray(data) ? data : []);
    } catch (e) {
      if (requestId !== searchRequestId) return;
      const { searchResults } = els();
      const t = window.KhorshidI18n ? window.KhorshidI18n.t : (k) => k;
      if (searchResults) {
        const isDark = document.documentElement.classList.contains("dark");
        searchResults.innerHTML = `<li class="px-3.5 py-2.5" style="color:${isDark ? "#fb7185" : "#e11d48"}">${
          t("cart_page.map_search_error") || "Search failed; please try again."
        }</li>`;
        searchResults.classList.remove("hidden");
      }
    }
  }

  function initSearch() {
    const { searchInput, searchButton, searchResults } = els();
    if (!searchInput) return;

    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      const query = searchInput.value;
      searchDebounce = setTimeout(() => searchLocation(query), 400);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(searchDebounce);
        searchLocation(searchInput.value);
      } else if (e.key === "Escape") {
        hideSearchResults();
      }
    });
    if (searchButton) {
      searchButton.addEventListener("click", () => {
        clearTimeout(searchDebounce);
        searchLocation(searchInput.value);
      });
    }
    document.addEventListener("click", (e) => {
      if (searchResults && !searchResults.contains(e.target) && e.target !== searchInput) {
        hideSearchResults();
      }
    });
  }

  function initMap() {
    const el = document.getElementById("delivery-map");
    if (!el || typeof L === "undefined") return;

    map = L.map(el, {
      zoomControl: true,
      minZoom: 5,
      maxBounds: IRAN_BOUNDS.pad(0.15), // small pad so the border area is still reachable
      maxBoundsViscosity: 1.0, // fully resist dragging past the bounds
    }).setView(DEFAULT_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e) => placeMarker(e.latlng.lat, e.latlng.lng));

    initSearch();

    // try to center on the user's real location, but never block the UI on it
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const here = [pos.coords.latitude, pos.coords.longitude];
          if (IRAN_BOUNDS.contains(here)) map.setView(here, 15);
        },
        () => {},
        { timeout: 3000 }
      );
    }

    window.KhorshidMap = {
      // Returns { lat, lng, address } for the confirmed pin, or null if the
      // customer hasn't placed one yet.
      getLocation: () => currentLocation,
      // Places (or moves) the pin programmatically, e.g. to prefill a
      // previously-saved address, and re-centers the map on it.
      setLocation: (lat, lng) => {
        if (!map || typeof lat !== "number" || typeof lng !== "number") return;
        map.setView([lat, lng], 15);
        placeMarker(lat, lng);
      },
    };
  }

  document.addEventListener("DOMContentLoaded", initMap);
})();
