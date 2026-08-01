import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const PUBLIC_STATE_RPC = "get_collectives_public_state";
const PUBLIC_COLLECTIVES_RPC = "get_public_collectives";
const CONTACT_FUNCTION_URL = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/contact-collective-hosts`;
const initialCenter = { lat: 39.7392, lng: -104.9903 };
const initialZoom = 9;
const CHILDCARE_OPTIONS = [
  "Childcare Available | Sitter Provided",
  "Children Welcome | No Sitter Provided",
  "Childcare Not Provided"
];

let map;
let markers = new Map();
let activeCard = null;
let selectedCollective = null;
let allCollectives = [];

function rpcUrl(name) {
  return `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/${name}`;
}

async function callRpc(name) {
  const response = await fetch(rpcUrl(name), {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });
  if (!response.ok) throw new Error(`${name} failed with status ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function fieldValue(value) {
  const text = String(value || "").trim();
  return text || "N/A";
}

function audienceLabel(value) {
  return value === "All" ? "Everyone Welcome" : fieldValue(value);
}

function childcareOption(collective) {
  const value = fieldValue(collective.childcare_option);
  if (CHILDCARE_OPTIONS.includes(value)) return value;
  if (collective.childcare_provided === true) return "Childcare Available | Sitter Provided";
  return "Childcare Not Provided";
}

function compactChildcareLabel(value) {
  if (value === "Childcare Available | Sitter Provided") return "Sitter Provided";
  if (value === "Children Welcome | No Sitter Provided") return "Children Welcome · No Sitter";
  return "Childcare Not Provided";
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function detail(label, value) {
  const paragraph = createElement("p", "collective-card-detail");
  const strong = createElement("strong", "", `${label}:`);
  paragraph.append(strong, document.createTextNode(` ${value}`));
  return paragraph;
}

function pairedDetails(firstLabel, firstValue, secondLabel, secondValue, secondTitle = "") {
  const paragraph = createElement("p", "collective-card-detail collective-card-detail-pair");
  const first = document.createElement("span");
  const firstStrong = createElement("strong", "", `${firstLabel}:`);
  first.append(firstStrong, document.createTextNode(` ${firstValue}`));

  const second = document.createElement("span");
  if (secondTitle) second.title = secondTitle;
  const secondStrong = createElement("strong", "", `${secondLabel}:`);
  second.append(secondStrong, document.createTextNode(` ${secondValue}`));

  paragraph.append(first, second);
  return paragraph;
}

function showOffseason() {
  document.getElementById("collectives-offseason").hidden = false;
  document.getElementById("collectives-experience").hidden = true;
}

function showExperience() {
  document.getElementById("collectives-offseason").hidden = true;
  document.getElementById("collectives-experience").hidden = false;
}

function isMobileCollectivesLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function refreshMapView() {
  if (!map) return;
  const center = selectedCollective
    ? { lat: selectedCollective.latitude, lng: selectedCollective.longitude }
    : initialCenter;

  requestAnimationFrame(() => {
    window.google?.maps?.event?.trigger(map, "resize");
    map.setCenter(center);
    if (selectedCollective) map.setZoom(14);
  });
}

function setMobileView(view) {
  const experience = document.getElementById("collectives-experience");
  if (!experience) return;
  experience.dataset.mobileView = view;

  document.querySelectorAll(".collectives-view-tab").forEach((tab) => {
    const isSelected = tab.dataset.view === view;
    tab.classList.toggle("is-active", isSelected);
    tab.setAttribute("aria-selected", String(isSelected));
  });

  if (view === "map") refreshMapView();
}

function setupMobileViewSwitch() {
  document.querySelectorAll(".collectives-view-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      setMobileView(tab.dataset.view || "list");
    });
  });
  setMobileView("list");
}

function filterValues() {
  return {
    audience: document.getElementById("collectives-audience-filter")?.value || "",
    childcare: document.getElementById("collectives-childcare-filter")?.value || ""
  };
}

function activeFilterCount(filters = filterValues()) {
  return Number(Boolean(filters.audience)) + Number(Boolean(filters.childcare));
}

function filteredCollectives(filters = filterValues()) {
  return allCollectives.filter((collective) => {
    const matchesAudience = !filters.audience || audienceLabel(collective.audience) === filters.audience;
    const matchesChildcare = !filters.childcare || childcareOption(collective) === filters.childcare;
    return matchesAudience && matchesChildcare;
  });
}

function updateFilterControls(filters = filterValues()) {
  const count = activeFilterCount(filters);
  const clearButton = document.getElementById("collectives-clear-filters");
  const toggleButton = document.getElementById("collectives-filter-toggle");
  if (clearButton) clearButton.disabled = count === 0;
  if (toggleButton) toggleButton.textContent = count > 0 ? `Filters (${count})` : "Filters";
}

function clearSelection() {
  if (activeCard) activeCard.classList.remove("is-selected");
  markers.forEach((marker) => marker.element?.classList.remove("is-active"));
  activeCard = null;
  selectedCollective = null;
}

function restoreSelection() {
  if (!selectedCollective) return;
  activeCard = document.querySelector(`[data-collective-id="${CSS.escape(selectedCollective.id)}"]`);
  if (activeCard) activeCard.classList.add("is-selected");
  markers.get(selectedCollective.id)?.element?.classList.add("is-active");
}

function fitMapToCollectives(collectives) {
  if (!map || !window.google?.maps) return;
  if (collectives.length === 0) {
    map.setCenter(initialCenter);
    map.setZoom(initialZoom);
    return;
  }
  if (collectives.length === 1) {
    map.setCenter({ lat: collectives[0].latitude, lng: collectives[0].longitude });
    map.setZoom(11);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  collectives.forEach((collective) => {
    bounds.extend({ lat: collective.latitude, lng: collective.longitude });
  });
  map.fitBounds(bounds, 56);
}

async function applyCollectiveFilters() {
  const filters = filterValues();
  const collectives = filteredCollectives(filters);
  const visibleIds = new Set(collectives.map((collective) => collective.id));
  if (selectedCollective && !visibleIds.has(selectedCollective.id)) clearSelection();

  updateFilterControls(filters);
  renderList(collectives, allCollectives.length);
  await renderMarkers(collectives);
  restoreSelection();
  fitMapToCollectives(collectives);
}

function setupCollectiveFilters() {
  const audienceFilter = document.getElementById("collectives-audience-filter");
  const childcareFilter = document.getElementById("collectives-childcare-filter");
  const clearButton = document.getElementById("collectives-clear-filters");
  const toggleButton = document.getElementById("collectives-filter-toggle");
  const panel = document.getElementById("collectives-filter-panel");

  [audienceFilter, childcareFilter].forEach((filter) => {
    filter?.addEventListener("change", () => {
      applyCollectiveFilters();
    });
  });

  clearButton?.addEventListener("click", () => {
    if (audienceFilter) audienceFilter.value = "";
    if (childcareFilter) childcareFilter.value = "";
    applyCollectiveFilters();
  });

  toggleButton?.addEventListener("click", () => {
    const isOpen = panel?.classList.toggle("is-open") || false;
    toggleButton.setAttribute("aria-expanded", String(isOpen));
  });

  updateFilterControls();
}

function selectCollective(collective, card) {
  if (activeCard) activeCard.classList.remove("is-selected");
  markers.forEach((marker) => marker.element?.classList.remove("is-active"));
  activeCard = card;
  selectedCollective = collective;
  if (activeCard) activeCard.classList.add("is-selected");

  const marker = markers.get(collective.id);
  if (marker) {
    map.setCenter({ lat: collective.latitude, lng: collective.longitude });
    map.setZoom(14);
    marker.element?.classList.add("is-active");
  }

  if (isMobileCollectivesLayout()) {
    setMobileView("map");
    document.getElementById("collectives-experience").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function openContactModal(collective) {
  const modal = document.getElementById("collective-contact-modal");
  const form = document.getElementById("collective-contact-form");
  document.getElementById("collective-contact-id").value = collective.id;
  document.getElementById("collective-contact-status").textContent = "";
  form.reset();
  modal.style.display = "block";
  document.getElementById("collective-contact-name").focus();
}

function renderList(collectives, totalCount = collectives.length) {
  const list = document.getElementById("collectives-list");
  const activeFilters = activeFilterCount();
  list.innerHTML = "";

  if (collectives.length === 0) {
    const emptyMessage = totalCount > 0 && activeFilters > 0
      ? "No Collectives match these filters."
      : "No active Collectives are currently listed.";
    list.append(
      createElement("p", "collectives-empty", emptyMessage),
      createElement("p", "collectives-empty-note", totalCount > 0 && activeFilters > 0
        ? "Try changing or clearing the filters."
        : "New host locations will appear here when available.")
    );
    return;
  }

  let currentCity = "";
  collectives.forEach((collective) => {
    const city = fieldValue(collective.city);
    if (city !== currentCity) {
      currentCity = city;
      list.append(createElement("h3", "collectives-city-heading", city));
    }

    const card = createElement("article", "collective-card");
    card.dataset.collectiveId = collective.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `View ${fieldValue(collective.primary_host_last_name)} Collective on map`);
    const fullChildcare = childcareOption(collective);
    card.append(
      createElement("h3", "", `${fieldValue(collective.primary_host_last_name)} Collective`),
      pairedDetails(
        "Audience",
        audienceLabel(collective.audience),
        "Childcare",
        compactChildcareLabel(fullChildcare),
        fullChildcare
      )
    );

    const actions = createElement("div", "collective-card-actions");
    const mapButton = createElement("button", "", "View on Map");
    mapButton.type = "button";
    const contactButton = createElement("button", "", "Contact Host");
    contactButton.type = "button";
    actions.append(mapButton, contactButton);
    card.append(actions);

    card.addEventListener("click", () => selectCollective(collective, card));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCollective(collective, card);
      }
    });
    mapButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectCollective(collective, card);
    });
    contactButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openContactModal(collective);
    });

    list.append(card);
  });
}

async function renderMarkers(collectives) {
  if (!map || !window.google?.maps) return;
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
  markers.forEach((marker) => {
    marker.map = null;
  });
  markers = new Map();

  collectives.forEach((collective) => {
    const marker = new AdvancedMarkerElement({
      map,
      position: { lat: collective.latitude, lng: collective.longitude },
      title: `${fieldValue(collective.primary_host_last_name)} Collective`
    });
    marker.addListener("click", () => {
      const card = document.querySelector(`[data-collective-id="${CSS.escape(collective.id)}"]`);
      selectCollective(collective, card || activeCard);
    });
    markers.set(collective.id, marker);
  });
}

function setupContactModal() {
  document.querySelectorAll(".close-contact, .close-collective-confirmation").forEach((element) => {
    element.addEventListener("click", () => {
      document.querySelectorAll(".modal").forEach((modal) => {
        modal.style.display = "none";
      });
    });
  });

  window.addEventListener("click", (event) => {
    if (event.target.classList?.contains("modal")) {
      event.target.style.display = "none";
    }
  });

  const phoneInput = document.getElementById("collective-contact-phone");
  phoneInput.addEventListener("input", (event) => {
    let digits = event.target.value.replace(/\D/g, "");
    if (digits.length > 10) digits = digits.slice(0, 10);
    if (digits.length > 6) {
      event.target.value = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length > 3) {
      event.target.value = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else if (digits.length > 0) {
      event.target.value = `(${digits}`;
    } else {
      event.target.value = "";
    }
  });

  document.getElementById("collective-contact-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById("collective-contact-status");
    const payload = {
      collectiveId: document.getElementById("collective-contact-id").value,
      name: document.getElementById("collective-contact-name").value.trim(),
      phone: document.getElementById("collective-contact-phone").value.trim(),
      email: document.getElementById("collective-contact-email").value.trim(),
      message: document.getElementById("collective-contact-message").value.trim(),
      website: document.getElementById("collective-contact-website").value.trim()
    };

    if (!payload.name || !payload.email || !payload.message) {
      status.textContent = "Please fill out all required fields.";
      return;
    }

    status.textContent = "Sending message...";
    try {
      const response = await fetch(CONTACT_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Message failed.");
      document.getElementById("collective-contact-modal").style.display = "none";
      document.getElementById("collective-confirmation-modal").style.display = "block";
      form.reset();
    } catch (error) {
      console.error("Collective contact failed:", error);
      status.textContent = error.message || "Message could not be sent.";
    }
  });
}

export async function initCollectivesPage(options = {}) {
  setupContactModal();
  setupMobileViewSwitch();
  setupCollectiveFilters();

  try {
    const stateRows = await callRpc(PUBLIC_STATE_RPC);
    if (!stateRows[0]?.enabled) {
      showOffseason();
      return;
    }

    showExperience();
    if (!options.mapUnavailable && window.google?.maps) {
      map = new google.maps.Map(document.getElementById("collectives-map"), {
        center: initialCenter,
        zoom: initialZoom,
        mapId: "8f453e71c329ac123f8540c9"
      });
    }

    allCollectives = await callRpc(PUBLIC_COLLECTIVES_RPC);
    await applyCollectiveFilters();
  } catch (error) {
    console.error("Collectives failed to load:", error);
    showOffseason();
  }
}
