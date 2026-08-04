import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const PUBLIC_STATE_RPC = "get_collectives_public_state";

let publicStatePromise;

function rpcUrl(name) {
  return `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/${name}`;
}

export async function getCollectivesPublicState() {
  if (!publicStatePromise) {
    publicStatePromise = fetch(rpcUrl(PUBLIC_STATE_RPC), {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    })
      .then((response) => {
        if (!response.ok) throw new Error(`${PUBLIC_STATE_RPC} failed with status ${response.status}`);
        return response.json();
      })
      .then((data) => Array.isArray(data) ? data[0] || null : null);
  }

  return publicStatePromise;
}

export async function initPublicCollectivesHeader() {
  const headers = document.querySelectorAll(".public-switch-header");
  const switchers = document.querySelectorAll(".public-page-switcher");
  const collectivesLinks = document.querySelectorAll("[data-collectives-seasonal-link]");
  const hostActions = document.querySelectorAll("[data-collectives-seasonal-host]");
  if (collectivesLinks.length === 0 && hostActions.length === 0) return;

  function setCollectivesVisible(isVisible) {
    headers.forEach((header) => {
      header.classList.remove("is-collectives-loading");
    });
    switchers.forEach((switcher) => {
      switcher.classList.toggle("is-collectives-hidden", !isVisible);
    });
    collectivesLinks.forEach((link) => {
      link.hidden = !isVisible;
    });
    hostActions.forEach((action) => {
      action.hidden = !isVisible;
    });
  }

  try {
    const state = await getCollectivesPublicState();
    setCollectivesVisible(state?.enabled === true);
  } catch (error) {
    setCollectivesVisible(false);
    console.warn("Collectives seasonal visibility could not be loaded.", error);
  }
}
