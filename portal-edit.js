import {
  getAdminGroups,
  getCurrentSession,
  getMyCommunities,
  isExpectedNonAdminError,
  PORTAL_LOGIN_PAGE,
  redirectTo,
  supabase
} from './portal-auth.js';

const communityName = document.getElementById("portal-edit-community");
const statusMessage = document.getElementById("portal-edit-status");

let authSubscription;

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function selectedGroupId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function uniqueGroups(groups) {
  const seen = new Set();
  return groups.filter((group) => {
    if (!group?.id || seen.has(group.id)) return false;
    seen.add(group.id);
    return true;
  });
}

async function loadEditableCommunity() {
  setStatus("Checking your portal session...", "info");

  const session = await getCurrentSession();
  if (!session) {
    redirectTo(PORTAL_LOGIN_PAGE);
    return;
  }

  const groupId = selectedGroupId();
  if (!groupId) {
    communityName.textContent = "Community not found.";
    setStatus("Choose a community from the portal dashboard.", "error");
    return;
  }

  setStatus("Loading community...", "info");

  const [myCommunities, adminGroups] = await Promise.allSettled([
    getMyCommunities(),
    getAdminGroups()
  ]);

  if (myCommunities.status === "rejected") {
    throw myCommunities.reason;
  }

  const authorizedGroups = [...myCommunities.value];

  if (adminGroups.status === "fulfilled") {
    authorizedGroups.push(...adminGroups.value);
  } else if (!isExpectedNonAdminError(adminGroups.reason)) {
    console.error("Admin communities failed to load on edit placeholder:", adminGroups.reason);
  }

  const group = uniqueGroups(authorizedGroups).find((item) => item.id === groupId);
  if (!group) {
    communityName.textContent = "Community not found.";
    setStatus("This community is unavailable from your portal account.", "error");
    return;
  }

  communityName.textContent = group.title || "Untitled community";
  setStatus("Community loaded.", "success");
}

authSubscription = supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    redirectTo(PORTAL_LOGIN_PAGE);
  }
}).data.subscription;

window.addEventListener("pagehide", () => {
  authSubscription.unsubscribe();
});

loadEditableCommunity().catch((error) => {
  console.error("Edit placeholder failed to load:", error);
  communityName.textContent = "Community could not be loaded.";
  setStatus("Please return to the portal and try again.", "error");
});
