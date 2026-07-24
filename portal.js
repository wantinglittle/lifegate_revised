import {
  getAdminGroups,
  getCurrentSession,
  getCurrentUser,
  getMyProfile,
  getMyCommunities,
  isExpectedNonAdminError,
  looksLikeEmail,
  normalizeEmail,
  PORTAL_LOGIN_PAGE,
  redirectTo,
  requestUserEmailChange,
  signOutPortalUser,
  supabase,
  updateMyProfile
} from './portal-auth.js';

const STATUS_LABELS = {
  pending: "Pending",
  active: "Active",
  inactive: "Inactive"
};

const STATUS_ORDER = {
  pending: 0,
  active: 1,
  inactive: 2
};

const SEARCH_FIELDS = [
  "title",
  "city",
  "cross_streets",
  "contact_name",
  "contact_email",
  "contact_phone"
];

const userEmail = document.getElementById("portal-user-email");
const portalRole = document.getElementById("portal-role");
const ownedCount = document.getElementById("portal-owned-count");
const adminCount = document.getElementById("portal-admin-count");
const adminMetric = document.getElementById("portal-admin-metric");
const statusMessage = document.getElementById("portal-status");
const logoutButton = document.getElementById("portal-logout");
const adminTab = document.getElementById("portal-tab-admin");
const myTab = document.getElementById("portal-tab-my");
const myPanel = document.getElementById("portal-panel-my");
const adminPanel = document.getElementById("portal-panel-admin");
const myList = document.getElementById("portal-my-list");
const adminList = document.getElementById("portal-admin-list");
const adminSearch = document.getElementById("portal-admin-search");
const clearSearchButton = document.getElementById("portal-clear-search");
const filterButtons = Array.from(document.querySelectorAll(".portal-filter-btn"));
const profileView = document.getElementById("portal-profile-view");
const profileModal = document.getElementById("portal-profile-modal");
const profileModalPanel = profileModal.querySelector(".portal-modal-panel");
const profileForm = document.getElementById("portal-profile-form");
const profileFirstName = document.getElementById("portal-profile-first-name");
const profileLastName = document.getElementById("portal-profile-last-name");
const profileEmail = document.getElementById("portal-profile-email");
const profileEditButton = document.getElementById("portal-profile-edit");
const profileFirstInput = document.getElementById("portal-profile-first-input");
const profileLastInput = document.getElementById("portal-profile-last-input");
const profileEmailInput = document.getElementById("portal-profile-email-input");
const profileSaveButton = document.getElementById("portal-profile-save");
const profileCancelButton = document.getElementById("portal-profile-cancel");
const profileStatus = document.getElementById("portal-profile-status");

let authSubscription;
let adminGroups = [];
let currentAdminFilter = "all";
let currentProfile = null;
let currentConfirmedEmail = "";
let isProfileSaving = false;
let profileModalReturnFocus = null;

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function clearStatus() {
  statusMessage.textContent = "";
  delete statusMessage.dataset.tone;
}

function setProfileStatus(message, tone = "info") {
  profileStatus.textContent = message;
  profileStatus.dataset.tone = tone;
}

function clearProfileStatus() {
  profileStatus.textContent = "";
  delete profileStatus.dataset.tone;
}

function profileDisplayValue(value) {
  const text = String(value || "").trim();
  return text || "Not set";
}

function setProfileFieldError(input, message) {
  const errorElement = document.getElementById(`${input.id.replace("-input", "")}-error`);
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (errorElement) {
    errorElement.textContent = message;
  }
}

function validateProfileText(input, label) {
  const value = input.value.trim();
  if (!value) {
    setProfileFieldError(input, `${label} is required.`);
    return null;
  }
  if (value.length > 80) {
    setProfileFieldError(input, `${label} must be 80 characters or fewer.`);
    return null;
  }

  setProfileFieldError(input, "");
  return value;
}

function validateProfileEmail() {
  const value = normalizeEmail(profileEmailInput.value);
  if (!value || !looksLikeEmail(value)) {
    setProfileFieldError(profileEmailInput, "Enter a valid email address.");
    return null;
  }

  setProfileFieldError(profileEmailInput, "");
  return value;
}

function renderProfile(profile, fallbackEmail = "") {
  const confirmedEmail = normalizeEmail(fallbackEmail || currentConfirmedEmail);
  currentProfile = profile || {
    first_name: "",
    last_name: "",
    email: confirmedEmail,
    is_admin: false
  };
  currentConfirmedEmail = confirmedEmail || normalizeEmail(currentProfile.email);

  profileFirstName.textContent = profileDisplayValue(currentProfile.first_name);
  profileLastName.textContent = profileDisplayValue(currentProfile.last_name);
  profileEmail.textContent = profileDisplayValue(currentConfirmedEmail);
  userEmail.textContent = currentConfirmedEmail || "Signed-in dashboard user";
}

async function refreshProfileFromServer(fallbackEmail = currentConfirmedEmail) {
  const profile = await getMyProfile();
  renderProfile(profile, fallbackEmail);
  return profile;
}

function showProfileEditor() {
  profileModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : profileEditButton;
  profileFirstInput.value = currentProfile?.first_name || "";
  profileLastInput.value = currentProfile?.last_name || "";
  profileEmailInput.value = currentConfirmedEmail || currentProfile?.email || userEmail.textContent || "";
  [profileFirstInput, profileLastInput, profileEmailInput].forEach((input) => {
    setProfileFieldError(input, "");
  });
  clearProfileStatus();
  profileModal.hidden = false;
  profileFirstInput.focus();
}

function hideProfileEditor({ restoreFocus = true } = {}) {
  profileModal.hidden = true;
  isProfileSaving = false;
  profileSaveButton.disabled = false;
  profileCancelButton.disabled = false;
  if (restoreFocus && profileModalReturnFocus) {
    profileModalReturnFocus.focus();
  }
  profileModalReturnFocus = null;
}

function profileModalIsOpen() {
  return !profileModal.hidden;
}

function focusableProfileModalElements() {
  return Array.from(profileModal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.disabled && !element.hidden && element.offsetParent !== null);
}

function handleProfileModalKeydown(event) {
  if (!profileModalIsOpen()) return;

  if (event.key === "Escape") {
    if (!isProfileSaving) {
      event.preventDefault();
      hideProfileEditor();
    }
    return;
  }

  if (event.key !== "Tab") return;

  const focusableElements = focusableProfileModalElements();
  if (focusableElements.length === 0) {
    event.preventDefault();
    profileModalPanel.focus();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

async function saveProfile(event) {
  event.preventDefault();
  if (isProfileSaving) return;

  const firstName = validateProfileText(profileFirstInput, "First name");
  const lastName = validateProfileText(profileLastInput, "Last name");
  const requestedEmail = validateProfileEmail();
  if (!firstName || !lastName || !requestedEmail) {
    setProfileStatus("Please fix the highlighted fields.", "error");
    return;
  }

  const currentEmail = normalizeEmail(currentConfirmedEmail || currentProfile?.email || userEmail.textContent);
  const changes = {};
  if (firstName !== (currentProfile?.first_name || "")) {
    changes.first_name = firstName;
  }
  if (lastName !== (currentProfile?.last_name || "")) {
    changes.last_name = lastName;
  }

  const emailChanged = requestedEmail !== currentEmail;
  if (Object.keys(changes).length === 0 && !emailChanged) {
    setProfileStatus("No profile changes to save.", "info");
    return;
  }

  isProfileSaving = true;
  profileSaveButton.disabled = true;
  profileCancelButton.disabled = true;
  setProfileStatus("Saving profile...", "info");

  let updatedProfile = currentProfile;
  let namesSaved = false;

  try {
    if (Object.keys(changes).length > 0) {
      updatedProfile = await updateMyProfile(changes);
      namesSaved = true;
      renderProfile(updatedProfile, currentEmail);
    }
  } catch (error) {
    console.error("Profile name update failed:", error);
    setProfileStatus(error.message || "Profile names could not be updated.", "error");
    isProfileSaving = false;
    profileSaveButton.disabled = false;
    profileCancelButton.disabled = false;
    return;
  }

  try {
    if (emailChanged) {
      const authResult = await requestUserEmailChange(requestedEmail);
      const confirmedAuthEmail = normalizeEmail(authResult?.user?.email);

      if (confirmedAuthEmail === requestedEmail) {
        currentConfirmedEmail = confirmedAuthEmail;
        try {
          updatedProfile = await refreshProfileFromServer(confirmedAuthEmail);
        } catch (profileError) {
          console.error("Profile reload after email update failed:", profileError);
          renderProfile(updatedProfile, confirmedAuthEmail);
        }
        setStatus(namesSaved ? "Profile updated and email changed." : "Email changed.", "success");
      } else {
        renderProfile(updatedProfile, currentEmail);
        setStatus(
          namesSaved
            ? "Profile names saved. A confirmation email has been sent. Your dashboard email will update after the change is confirmed."
            : "A confirmation email has been sent. Your dashboard email will update after the change is confirmed.",
          "success"
        );
      }
    } else {
      try {
        updatedProfile = await refreshProfileFromServer(currentEmail);
      } catch (profileError) {
        console.error("Profile reload after profile save failed:", profileError);
        renderProfile(updatedProfile, currentEmail);
      }
      setStatus("Profile updated.", "success");
    }

    hideProfileEditor();
  } catch (error) {
    console.error("Email change request failed:", error);
    if (namesSaved) {
      renderProfile(updatedProfile, currentEmail);
      setProfileStatus(
        "Profile names were saved, but the email change could not be requested. Your login email was not changed.",
        "error"
      );
    } else {
      setProfileStatus(error.message || "Email change could not be requested.", "error");
    }
  } finally {
    isProfileSaving = false;
    profileSaveButton.disabled = false;
    profileCancelButton.disabled = false;
  }
}

function activateTab(tabName) {
  const showingAdmin = tabName === "admin";
  myTab.setAttribute("aria-selected", String(!showingAdmin));
  myTab.tabIndex = showingAdmin ? -1 : 0;
  myPanel.hidden = showingAdmin;

  if (!adminTab.hidden) {
    adminTab.setAttribute("aria-selected", String(showingAdmin));
    adminTab.tabIndex = showingAdmin ? 0 : -1;
    adminPanel.hidden = !showingAdmin;
  }
}

function setupTabs() {
  myTab.addEventListener("click", () => activateTab("my"));
  adminTab.addEventListener("click", () => activateTab("admin"));

  [myTab, adminTab].forEach((tab) => {
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (adminTab.hidden) return;

      event.preventDefault();
      const nextTab = tab === myTab ? adminTab : myTab;
      nextTab.focus();
      activateTab(nextTab === adminTab ? "admin" : "my");
    });
  });
}

function setupAdminControls() {
  adminSearch.addEventListener("input", () => {
    clearSearchButton.hidden = adminSearch.value.trim().length === 0;
    renderAdminCommunities();
  });

  clearSearchButton.addEventListener("click", () => {
    adminSearch.value = "";
    clearSearchButton.hidden = true;
    adminSearch.focus();
    renderAdminCommunities();
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentAdminFilter = button.dataset.status || "all";
      updateFilterButtonState();
      renderAdminCommunities();
    });
  });
}

function updateFilterButtonState() {
  filterButtons.forEach((button) => {
    const isSelected = button.dataset.status === currentAdminFilter;
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function updateFilterCounts() {
  const counts = {
    all: adminGroups.length,
    pending: 0,
    active: 0,
    inactive: 0
  };

  adminGroups.forEach((group) => {
    if (Object.prototype.hasOwnProperty.call(counts, group.status)) {
      counts[group.status] += 1;
    }
  });

  filterButtons.forEach((button) => {
    const status = button.dataset.status || "all";
    const label = status === "all" ? "All" : statusLabel(status);
    button.textContent = `${label} (${counts[status] || 0})`;
  });
}

function statusLabel(status) {
  return STATUS_LABELS[status] || "Unknown";
}

function availabilityLabel(group) {
  return group.is_closed === true ? "Currently Closed" : "Open to New Members";
}

function formatMeetingTime(meetingTime) {
  if (!meetingTime) return "N/A";

  const [hourText, minuteText] = String(meetingTime).split(":");
  const hour24 = Number(hourText);
  if (!Number.isInteger(hour24) || !minuteText) return "N/A";

  const ampm = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minuteText.padStart(2, "0")} ${ampm}`;
}

function fieldValue(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return String(value);
}

function sortedGroups(groups) {
  return [...groups].sort((left, right) => {
    const leftStatus = STATUS_ORDER[left.status] ?? 99;
    const rightStatus = STATUS_ORDER[right.status] ?? 99;
    if (leftStatus !== rightStatus) {
      return leftStatus - rightStatus;
    }

    return fieldValue(left.title).localeCompare(fieldValue(right.title), undefined, {
      sensitivity: "base"
    });
  });
}

function groupMatchesSearch(group, searchTerm) {
  if (!searchTerm) return true;

  return SEARCH_FIELDS.some((field) =>
    fieldValue(group[field]).toLowerCase().includes(searchTerm)
  );
}

function filteredAdminGroups() {
  const searchTerm = adminSearch.value.trim().toLowerCase();

  return sortedGroups(adminGroups.filter((group) => {
    const statusMatches = currentAdminFilter === "all" || group.status === currentAdminFilter;
    return statusMatches && groupMatchesSearch(group, searchTerm);
  }));
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function addDetail(card, label, value) {
  const detail = createElement("p", "portal-community-detail");
  const labelElement = createElement("span", "portal-community-label", `${label}:`);
  const valueElement = createElement("span", "", value);

  detail.append(labelElement, document.createTextNode(" "), valueElement);
  card.append(detail);
}

function editUrl(group) {
  return `portal-edit.html?id=${encodeURIComponent(String(group.id || ""))}`;
}

function renderCommunityCard(group, options = {}) {
  const { showContactDetails = false } = options;
  const card = createElement("article", "portal-community-card");

  const header = createElement("div", "portal-community-card-header");
  const title = createElement("h4", "", fieldValue(group.title));
  const badges = createElement("div", "portal-badges");
  const statusBadge = createElement("span", `portal-badge portal-badge-${group.status || "unknown"}`, statusLabel(group.status));
  const availabilityBadge = createElement(
    "span",
    group.is_closed === true ? "portal-badge portal-badge-closed" : "portal-badge portal-badge-open",
    availabilityLabel(group)
  );

  badges.append(statusBadge, availabilityBadge);
  header.append(title, badges);
  card.append(header);

  addDetail(card, "Day", fieldValue(group.day));
  addDetail(card, "Meeting Time", formatMeetingTime(group.meeting_time));
  addDetail(card, "City", fieldValue(group.city));
  addDetail(card, "Cross Streets", fieldValue(group.cross_streets));

  if (showContactDetails) {
    addDetail(card, "Contact Name", fieldValue(group.contact_name));
    addDetail(card, "Contact Email", fieldValue(group.contact_email));
    addDetail(card, "Contact Phone", fieldValue(group.contact_phone));
  }

  const actions = createElement("div", "portal-community-actions");
  const editLink = createElement("a", "portal-edit-btn", "Edit");
  editLink.href = editUrl(group);
  editLink.setAttribute("aria-label", `Edit ${fieldValue(group.title)}`);
  actions.append(editLink);
  card.append(actions);

  return card;
}

function renderEmptyState(container, message) {
  container.innerHTML = "";
  container.append(createElement("p", "portal-empty-state", message));
}

function renderMyCommunities(groups) {
  ownedCount.textContent = String(groups.length);

  if (groups.length === 0) {
    renderEmptyState(myList, "You do not currently have any communities assigned to your account.");
    return;
  }

  myList.innerHTML = "";
  sortedGroups(groups).forEach((group) => {
    myList.append(renderCommunityCard(group));
  });
}

function renderAdminCommunities() {
  updateFilterCounts();
  updateFilterButtonState();

  if (adminGroups.length === 0) {
    renderEmptyState(adminList, "No communities exist yet.");
    return;
  }

  const visibleGroups = filteredAdminGroups();
  if (visibleGroups.length === 0) {
    renderEmptyState(adminList, "No communities match the current search and filter.");
    return;
  }

  adminList.innerHTML = "";
  visibleGroups.forEach((group) => {
    adminList.append(renderCommunityCard(group, { showContactDetails: true }));
  });
}

function showAdminDashboard(groups) {
  adminGroups = Array.isArray(groups) ? groups : [];
  portalRole.textContent = "Administrator";
  adminCount.textContent = String(adminGroups.length);
  adminMetric.hidden = false;
  adminTab.hidden = false;
  adminPanel.hidden = false;
  renderAdminCommunities();
}

function showContactPortal() {
  portalRole.textContent = "Community Host";
  adminMetric.hidden = true;
  adminTab.hidden = true;
  adminPanel.hidden = true;
}

function showAdminLoadFailure() {
  portalRole.textContent = "Community Host";
  adminMetric.hidden = true;
  adminTab.hidden = false;
  adminPanel.hidden = true;
  renderEmptyState(adminList, "Community data could not be loaded. Please refresh and try again.");
}

async function loadPortal() {
  setStatus("Checking your portal session...", "info");

  const session = await getCurrentSession();
  if (!session) {
    redirectTo(PORTAL_LOGIN_PAGE);
    return;
  }

  currentConfirmedEmail = normalizeEmail(session.user?.email || "");
  userEmail.textContent = currentConfirmedEmail || "Signed-in dashboard user";
  setStatus("Loading communities...", "info");

  const [profileResult, myCommunities, adminResult] = await Promise.allSettled([
    getMyProfile(),
    getMyCommunities(),
    getAdminGroups()
  ]);

  if (profileResult.status === "fulfilled" && profileResult.value) {
    renderProfile(profileResult.value, currentConfirmedEmail);
  } else {
    console.error("Profile failed to load:", profileResult.status === "rejected" ? profileResult.reason : "No profile returned");
    renderProfile(null, currentConfirmedEmail);
    setStatus("Your profile could not be loaded. Please refresh and try again.", "error");
  }

  if (myCommunities.status === "rejected") {
    console.error("My communities failed to load:", myCommunities.reason);
    renderEmptyState(myList, "Your communities could not be loaded. Please refresh and try again.");
    setStatus("Dashboard data could not be loaded. Please refresh and try again.", "error");
    return;
  }

  renderMyCommunities(myCommunities.value);

  if (adminResult.status === "fulfilled") {
    showAdminDashboard(adminResult.value);
    clearStatus();
    activateTab("admin");
  } else if (isExpectedNonAdminError(adminResult.reason)) {
    showContactPortal();
    clearStatus();
    activateTab("my");
  } else {
    console.error("Admin communities failed to load:", adminResult.reason);
    showAdminLoadFailure();
    setStatus("Some community data could not be loaded.", "error");
    activateTab("my");
  }
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  setStatus("Signing out...", "info");

  try {
    await signOutPortalUser();
    redirectTo(PORTAL_LOGIN_PAGE);
  } catch (error) {
    console.error("Portal sign-out failed:", error);
    setStatus("Sign-out failed. Please try again.", "error");
    logoutButton.disabled = false;
  }
});

profileEditButton.addEventListener("click", showProfileEditor);
profileCancelButton.addEventListener("click", hideProfileEditor);
profileForm.addEventListener("submit", saveProfile);
profileModal.addEventListener("click", (event) => {
  if (event.target === profileModal && !isProfileSaving) {
    hideProfileEditor();
  }
});
document.addEventListener("keydown", handleProfileModalKeydown);

[profileFirstInput, profileLastInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") {
      validateProfileText(input, input === profileFirstInput ? "First name" : "Last name");
    }
  });
});

profileEmailInput.addEventListener("input", () => {
  if (profileEmailInput.getAttribute("aria-invalid") === "true") {
    validateProfileEmail();
  }
});

authSubscription = supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    redirectTo(PORTAL_LOGIN_PAGE);
    return;
  }

  if (event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
    window.setTimeout(async () => {
      try {
        const user = await getCurrentUser();
        currentConfirmedEmail = normalizeEmail(user?.email || session.user?.email || currentConfirmedEmail);
        await refreshProfileFromServer(currentConfirmedEmail);
      } catch (error) {
        console.error("Profile reload after auth state change failed:", error);
      }
    }, 0);
  }
}).data.subscription;

window.addEventListener("pagehide", () => {
  authSubscription.unsubscribe();
});

setupTabs();
setupAdminControls();
loadPortal();
