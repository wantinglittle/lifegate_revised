import { getCurrentSession } from './portal-auth.js';

const dashboardLinks = document.querySelectorAll("[data-dashboard-link]");

async function updateDashboardLinks() {
  if (dashboardLinks.length === 0) return;

  try {
    const session = await getCurrentSession();
    dashboardLinks.forEach((link) => {
      if (session) {
        link.textContent = "My Dashboard";
        link.href = "portal.html";
      } else {
        link.textContent = "Log In";
        link.href = "portal-login.html";
      }
    });
  } catch (error) {
    console.error("Dashboard link session check failed:", error);
  }
}

updateDashboardLinks();
