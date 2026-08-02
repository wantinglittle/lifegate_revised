import {
  getAdminCollectives,
  getAdminGroups,
  getCollectiveAttendees,
  getCollectivesSettingsAdmin,
  getCurrentSession,
  getCurrentUser,
  getMyCollectives,
  getMyProfile,
  getMyCommunities,
  isExpectedNonAdminError,
  looksLikeEmail,
  normalizeEmail,
  PORTAL_LOGIN_PAGE,
  redirectTo,
  requestUserEmailChange,
  removeCollectiveAttendee,
  signOutPortalUser,
  supabase,
  updateCollectivesSettingsAdmin,
  updateCollectiveAttendee,
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

const COLLECTIVE_SEARCH_FIELDS = [
  "city",
  "cross_streets",
  "primary_host_email",
  "primary_host_first_name",
  "primary_host_last_name",
  "primary_host_phone",
  "secondary_host_first_name",
  "secondary_host_last_name",
  "secondary_host_email",
  "secondary_host_phone"
];

const portalRole = document.getElementById("portal-role");
const ownedCount = document.getElementById("portal-owned-count");
const adminCount = document.getElementById("portal-admin-count");
const adminMetric = document.getElementById("portal-admin-metric");
const statusMessage = document.getElementById("portal-status");
const logoutButton = document.getElementById("portal-logout");
const adminTab = document.getElementById("portal-tab-admin");
const collectivesTab = document.getElementById("portal-tab-collectives");
const sendMessageLink = document.getElementById("portal-send-message-link");
const myTab = document.getElementById("portal-tab-my");
const myPanel = document.getElementById("portal-panel-my");
const adminPanel = document.getElementById("portal-panel-admin");
const collectivesPanel = document.getElementById("portal-panel-collectives");
const myList = document.getElementById("portal-my-list");
const adminList = document.getElementById("portal-admin-list");
const collectivesList = document.getElementById("portal-collectives-list");
const myDownloadRow = document.getElementById("portal-my-download-row");
const adminDownloadRow = document.getElementById("portal-admin-download-row");
const collectivesDownloadRow = document.getElementById("portal-collectives-download-row");
const adminSearch = document.getElementById("portal-admin-search");
const clearSearchButton = document.getElementById("portal-clear-search");
const filterButtons = Array.from(document.querySelectorAll(".portal-filter-btn"));
const collectivesSearch = document.getElementById("portal-collectives-search");
const clearCollectivesSearchButton = document.getElementById("portal-clear-collectives-search");
const collectiveFilterButtons = Array.from(document.querySelectorAll(".portal-collective-filter-btn"));
const collectivesSettingsForm = document.getElementById("portal-collectives-settings-form");
const collectivesOverride = document.getElementById("portal-collectives-override");
const collectivesStart = document.getElementById("portal-collectives-start");
const collectivesEnd = document.getElementById("portal-collectives-end");
const collectivesSettingsStatus = document.getElementById("portal-collectives-settings-status");
const downloadListButton = document.getElementById("portal-download-list");
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
const attendeesModal = document.getElementById("portal-attendees-modal");
const attendeesModalPanel = attendeesModal.querySelector(".portal-modal-panel");
const attendeesTitle = document.getElementById("portal-attendees-title");
const attendeesStatus = document.getElementById("portal-attendees-status");
const attendeesList = document.getElementById("portal-attendees-list");
const attendeesExportButton = document.getElementById("portal-attendees-export");
const attendeesCloseButton = document.getElementById("portal-attendees-close");
const confirmModal = document.getElementById("portal-confirm-modal");
const confirmModalPanel = confirmModal.querySelector(".portal-modal-panel");
const confirmTitle = document.getElementById("portal-confirm-title");
const confirmBody = document.getElementById("portal-confirm-body");
const confirmStatus = document.getElementById("portal-confirm-status");
const confirmCancelButton = document.getElementById("portal-confirm-cancel");
const confirmActionButton = document.getElementById("portal-confirm-action");

let authSubscription;
let adminGroups = [];
let adminCollectives = [];
let myCommunitiesCache = [];
let myCollectivesCache = [];
let currentAdminFilter = "all";
let currentCollectivesFilter = "all";
let currentTabName = "my";
let collectivesSettings = null;
let currentProfile = null;
let currentConfirmedEmail = "";
let isDownloadingList = false;
let isProfileSaving = false;
let profileModalReturnFocus = null;
let attendeesModalReturnFocus = null;
let activeAttendeeCollective = null;
let activeAttendees = [];
let activeConfirmOptions = null;
let confirmModalReturnFocus = null;
let isConfirmWorking = false;

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
  statusMessage.hidden = !message;
}

function clearStatus() {
  statusMessage.textContent = "";
  delete statusMessage.dataset.tone;
  statusMessage.hidden = true;
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
  profileEmailInput.value = currentConfirmedEmail || currentProfile?.email || "";
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

  const currentEmail = normalizeEmail(currentConfirmedEmail || currentProfile?.email);
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
  currentTabName = tabName;
  const showingAdmin = tabName === "admin";
  const showingCollectives = tabName === "collectives";
  const showingMy = tabName === "my";

  myTab.setAttribute("aria-selected", String(showingMy));
  myTab.tabIndex = showingMy ? 0 : -1;
  myPanel.hidden = !showingMy;

  if (!adminTab.hidden) {
    adminTab.setAttribute("aria-selected", String(showingAdmin));
    adminTab.tabIndex = showingAdmin ? 0 : -1;
    adminPanel.hidden = !showingAdmin;
  }

  if (!collectivesTab.hidden) {
    collectivesTab.setAttribute("aria-selected", String(showingCollectives));
    collectivesTab.tabIndex = showingCollectives ? 0 : -1;
    collectivesPanel.hidden = !showingCollectives;
  }

  const targetDownloadRow = showingAdmin
    ? adminDownloadRow
    : showingCollectives
      ? collectivesDownloadRow
      : myDownloadRow;
  if (targetDownloadRow && downloadListButton.parentElement !== targetDownloadRow) {
    targetDownloadRow.append(downloadListButton);
  }
}

function setupTabs() {
  myTab.addEventListener("click", () => activateTab("my"));
  adminTab.addEventListener("click", () => activateTab("admin"));
  collectivesTab.addEventListener("click", () => activateTab("collectives"));

  [adminTab, myTab, collectivesTab].forEach((tab, index, tabs) => {
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (adminTab.hidden) return;

      event.preventDefault();
      const visibleTabs = tabs.filter((candidate) => !candidate.hidden);
      const currentIndex = visibleTabs.indexOf(tab);
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextTab = visibleTabs[(currentIndex + direction + visibleTabs.length) % visibleTabs.length];
      nextTab.focus();
      activateTab(nextTab === adminTab ? "admin" : nextTab === collectivesTab ? "collectives" : "my");
    });
  });
}

function setupAdminControls() {
  downloadListButton.addEventListener("click", downloadContactList);

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

  collectivesSearch.addEventListener("input", () => {
    clearCollectivesSearchButton.hidden = collectivesSearch.value.trim().length === 0;
    renderAdminCollectives();
  });

  clearCollectivesSearchButton.addEventListener("click", () => {
    collectivesSearch.value = "";
    clearCollectivesSearchButton.hidden = true;
    collectivesSearch.focus();
    renderAdminCollectives();
  });

  collectiveFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentCollectivesFilter = button.dataset.status || "all";
      updateCollectiveFilterButtonState();
      renderAdminCollectives();
    });
  });

  collectivesSettingsForm.addEventListener("submit", saveCollectivesSettings);
}

function setCollectivesSettingsStatus(message, tone = "info") {
  collectivesSettingsStatus.textContent = message;
  collectivesSettingsStatus.dataset.tone = tone;
}

function renderCollectivesSettings(settings) {
  collectivesSettings = settings;
  collectivesOverride.value = settings?.manual_override || "automatic";
  collectivesStart.value = settings?.start_date || "";
  collectivesEnd.value = settings?.end_date || "";
  setCollectivesSettingsStatus(settings?.enabled ? "Public Collectives are enabled." : "Public Collectives are disabled.", "info");
}

async function saveCollectivesSettings(event) {
  event.preventDefault();
  setCollectivesSettingsStatus("Saving season settings...", "info");

  try {
    const settings = await updateCollectivesSettingsAdmin({
      manual_override: collectivesOverride.value,
      start_date: collectivesStart.value || null,
      end_date: collectivesEnd.value || null
    });
    renderCollectivesSettings(settings);
    setCollectivesSettingsStatus(settings.enabled ? "Season settings saved. Public Collectives are enabled." : "Season settings saved. Public Collectives are disabled.", "success");
  } catch (error) {
    console.error("Collectives settings update failed:", error);
    setCollectivesSettingsStatus(error.message || "Season settings could not be saved.", "error");
  }
}

function updateFilterButtonState() {
  filterButtons.forEach((button) => {
    const isSelected = button.dataset.status === currentAdminFilter;
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function updateCollectiveFilterButtonState() {
  collectiveFilterButtons.forEach((button) => {
    const isSelected = button.dataset.status === currentCollectivesFilter;
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

function updateCollectiveFilterCounts() {
  const counts = {
    all: adminCollectives.length,
    pending: 0,
    active: 0,
    inactive: 0
  };

  adminCollectives.forEach((collective) => {
    const status = collectiveStatus(collective);
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  });

  collectiveFilterButtons.forEach((button) => {
    const status = button.dataset.status || "all";
    const label = status === "all" ? "All" : statusLabel(status);
    button.textContent = `${label} (${counts[status] || 0})`;
  });
}

function statusLabel(status) {
  return STATUS_LABELS[status] || "Unknown";
}

function collectiveStatus(collective) {
  if (collective?.approval_status === "pending") return "pending";
  return collective?.listing_status === "active" ? "active" : "inactive";
}

function collectiveStatusLabel(collective) {
  return collectiveStatus(collective) === "pending" ? "Pending Approval" : statusLabel(collectiveStatus(collective));
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

function hostFullName(firstName, lastName, fallback = "Host") {
  const parts = [firstName, lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.join(" ") || fallback;
}

function collectiveAudienceLabel(value) {
  return value === "All" ? "Everyone Welcome" : fieldValue(value);
}

function collectiveChildcareLabel(collective) {
  const option = fieldValue(collective.childcare_option);
  if (option !== "N/A") return option;
  return "Childcare Not Provided";
}

function collectiveAvailabilityLabel(collective) {
  if (collective.is_closed === true) return "Closed to Signups";
  if (collectiveIsFull(collective)) return "Full";
  return "Open to Signups";
}

function attendeeCount(collective) {
  const count = Number(collective?.attendee_count || 0);
  return Number.isFinite(count) ? count : 0;
}

function registeredPeople(collective) {
  const count = Number(collective?.registered_people || 0);
  return Number.isFinite(count) ? count : 0;
}

function remainingSpaces(collective) {
  const count = Number(collective?.remaining_spaces);
  if (Number.isFinite(count)) return Math.max(count, 0);
  const maxSize = Number(collective?.max_size);
  return Number.isFinite(maxSize) ? Math.max(maxSize - registeredPeople(collective), 0) : null;
}

function collectiveIsFull(collective) {
  return collective?.is_full === true || remainingSpaces(collective) === 0;
}

function collectiveMaxSizeLabel(collective) {
  const maxSize = Number(collective?.max_size);
  return Number.isInteger(maxSize) && maxSize >= 1 && maxSize <= 25 ? String(maxSize) : "N/A";
}

function registeredPeopleLabel(collective) {
  return `${registeredPeople(collective)} of ${collectiveMaxSizeLabel(collective)}`;
}

function remainingSpacesLabel(collective) {
  const spaces = remainingSpaces(collective);
  return spaces === null ? "N/A" : String(spaces);
}

function formatDateTime(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fieldValue(value);
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function csvField(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function groupContactRow(group) {
  return [
    group.title,
    group.contact_name,
    group.contact_email,
    group.contact_phone
  ].map(csvField).join(",");
}

function contactListCsv(groups) {
  const header = [
    "Group Title",
    "Contact Name",
    "Contact Email",
    "Contact Phone"
  ].map(csvField).join(",");
  const rows = groups
    .slice()
    .sort((left, right) => fieldValue(left.title).localeCompare(fieldValue(right.title), undefined, {
      sensitivity: "base"
    }))
    .map(groupContactRow);

  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

function collectiveListCsv(collectives) {
  const header = [
    "City",
    "Cross Streets",
    "Audience",
    "Childcare",
    "Status",
    "Open/Closed",
    "Primary Host First Name",
    "Primary Host Last Name",
    "Primary Host Email",
    "Primary Host Phone",
    "Second Host First Name",
    "Second Host Last Name",
    "Second Host Email",
    "Second Host Phone",
    "Max Size",
    "Registered People",
    "Remaining Spaces",
    "Attendee Count"
  ].map(csvField).join(",");
  const rows = collectives.map((collective) => [
    collective.city,
    collective.cross_streets,
    collectiveAudienceLabel(collective.audience),
    collectiveChildcareLabel(collective),
    collectiveStatusLabel(collective),
    collective.is_closed === true ? "Closed" : "Open",
    collective.primary_host_first_name,
    collective.primary_host_last_name,
    collective.primary_host_email,
    collective.primary_host_phone,
    collective.secondary_host_first_name,
    collective.secondary_host_last_name,
    collective.secondary_host_email,
    collective.secondary_host_phone,
    collectiveMaxSizeLabel(collective),
    registeredPeople(collective),
    remainingSpacesLabel(collective),
    attendeeCount(collective)
  ].map(csvField).join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

function myDashboardCsv() {
  const header = [
    "Type",
    "Title",
    "City",
    "Cross Streets",
    "Status",
    "Closed",
    "Max Size",
    "Registered People",
    "Remaining Spaces",
    "Attendees"
  ].map(csvField).join(",");
  const communityRows = sortedGroups(myCommunitiesCache).map((group) => [
    "Community",
    group.title,
    group.city,
    group.cross_streets,
    statusLabel(group.status),
    group.is_closed === true ? "Yes" : "No",
    "",
    "",
    "",
    ""
  ].map(csvField).join(","));
  const collectiveRows = sortedCollectives(myCollectivesCache).map((collective) => [
    "Collective",
    `${hostFullName("", collective.primary_host_last_name)} Collective`,
    collective.city,
    collective.cross_streets,
    collectiveStatusLabel(collective),
    collective.is_closed === true ? "Yes" : "No",
    collectiveMaxSizeLabel(collective),
    registeredPeople(collective),
    remainingSpacesLabel(collective),
    attendeeCount(collective)
  ].map(csvField).join(","));
  return `\uFEFF${[header, ...communityRows, ...collectiveRows].join("\r\n")}`;
}

function attendeeListCsv(attendees) {
  const header = [
    "First Name",
    "Last Name",
    "Phone",
    "Email",
    "Adults",
    "Kids",
    "Signed Up At"
  ].map(csvField).join(",");
  const rows = attendees.map((attendee) => [
    attendee.first_name,
    attendee.last_name,
    attendee.phone,
    attendee.email,
    attendee.adult_count,
    attendee.child_count,
    attendee.signed_up_at
  ].map(csvField).join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

function downloadFilename(prefix = "lifegate-community-groups") {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${prefix}-${year}-${month}-${day}.csv`;
}

function saveCsv(csv, filename = downloadFilename()) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function sortedCollectives(collectives) {
  return [...collectives].sort((left, right) => {
    const leftStatus = STATUS_ORDER[collectiveStatus(left)] ?? 99;
    const rightStatus = STATUS_ORDER[collectiveStatus(right)] ?? 99;
    if (leftStatus !== rightStatus) {
      return leftStatus - rightStatus;
    }

    return fieldValue(left.city).localeCompare(fieldValue(right.city), undefined, {
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

function collectiveMatchesSearch(collective, searchTerm) {
  if (!searchTerm) return true;

  return COLLECTIVE_SEARCH_FIELDS.some((field) =>
    fieldValue(collective[field]).toLowerCase().includes(searchTerm)
  );
}

function filteredAdminCollectives() {
  const searchTerm = collectivesSearch.value.trim().toLowerCase();

  return sortedCollectives(adminCollectives.filter((collective) => {
    const statusMatches = currentCollectivesFilter === "all" || collectiveStatus(collective) === currentCollectivesFilter;
    return statusMatches && collectiveMatchesSearch(collective, searchTerm);
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

function addEmailDetail(card, label, email) {
  const detail = createElement("p", "portal-community-detail");
  const labelElement = createElement("span", "portal-community-label", `${label}:`);
  const normalizedEmail = String(email || "").trim();

  detail.append(labelElement, document.createTextNode(" "));

  if (normalizedEmail) {
    const emailLink = createElement("a", "", normalizedEmail);
    emailLink.href = `mailto:${normalizedEmail}`;
    detail.append(emailLink);
  }

  card.append(detail);
}

function editUrl(group) {
  return `portal-edit.html?id=${encodeURIComponent(String(group.id || ""))}`;
}

function collectiveEditUrl(collective) {
  return `portal-edit.html?type=collective&id=${encodeURIComponent(String(collective.id || ""))}`;
}

function renderCommunityCard(group, options = {}) {
  const { showContactDetails = false, typeLabel = "" } = options;
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

  if (typeLabel) {
    badges.append(createElement("span", "portal-badge portal-badge-inactive", typeLabel));
  }
  badges.append(statusBadge, availabilityBadge);
  header.append(title, badges);
  card.append(header);

  addDetail(card, "Day", fieldValue(group.day));
  addDetail(card, "Meeting Time", formatMeetingTime(group.meeting_time));
  addDetail(card, "City", fieldValue(group.city));
  addDetail(card, "Cross Streets", fieldValue(group.cross_streets));

  if (showContactDetails) {
    addDetail(card, "Contact Name", fieldValue(group.contact_name));
    addEmailDetail(card, "Contact Email", group.contact_email);
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

function renderCollectiveCard(collective, options = {}) {
  const { showContactDetails = false } = options;
  const card = createElement("article", "portal-community-card");
  const header = createElement("div", "portal-community-card-header");
  const hostLastName = String(collective.primary_host_last_name || "").trim() || "Host";
  const title = createElement("h4", "", `${hostLastName} Collective`);
  const badges = createElement("div", "portal-badges");

  badges.append(
    createElement("span", "portal-badge portal-badge-inactive", "Collective"),
    createElement("span", `portal-badge portal-badge-${collectiveStatus(collective)}`, collectiveStatusLabel(collective)),
    createElement(
      "span",
      collective.is_closed === true || collectiveIsFull(collective) ? "portal-badge portal-badge-closed" : "portal-badge portal-badge-open",
      collectiveAvailabilityLabel(collective)
    )
  );
  header.append(title, badges);
  card.append(header);

  addDetail(card, "City", fieldValue(collective.city));
  addDetail(card, "Cross Streets", fieldValue(collective.cross_streets));
  addDetail(card, "Audience", collectiveAudienceLabel(collective.audience));
  addDetail(card, "Childcare", collectiveChildcareLabel(collective));
  addDetail(card, "Max Size", collectiveMaxSizeLabel(collective));
  addDetail(card, "Attendee Signups", String(attendeeCount(collective)));
  addDetail(card, "Registered People", registeredPeopleLabel(collective));
  addDetail(card, "Remaining Spaces", remainingSpacesLabel(collective));

  if (showContactDetails) {
    addDetail(card, "Primary Host", hostFullName(collective.primary_host_first_name, collective.primary_host_last_name));
    addEmailDetail(card, "Primary Host Email", collective.primary_host_email);
    addDetail(card, "Primary Phone", fieldValue(collective.primary_host_phone));
    const secondaryHostName = hostFullName(collective.secondary_host_first_name, collective.secondary_host_last_name, "");
    if (secondaryHostName) {
      addDetail(card, "Second Host", secondaryHostName);
    }
    if (collective.secondary_host_email) {
      addEmailDetail(card, "Second Host Email", collective.secondary_host_email);
    }
    if (collective.secondary_host_phone) {
      addDetail(card, "Second Host Phone", fieldValue(collective.secondary_host_phone));
    }
  }

  const actions = createElement("div", "portal-community-actions");
  const editLink = createElement("a", "portal-edit-btn", "Edit");
  editLink.href = collectiveEditUrl(collective);
  editLink.setAttribute("aria-label", "Edit Collective Host");
  const attendeesButton = createElement("button", "portal-edit-btn", `Attendees (${attendeeCount(collective)})`);
  attendeesButton.type = "button";
  attendeesButton.addEventListener("click", () => openAttendeesModal(collective, attendeesButton));
  actions.append(editLink, attendeesButton);
  card.append(actions);

  return card;
}

function renderEmptyState(container, message) {
  container.innerHTML = "";
  container.append(createElement("p", "portal-empty-state", message));
}

function renderMyCommunities(groups, collectives = []) {
  myCommunitiesCache = Array.isArray(groups) ? groups : [];
  myCollectivesCache = Array.isArray(collectives) ? collectives : [];
  const totalCount = myCommunitiesCache.length + myCollectivesCache.length;
  ownedCount.textContent = String(totalCount);

  if (totalCount === 0) {
    renderEmptyState(myList, "You do not currently have any communities or collectives assigned to your account.");
    return;
  }

  myList.innerHTML = "";
  sortedGroups(myCommunitiesCache).forEach((group) => {
    myList.append(renderCommunityCard(group, { typeLabel: "Community" }));
  });
  sortedCollectives(myCollectivesCache).forEach((collective) => {
    myList.append(renderCollectiveCard(collective));
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

function renderAdminCollectives() {
  updateCollectiveFilterCounts();
  updateCollectiveFilterButtonState();

  if (adminCollectives.length === 0) {
    renderEmptyState(collectivesList, "No collectives exist yet.");
    return;
  }

  const visibleCollectives = filteredAdminCollectives();
  if (visibleCollectives.length === 0) {
    renderEmptyState(collectivesList, "No collectives match the current search and filter.");
    return;
  }

  collectivesList.innerHTML = "";
  visibleCollectives.forEach((collective) => {
    collectivesList.append(renderCollectiveCard(collective, { showContactDetails: true }));
  });
}

function setAttendeesStatus(message, tone = "info") {
  attendeesStatus.textContent = message || "";
  attendeesStatus.dataset.tone = tone;
}

function attendeesModalIsOpen() {
  return !attendeesModal.hidden;
}

function focusableAttendeesModalElements() {
  return Array.from(attendeesModal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.disabled && !element.hidden && element.offsetParent !== null);
}

function handleAttendeesModalKeydown(event) {
  if (confirmModalIsOpen()) return;
  if (!attendeesModalIsOpen()) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeAttendeesModal();
    return;
  }

  if (event.key !== "Tab") return;

  const focusableElements = focusableAttendeesModalElements();
  if (focusableElements.length === 0) {
    event.preventDefault();
    attendeesModalPanel.focus();
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

function confirmModalIsOpen() {
  return !confirmModal.hidden;
}

function focusableConfirmModalElements() {
  return Array.from(confirmModal.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.offsetParent !== null);
}

function setConfirmWorking(isWorking) {
  isConfirmWorking = isWorking;
  confirmCancelButton.disabled = isWorking;
  confirmActionButton.disabled = isWorking;
  confirmActionButton.textContent = isWorking
    ? activeConfirmOptions?.workingLabel || "Working..."
    : activeConfirmOptions?.confirmLabel || "Confirm";
}

function openPortalConfirm(options) {
  activeConfirmOptions = options;
  confirmModalReturnFocus = options.returnFocus || document.activeElement;
  confirmTitle.textContent = options.title || "Confirm Action";
  confirmBody.textContent = options.message || "";
  confirmStatus.textContent = "";
  confirmActionButton.textContent = options.confirmLabel || "Confirm";
  confirmModal.hidden = false;
  attendeesModal.setAttribute("aria-hidden", "true");
  setConfirmWorking(false);
  requestAnimationFrame(() => {
    confirmCancelButton.focus();
  });
}

function closePortalConfirm({ restoreFocus = true } = {}) {
  if (isConfirmWorking) return;
  confirmModal.hidden = true;
  attendeesModal.removeAttribute("aria-hidden");
  confirmStatus.textContent = "";
  activeConfirmOptions = null;
  if (restoreFocus && confirmModalReturnFocus && document.contains(confirmModalReturnFocus)) {
    confirmModalReturnFocus.focus();
  }
  confirmModalReturnFocus = null;
}

async function confirmPortalAction() {
  if (!activeConfirmOptions || isConfirmWorking) return;
  setConfirmWorking(true);
  confirmStatus.textContent = activeConfirmOptions.workingLabel || "Working...";
  try {
    await activeConfirmOptions.onConfirm?.();
    setConfirmWorking(false);
    closePortalConfirm({ restoreFocus: false });
  } catch (error) {
    console.error("Confirmation action failed:", error);
    confirmStatus.textContent = error.message || "This action could not be completed.";
    setConfirmWorking(false);
  }
}

function handleConfirmModalKeydown(event) {
  if (!confirmModalIsOpen()) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closePortalConfirm();
    return;
  }

  if (event.key !== "Tab") return;

  const focusableElements = focusableConfirmModalElements();
  if (focusableElements.length === 0) {
    event.preventDefault();
    confirmModalPanel.focus();
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

function updateCollectiveAttendeeStats(collectiveId, attendees) {
  const attendeeList = Array.isArray(attendees) ? attendees : [];
  const attendeeTotal = attendeeList.length;
  const peopleTotal = attendeeList.reduce((total, attendee) => {
    const adultCount = Number(attendee?.adult_count || 0);
    const childCount = Number(attendee?.child_count || 0);
    return total + (Number.isFinite(adultCount) ? adultCount : 0) + (Number.isFinite(childCount) ? childCount : 0);
  }, 0);

  [myCollectivesCache, adminCollectives].forEach((collection) => {
    collection.forEach((collective) => {
      if (String(collective.id) === String(collectiveId)) {
        collective.attendee_count = attendeeTotal;
        collective.registered_people = peopleTotal;
        collective.remaining_spaces = Math.max(Number(collective.max_size || 0) - peopleTotal, 0);
        collective.is_full = peopleTotal >= Number(collective.max_size || 0);
      }
    });
  });
  if (activeAttendeeCollective && String(activeAttendeeCollective.id) === String(collectiveId)) {
    activeAttendeeCollective.attendee_count = attendeeTotal;
    activeAttendeeCollective.registered_people = peopleTotal;
    activeAttendeeCollective.remaining_spaces = Math.max(Number(activeAttendeeCollective.max_size || 0) - peopleTotal, 0);
    activeAttendeeCollective.is_full = peopleTotal >= Number(activeAttendeeCollective.max_size || 0);
  }
}

function refreshCollectiveCards() {
  renderMyCommunities(myCommunitiesCache, myCollectivesCache);
  if (!collectivesTab.hidden) {
    renderAdminCollectives();
  }
}

async function openAttendeesModal(collective, trigger = null) {
  activeAttendeeCollective = collective;
  activeAttendees = [];
  attendeesModalReturnFocus = trigger || document.activeElement;
  attendeesTitle.textContent = `Attendees (${attendeeCount(collective)})`;
  attendeesList.innerHTML = "";
  setAttendeesStatus("Loading attendees...", "info");
  attendeesModal.hidden = false;
  attendeesModalPanel.focus();

  try {
    activeAttendees = await getCollectiveAttendees(collective.id);
    updateCollectiveAttendeeStats(collective.id, activeAttendees);
    renderAttendees();
    setAttendeesStatus(activeAttendees.length === 0 ? "No attendees are signed up yet." : "", "info");
    refreshCollectiveCards();
  } catch (error) {
    console.error("Collective attendees failed to load:", error);
    setAttendeesStatus("Attendees could not be loaded. Please refresh and try again.", "error");
  }
}

function closeAttendeesModal() {
  attendeesModal.hidden = true;
  activeAttendeeCollective = null;
  activeAttendees = [];
  attendeesList.innerHTML = "";
  setAttendeesStatus("");
  if (attendeesModalReturnFocus && document.contains(attendeesModalReturnFocus)) {
    attendeesModalReturnFocus.focus();
  } else if (currentTabName === "collectives" && !collectivesTab.hidden) {
    collectivesTab.focus();
  } else {
    myTab.focus();
  }
  attendeesModalReturnFocus = null;
}

function attendeeFullName(attendee) {
  return `${fieldValue(attendee.first_name)} ${fieldValue(attendee.last_name)}`.trim();
}

function renderAttendees() {
  attendeesList.innerHTML = "";
  attendeesTitle.textContent = `Attendees (${activeAttendees.length})`;

  if (activeAttendees.length === 0) {
    attendeesList.append(createElement("p", "portal-empty-state", "No attendees are signed up yet."));
    return;
  }

  activeAttendees.forEach((attendee) => {
    attendeesList.append(renderAttendeeRow(attendee));
  });
}

function renderAttendeeRow(attendee) {
  const row = createElement("article", "portal-attendee-row");
  const details = createElement("div", "portal-attendee-details");
  details.append(
    createElement("h4", "", attendeeFullName(attendee)),
    createElement("p", "", `Phone: ${fieldValue(attendee.phone)}`),
    createElement("p", "", `Email: ${fieldValue(attendee.email)}`),
    createElement("p", "", `Adults: ${fieldValue(attendee.adult_count)} | Kids: ${fieldValue(attendee.child_count)}`),
    createElement("p", "", `Signed Up: ${formatDateTime(attendee.signed_up_at)}`)
  );

  const actions = createElement("div", "portal-attendee-actions");
  const copyButton = createElement("button", "portal-secondary-btn", "Copy Email");
  copyButton.type = "button";
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(String(attendee.email || ""));
      setAttendeesStatus("Email copied.", "success");
    } catch {
      setAttendeesStatus("Email could not be copied.", "error");
    }
  });
  const editButton = createElement("button", "portal-secondary-btn", "Edit");
  editButton.type = "button";
  editButton.addEventListener("click", () => renderAttendeeEditRow(attendee, row));
  const removeButton = createElement("button", "portal-secondary-btn portal-danger-btn", "Remove");
  removeButton.type = "button";
  removeButton.addEventListener("click", () => openRemoveAttendeeConfirm(attendee, removeButton));
  actions.append(copyButton, editButton, removeButton);
  row.append(details, actions);
  return row;
}

function countOptions(min, max, selectedValue) {
  const fragment = document.createDocumentFragment();
  for (let index = min; index <= max; index += 1) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = String(index);
    option.selected = Number(selectedValue) === index;
    fragment.append(option);
  }
  return fragment;
}

function renderAttendeeEditRow(attendee, row) {
  const form = createElement("form", "portal-attendee-edit-form");
  form.noValidate = true;
  const fields = [
    ["first_name", "First Name", "text", attendee.first_name],
    ["last_name", "Last Name", "text", attendee.last_name],
    ["phone", "Phone", "tel", attendee.phone],
    ["email", "Email", "email", attendee.email]
  ];

  fields.forEach(([name, label, type, value]) => {
    const group = createElement("label", "portal-attendee-edit-field");
    group.textContent = label;
    const input = document.createElement("input");
    input.name = name;
    input.type = type;
    input.value = value || "";
    input.required = true;
    group.append(input);
    form.append(group);
  });

  const adultGroup = createElement("label", "portal-attendee-edit-field");
  adultGroup.textContent = "Adults";
  const adultSelect = document.createElement("select");
  adultSelect.name = "adult_count";
  adultSelect.append(countOptions(1, 10, attendee.adult_count));
  adultGroup.append(adultSelect);

  const childGroup = createElement("label", "portal-attendee-edit-field");
  childGroup.textContent = "Kids";
  const childSelect = document.createElement("select");
  childSelect.name = "child_count";
  childSelect.append(countOptions(0, 10, attendee.child_count));
  childGroup.append(childSelect);
  form.append(adultGroup, childGroup);

  const actions = createElement("div", "portal-attendee-actions");
  const saveButton = createElement("button", "portal-secondary-btn", "✓");
  saveButton.type = "submit";
  saveButton.setAttribute("aria-label", "Save attendee changes");
  const cancelButton = createElement("button", "portal-secondary-btn", "X");
  cancelButton.type = "button";
  cancelButton.setAttribute("aria-label", "Cancel attendee edit");
  cancelButton.addEventListener("click", () => row.replaceWith(renderAttendeeRow(attendee)));
  actions.append(saveButton, cancelButton);
  form.append(actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const changes = {
      first_name: String(formData.get("first_name") || "").trim(),
      last_name: String(formData.get("last_name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      adult_count: Number(formData.get("adult_count")),
      child_count: Number(formData.get("child_count"))
    };

    saveButton.disabled = true;
    cancelButton.disabled = true;
    setAttendeesStatus("Saving attendee...", "info");
    try {
      const updated = await updateCollectiveAttendee(attendee.id, changes);
      activeAttendees = activeAttendees.map((item) => item.id === updated.id ? updated : item);
      if (activeAttendeeCollective) {
        updateCollectiveAttendeeStats(activeAttendeeCollective.id, activeAttendees);
        refreshCollectiveCards();
      }
      renderAttendees();
      setAttendeesStatus("Attendee saved.", "success");
    } catch (error) {
      console.error("Attendee update failed:", error);
      setAttendeesStatus(error.message || "Attendee could not be saved.", "error");
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  row.replaceChildren(form);
  form.querySelector("input")?.focus();
}

function openRemoveAttendeeConfirm(attendee, trigger) {
  const fullName = attendeeFullName(attendee);
  openPortalConfirm({
    title: "Remove Attendee?",
    message: `Are you sure you want to remove "${fullName}" from your Collective?`,
    confirmLabel: "Remove Attendee",
    workingLabel: "Removing...",
    returnFocus: trigger,
    onConfirm: () => removeAttendee(attendee)
  });
}

async function removeAttendee(attendee) {
  await removeCollectiveAttendee(attendee.id);
  activeAttendees = activeAttendees.filter((item) => item.id !== attendee.id);
  if (activeAttendeeCollective) {
    updateCollectiveAttendeeStats(activeAttendeeCollective.id, activeAttendees);
    refreshCollectiveCards();
  }
  renderAttendees();
  setAttendeesStatus("Attendee removed.", "success");
}

function exportActiveAttendees() {
  if (!activeAttendeeCollective) return;
  const hostName = hostFullName(activeAttendeeCollective.primary_host_first_name, activeAttendeeCollective.primary_host_last_name)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "") || "Host";
  saveCsv(attendeeListCsv(activeAttendees), `${hostName}-Collective-Fall-2026-Attendees.csv`);
  setAttendeesStatus("Attendee CSV downloaded.", "success");
}

async function downloadContactList() {
  if (isDownloadingList) return;

  isDownloadingList = true;
  downloadListButton.disabled = true;
  downloadListButton.textContent = "Preparing...";
  setStatus("Preparing list...", "info");

  try {
    if (currentTabName === "collectives") {
      saveCsv(collectiveListCsv(filteredAdminCollectives()), downloadFilename("lifegate-collectives"));
    } else if (currentTabName === "admin") {
      saveCsv(contactListCsv(filteredAdminGroups()), downloadFilename("lifegate-community-groups"));
    } else {
      saveCsv(myDashboardCsv(), downloadFilename("lifegate-my-dashboard"));
    }
    setStatus("List downloaded.", "success");
  } catch (error) {
    console.error("Contact list download failed:", error);
    setStatus("We could not prepare the list. Please refresh and try again.", "error");
  } finally {
    isDownloadingList = false;
    downloadListButton.disabled = false;
    downloadListButton.textContent = "Download List";
  }
}

function showAdminDashboard(groups, collectives = []) {
  adminGroups = Array.isArray(groups) ? groups : [];
  adminCollectives = Array.isArray(collectives) ? collectives : [];
  portalRole.textContent = "Administrator";
  adminCount.textContent = String(adminGroups.length);
  adminMetric.hidden = false;
  adminTab.hidden = false;
  collectivesTab.hidden = false;
  sendMessageLink.hidden = false;
  downloadListButton.hidden = false;
  adminPanel.hidden = false;
  collectivesPanel.hidden = true;
  renderAdminCommunities();
  renderAdminCollectives();
}

function showContactPortal() {
  portalRole.textContent = "Community Host";
  adminMetric.hidden = true;
  adminTab.hidden = true;
  collectivesTab.hidden = true;
  sendMessageLink.hidden = true;
  downloadListButton.hidden = false;
  adminPanel.hidden = true;
  collectivesPanel.hidden = true;
}

function showAdminLoadFailure() {
  portalRole.textContent = "Community Host";
  adminMetric.hidden = true;
  adminTab.hidden = false;
  collectivesTab.hidden = true;
  sendMessageLink.hidden = true;
  downloadListButton.hidden = false;
  adminPanel.hidden = true;
  collectivesPanel.hidden = true;
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
  setStatus("Loading communities...", "info");

  const [profileResult, myCommunities, myCollectives, adminResult, adminCollectivesResult, collectivesSettingsResult] = await Promise.allSettled([
    getMyProfile(),
    getMyCommunities(),
    getMyCollectives(),
    getAdminGroups(),
    getAdminCollectives(),
    getCollectivesSettingsAdmin()
  ]);

  if (profileResult.status === "fulfilled" && profileResult.value) {
    renderProfile(profileResult.value, currentConfirmedEmail);
  } else {
    console.error("Profile failed to load:", profileResult.status === "rejected" ? profileResult.reason : "No profile returned");
    renderProfile(null, currentConfirmedEmail);
    setStatus("Your profile could not be loaded. Please refresh and try again.", "error");
  }

  if (myCommunities.status === "rejected" || myCollectives.status === "rejected") {
    console.error("My dashboard groups failed to load:", myCommunities.reason || myCollectives.reason);
    renderEmptyState(myList, "Your communities could not be loaded. Please refresh and try again.");
    setStatus("Dashboard data could not be loaded. Please refresh and try again.", "error");
    return;
  }

  renderMyCommunities(myCommunities.value, myCollectives.value);

  if (adminResult.status === "fulfilled") {
    showAdminDashboard(
      adminResult.value,
      adminCollectivesResult.status === "fulfilled" ? adminCollectivesResult.value : []
    );
    if (collectivesSettingsResult.status === "fulfilled") {
      renderCollectivesSettings(collectivesSettingsResult.value);
    }
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
attendeesCloseButton.addEventListener("click", closeAttendeesModal);
attendeesExportButton.addEventListener("click", exportActiveAttendees);
attendeesModal.addEventListener("click", (event) => {
  if (event.target === attendeesModal) {
    closeAttendeesModal();
  }
});
confirmCancelButton.addEventListener("click", () => closePortalConfirm());
confirmActionButton.addEventListener("click", confirmPortalAction);
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) {
    closePortalConfirm();
  }
});
document.addEventListener("keydown", handleConfirmModalKeydown);
document.addEventListener("keydown", handleAttendeesModalKeydown);

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
