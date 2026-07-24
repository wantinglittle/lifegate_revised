import {
  getAdminGroups,
  getCurrentSession,
  getMyCommunities,
  isExpectedNonAdminError,
  PORTAL_LOGIN_PAGE,
  redirectTo,
  signOutPortalUser,
  supabase
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

let authSubscription;
let adminGroups = [];
let currentAdminFilter = "all";

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function clearStatus() {
  statusMessage.textContent = "";
  delete statusMessage.dataset.tone;
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
  portalRole.textContent = "Community Leader";
  adminMetric.hidden = true;
  adminTab.hidden = true;
  adminPanel.hidden = true;
}

function showAdminLoadFailure() {
  portalRole.textContent = "Community Leader";
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

  userEmail.textContent = session.user?.email || "Signed-in dashboard user";
  setStatus("Loading communities...", "info");

  const [myCommunities, adminResult] = await Promise.allSettled([
    getMyCommunities(),
    getAdminGroups()
  ]);

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

authSubscription = supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    redirectTo(PORTAL_LOGIN_PAGE);
  }
}).data.subscription;

window.addEventListener("pagehide", () => {
  authSubscription.unsubscribe();
});

setupTabs();
setupAdminControls();
loadPortal();
