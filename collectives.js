import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';
import { getCollectivesPublicState } from './public-collectives-state.js';

const PUBLIC_COLLECTIVES_RPC = "get_public_collectives";
const CONTACT_FUNCTION_URL = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/contact-collective-hosts`;
const SIGNUP_FUNCTION_URL = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/signup-collective-attendee`;
const initialCenter = { lat: 39.7392, lng: -104.9903 };
const initialZoom = 9;
const CLOSED_MESSAGE = "We’re sorry, this group is currently closed due to capacity.";
const FULL_MESSAGE = "We’re sorry, this Collective is currently full.";
const NO_SPACE_MESSAGE = "We’re sorry, this Collective does not have enough remaining space for your group.";
const INLINE_FULL_MESSAGE = "Sorry, this Collective is currently full.";
const CAPACITY_MESSAGES = new Set([FULL_MESSAGE, NO_SPACE_MESSAGE]);
const CHILDCARE_OPTIONS = [
  "Childcare Available | Sitter Provided",
  "Children Welcome | No Sitter Provided",
  "Childcare Not Provided"
];

let map;
let markers = new Map();
let collectiveInfoWindow = null;
let infoWindowCollectiveId = null;
let activeCard = null;
let selectedCollective = null;
let allCollectives = [];
let signupCollective = null;
let signupConfirmationToken = "";
let signupLastFocused = null;
let signupModalState = "form";
let signupSubmitting = false;

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
  return "Childcare Not Provided";
}

function compactChildcareLabel(value) {
  if (value === "Childcare Available | Sitter Provided") return "Sitter Provided";
  if (value === "Children Welcome | No Sitter Provided") return "Children Welcome \u00B7 No Sitter";
  return "Childcare Not Provided";
}

function isCollectiveClosed(collective) {
  return collective?.is_closed === true;
}

function remainingSpaces(collective) {
  const spaces = Number(collective?.remaining_spaces);
  return Number.isInteger(spaces) && spaces >= 0 ? spaces : null;
}

function isCollectiveFull(collective) {
  return collective?.is_full === true || remainingSpaces(collective) === 0;
}

function isCollectiveUnavailable(collective) {
  return isCollectiveClosed(collective) || isCollectiveFull(collective);
}

function capacityLabel(collective) {
  const maxSize = Number(collective?.max_size);
  return Number.isInteger(maxSize) && maxSize >= 1 && maxSize <= 25 ? `Up to ${maxSize} people` : "N/A";
}

function availabilityLabel(collective) {
  if (isCollectiveClosed(collective)) return "Closed";
  if (isCollectiveFull(collective)) return "Full";
  const spaces = remainingSpaces(collective);
  if (spaces !== null) return `${spaces} ${spaces === 1 ? "spot" : "spots"} remaining`;
  return "Open";
}

function signupButtonLabel(collective) {
  if (isCollectiveClosed(collective)) return "Closed";
  if (isCollectiveFull(collective)) return "Full";
  return "Sign Up";
}

function capacityStatusElement(collective) {
  const status = availabilityLabel(collective);
  const className = isCollectiveClosed(collective) || isCollectiveFull(collective)
    ? "collective-capacity-status collective-capacity-status-full"
    : "collective-capacity-status";
  return createElement("p", className, status);
}

function signupPartySize(payload) {
  const adultCount = Number(payload.adultCount);
  const childCount = Number(payload.childCount);
  if (!Number.isInteger(adultCount) || !Number.isInteger(childCount)) return null;
  return adultCount + childCount;
}

function signupCapacityMessage(payload = signupPayload()) {
  const spaces = remainingSpaces(signupCollective);
  const partySize = signupPartySize(payload);
  if (spaces === 0) return INLINE_FULL_MESSAGE;
  if (spaces !== null && partySize !== null && partySize > spaces) {
    return spaces === 1
      ? "Sorry, there is only 1 spot left in this Collective."
      : `Sorry, there are only ${spaces} spots left in this Collective.`;
  }
  return "";
}

function setSignupCapacityMessage(message) {
  const element = document.getElementById("collective-signup-capacity");
  if (!element) return;
  element.textContent = message || "";
  element.hidden = !message;
}

function updateSignupCapacityMessage(payload = signupPayload()) {
  if (signupModalState !== "form") {
    setSignupCapacityMessage("");
    return "";
  }
  const message = signupCapacityMessage(payload);
  setSignupCapacityMessage(message);
  return message;
}

function normalizePublicErrorMessage(message) {
  return String(message || "").replace(/Weâ€™re/g, "We’re").replace(/We're/g, "We’re");
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
  closeInfoWindow();
  activeCard = null;
  selectedCollective = null;
}

function restoreSelection() {
  if (!selectedCollective) return;
  activeCard = document.querySelector(`[data-collective-id="${CSS.escape(selectedCollective.id)}"]`);
  if (activeCard) activeCard.classList.add("is-selected");
  const marker = markers.get(selectedCollective.id);
  marker?.element?.classList.add("is-active");
  if (infoWindowCollectiveId === selectedCollective.id) {
    openCollectiveInfoWindow(selectedCollective, marker);
  }
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
  if (marker && map) {
    map.setCenter({ lat: collective.latitude, lng: collective.longitude });
    map.setZoom(14);
    marker.element?.classList.add("is-active");
    openCollectiveInfoWindow(collective, marker);
  }

  if (isMobileCollectivesLayout()) {
    setMobileView("map");
    document.getElementById("collectives-experience").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function closeInfoWindow() {
  if (collectiveInfoWindow) collectiveInfoWindow.close();
  infoWindowCollectiveId = null;
}

function ensureInfoWindow() {
  if (!collectiveInfoWindow && window.google?.maps) {
    collectiveInfoWindow = new google.maps.InfoWindow({
      maxWidth: 280
    });
    collectiveInfoWindow.addListener("closeclick", () => {
      infoWindowCollectiveId = null;
    });
  }
  return collectiveInfoWindow;
}

function createInfoWindowContent(collective) {
  const fullChildcare = childcareOption(collective);
  const content = createElement("div", "collective-info-window");
  const actions = createElement("div", "collective-info-actions");
  const contactButton = createElement("button", "collective-info-contact", "Contact Host");
  contactButton.type = "button";
  contactButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openContactModal(collective);
  });
  const signupButton = createElement("button", "collective-info-signup", signupButtonLabel(collective));
  signupButton.type = "button";
  signupButton.disabled = isCollectiveUnavailable(collective);
  signupButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openSignupModal(collective);
  });
  actions.append(contactButton, signupButton);

  content.append(
    createElement("h3", "", `${fieldValue(collective.primary_host_last_name)} Collective`),
    createElement("p", "collective-info-cross-streets", fieldValue(collective.cross_streets)),
    detail("Audience", audienceLabel(collective.audience)),
    detail("Childcare", compactChildcareLabel(fullChildcare)),
    detail("Capacity", capacityLabel(collective)),
    capacityStatusElement(collective),
    actions
  );

  return content;
}

function openCollectiveInfoWindow(collective, marker) {
  const infoWindow = ensureInfoWindow();
  if (!infoWindow || !map || !marker) return;

  infoWindowCollectiveId = collective.id;
  infoWindow.setContent(createInfoWindowContent(collective));
  infoWindow.open({
    map,
    anchor: marker
  });
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

function resetRecaptcha() {
  if (window.grecaptcha?.reset) {
    try {
      window.grecaptcha.reset();
    } catch {
      // Widget may not be ready yet.
    }
  }
}

function signupStatus(message, tone = "") {
  const status = document.getElementById("collective-signup-status");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.tone = tone;
}

function setSignupModalState(state) {
  signupModalState = ["form", "reassignment", "success"].includes(state) ? state : "form";
  const modal = document.getElementById("collective-signup-modal");
  const title = document.getElementById("collective-signup-title");
  const form = document.getElementById("collective-signup-form");
  const success = document.getElementById("collective-signup-success");
  const closeButton = modal?.querySelector(".close-signup");
  const isSuccess = signupModalState === "success";

  if (modal) {
    modal.dataset.signupState = signupModalState;
    modal.setAttribute("aria-labelledby", isSuccess ? "collective-signup-success-title" : "collective-signup-title");
  }
  if (title) title.hidden = isSuccess;
  if (closeButton) closeButton.hidden = isSuccess;
  if (form) form.hidden = isSuccess;
  if (success) success.hidden = !isSuccess;

  if (signupModalState !== "form") setSignupCapacityMessage("");
  if (isSuccess) signupStatus("");
}

function clearSignupSuccess() {
  [
    "collective-signup-success-title",
    "collective-signup-success-body",
    "collective-signup-success-email",
    "collective-signup-success-followup"
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.textContent = "";
  });
}

function isValidSignupEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function isValidSignupPhone(phone) {
  return phone.replace(/\D/g, "").length === 10;
}

function isSignupConflictActive() {
  return Boolean(signupConfirmationToken && !document.getElementById("collective-signup-conflict")?.hidden);
}

function updateSignupSubmitState() {
  const submitButton = document.getElementById("collective-signup-submit");
  if (!submitButton) return;
  const payload = signupPayload();
  const capacityMessage = updateSignupCapacityMessage(payload);
  const isEligible = !isSignupConflictActive() && !capacityMessage && !validateSignupPayload(payload);
  submitButton.disabled = signupSubmitting || !isEligible;
  submitButton.textContent = signupSubmitting ? "Signing Up..." : "Sign Up";
  submitButton.dataset.state = signupSubmitting ? "submitting" : (isEligible ? "ready" : "disabled");
}

function setSignupSubmitting(isSubmitting) {
  signupSubmitting = isSubmitting;
  const submitButton = document.getElementById("collective-signup-submit");
  const moveButton = document.getElementById("collective-signup-move");
  if (moveButton) moveButton.disabled = isSubmitting;
  updateSignupSubmitState();
}

function setSignupConflict(message, token = "") {
  signupConfirmationToken = token;
  const conflict = document.getElementById("collective-signup-conflict");
  const conflictText = document.getElementById("collective-signup-conflict-text");
  const codeInput = document.getElementById("collective-signup-confirmation-code");
  if (conflictText) conflictText.textContent = message ? `${message} We sent a confirmation code to your email.` : "";
  if (codeInput) codeInput.value = "";
  if (conflict) conflict.hidden = !message;
  const submitButton = document.getElementById("collective-signup-submit");
  if (submitButton) submitButton.hidden = Boolean(message);
  if (message) {
    setSignupModalState("reassignment");
  } else if (signupModalState === "reassignment") {
    setSignupModalState("form");
  }
  if (message) codeInput?.focus();
  updateSignupSubmitState();
}

function resetSignupModalState() {
  const form = document.getElementById("collective-signup-form");
  form?.reset();
  signupConfirmationToken = "";
  signupSubmitting = false;
  setSignupModalState("form");
  setSignupConflict("");
  clearSignupSuccess();
  setSignupCapacityMessage("");
  signupStatus("");
  resetRecaptcha();
  updateSignupSubmitState();
}

function showSignupSuccess(payload, isReassignment) {
  signupConfirmationToken = "";
  setSignupConflict("");
  signupStatus("");
  setSignupCapacityMessage("");
  resetRecaptcha();

  const hostLastName = fieldValue(signupCollective?.primary_host_last_name || "Host");
  const email = payload.email.trim();
  document.getElementById("collective-signup-success-title").textContent = isReassignment
    ? "Your Signup Has Been Updated"
    : "You’re Signed Up!";
  document.getElementById("collective-signup-success-body").textContent = isReassignment
    ? `You are now registered for the ${hostLastName} Collective.`
    : `Your registration for the ${hostLastName} Collective has been received.`;
  document.getElementById("collective-signup-success-email").textContent = `A confirmation email has been sent to ${email}.`;
  document.getElementById("collective-signup-success-followup").textContent = isReassignment
    ? "The new Collective hosts will follow up with additional details."
    : "The Collective hosts will follow up with additional details.";
  setSignupModalState("success");
  requestAnimationFrame(() => {
    document.getElementById("collective-signup-success-title")?.focus();
  });
}

function focusableElements(container) {
  return Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.offsetParent !== null);
}

function openSignupModal(collective) {
  if (isCollectiveClosed(collective)) {
    const modal = document.getElementById("collective-signup-modal");
    signupCollective = collective;
    signupLastFocused = document.activeElement;
    resetSignupModalState();
    document.getElementById("collective-signup-id").value = collective.id;
    document.getElementById("collective-signup-title").textContent = `Sign Up for ${fieldValue(collective.primary_host_last_name)} Collective`;
    setSignupConflict("");
    signupStatus(CLOSED_MESSAGE, "error");
    modal.style.display = "block";
    document.getElementById("collective-signup-cancel")?.focus();
    return;
  }

  if (isCollectiveFull(collective)) {
    const modal = document.getElementById("collective-signup-modal");
    signupCollective = collective;
    signupLastFocused = document.activeElement;
    resetSignupModalState();
    document.getElementById("collective-signup-id").value = collective.id;
    document.getElementById("collective-signup-title").textContent = `Sign Up for ${fieldValue(collective.primary_host_last_name)} Collective`;
    setSignupConflict("");
    signupStatus(FULL_MESSAGE, "error");
    modal.style.display = "block";
    document.getElementById("collective-signup-cancel")?.focus();
    return;
  }

  signupCollective = collective;
  signupLastFocused = document.activeElement;
  resetSignupModalState();
  document.getElementById("collective-signup-id").value = collective.id;
  document.getElementById("collective-signup-title").textContent = `Sign Up for ${fieldValue(collective.primary_host_last_name)} Collective`;
  document.getElementById("collective-signup-modal").style.display = "block";
  updateSignupSubmitState();
  document.getElementById("collective-signup-first-name").focus();
}

function closeSignupModal() {
  document.getElementById("collective-signup-modal").style.display = "none";
  signupCollective = null;
  resetSignupModalState();
  signupLastFocused?.focus?.();
}

function signupPayload() {
  return {
    collectiveId: document.getElementById("collective-signup-id").value,
    firstName: document.getElementById("collective-signup-first-name").value.trim(),
    lastName: document.getElementById("collective-signup-last-name").value.trim(),
    phone: document.getElementById("collective-signup-phone").value.trim(),
    email: document.getElementById("collective-signup-email").value.trim(),
    emailConfirm: document.getElementById("collective-signup-email-confirm").value.trim(),
    adultCount: document.getElementById("collective-signup-adults").value,
    childCount: document.getElementById("collective-signup-kids").value,
    privacyAccepted: document.getElementById("collective-signup-privacy")?.checked ?? true,
    website: document.getElementById("collective-signup-website").value.trim(),
    recaptchaToken: window.grecaptcha?.getResponse?.() || ""
  };
}

function validateSignupPayload(payload) {
  if (!payload.firstName || !payload.lastName || !payload.phone || !payload.email || !payload.emailConfirm) {
    return "Please fill out all required fields.";
  }
  if (!isValidSignupPhone(payload.phone)) return "Please enter a valid 10-digit phone number.";
  if (!isValidSignupEmail(payload.email) || !isValidSignupEmail(payload.emailConfirm)) {
    return "Please enter a valid email address.";
  }
  if (payload.email.trim().toLowerCase() !== payload.emailConfirm.trim().toLowerCase()) {
    return "Email entries must match.";
  }
  if (!payload.adultCount || !payload.childCount) return "Please select household counts.";
  if (!payload.privacyAccepted) return "Please accept the privacy notice.";
  const capacityMessage = signupCapacityMessage(payload);
  if (capacityMessage) return capacityMessage;
  if (!payload.recaptchaToken) return "Please complete the reCAPTCHA.";
  return "";
}

async function submitSignup(confirmationToken = "") {
  const payload = signupPayload();
  const validationError = validateSignupPayload(payload);
  if (validationError) {
    const capacityMessage = signupCapacityMessage(payload);
    if (capacityMessage && signupModalState === "form") {
      updateSignupCapacityMessage(payload);
      signupStatus("");
    } else {
      signupStatus(validationError, "error");
    }
    return;
  }
  const confirmationCode = confirmationToken
    ? document.getElementById("collective-signup-confirmation-code").value.trim()
    : "";
  if (confirmationToken && !/^\d{6}$/.test(confirmationCode)) {
    signupStatus("Enter the 6-digit confirmation code from your email.", "error");
    return;
  }

  setSignupSubmitting(true);
  signupStatus(confirmationToken ? "Moving your signup..." : "Submitting signup...");
  try {
    const response = await fetch(SIGNUP_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, confirmationToken, confirmationCode })
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 409 && result.status === "conflict") {
      setSignupConflict(result.message || "You are already signed up for a different Collective.", result.confirmationToken || "");
      signupStatus("");
      resetRecaptcha();
      return;
    }
    if (!response.ok) {
      const message = normalizePublicErrorMessage(result.error || "Signup failed.");
      if (result.capacityChanged === true || CAPACITY_MESSAGES.has(message)) {
        await refreshPublicCollectives().catch((refreshError) => {
          console.error("Collective capacity refresh failed:", refreshError);
        });
        const inlineMessage = updateSignupCapacityMessage(payload);
        if (signupModalState === "form" && !inlineMessage && message === FULL_MESSAGE) {
          setSignupCapacityMessage(INLINE_FULL_MESSAGE);
        }
        signupStatus(signupModalState === "form" ? "" : message, signupModalState === "form" ? "" : "error");
        resetRecaptcha();
        return;
      }
      throw new Error(message);
    }
    showSignupSuccess(payload, Boolean(confirmationToken));
    await refreshPublicCollectives().catch((refreshError) => {
      console.error("Collective capacity refresh failed:", refreshError);
    });
  } catch (error) {
    console.error("Collective signup failed:", error);
    signupStatus(normalizePublicErrorMessage(error.message || "Signup could not be completed."), "error");
    resetRecaptcha();
  } finally {
    setSignupSubmitting(false);
  }
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
      ),
      detail("Capacity", capacityLabel(collective)),
      capacityStatusElement(collective)
    );

    const actions = createElement("div", "collective-card-actions");
    const mapButton = createElement("button", "", "View Map");
    mapButton.type = "button";
    const contactButton = createElement("button", "", "Contact Host");
    contactButton.type = "button";
    const signupButton = createElement("button", "", signupButtonLabel(collective));
    signupButton.type = "button";
    signupButton.disabled = isCollectiveUnavailable(collective);
    actions.append(mapButton, contactButton, signupButton);
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
    signupButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openSignupModal(collective);
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

async function refreshPublicCollectives() {
  allCollectives = await callRpc(PUBLIC_COLLECTIVES_RPC);
  if (signupCollective) {
    const refreshed = allCollectives.find((collective) => String(collective.id) === String(signupCollective.id));
    if (refreshed) signupCollective = refreshed;
  }
  await applyCollectiveFilters();
  updateSignupSubmitState();
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

function setupSignupModal() {
  const modal = document.getElementById("collective-signup-modal");
  const form = document.getElementById("collective-signup-form");
  if (!modal || !form) return;

  modal.querySelectorAll(".close-signup, #collective-signup-cancel, #collective-signup-keep, #collective-signup-success-close").forEach((element) => {
    element.addEventListener("click", closeSignupModal);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        closeSignupModal();
      }
    });
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeSignupModal();
  });

  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSignupModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(modal);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.getElementById("collective-signup-phone").addEventListener("input", (event) => {
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
    updateSignupSubmitState();
  });

  form.addEventListener("input", updateSignupSubmitState);
  form.addEventListener("change", updateSignupSubmitState);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSignup();
  });

  document.getElementById("collective-signup-move").addEventListener("click", () => {
    if (!signupConfirmationToken) {
      signupStatus("Signup confirmation expired. Please submit the form again.", "error");
      return;
    }
    submitSignup(signupConfirmationToken);
  });

  updateSignupSubmitState();
}

window.collectiveSignupRecaptchaChanged = updateSignupSubmitState;

export async function initCollectivesPage(options = {}) {
  setupContactModal();
  setupSignupModal();
  setupMobileViewSwitch();
  setupCollectiveFilters();

  try {
    const state = await getCollectivesPublicState();
    if (!state?.enabled) {
      showOffseason();
      return;
    }

    showExperience();
    if (!options.mapUnavailable && window.google?.maps) {
      map = new google.maps.Map(document.getElementById("collectives-map"), {
        center: initialCenter,
        zoom: initialZoom,
        mapId: "8f453e71c329ac123f8540c9",
        fullscreenControl: false,
        streetViewControl: false
      });
      map.addListener("click", closeInfoWindow);
    }

    await refreshPublicCollectives();
  } catch (error) {
    console.error("Collectives failed to load:", error);
    showOffseason();
  }
}
