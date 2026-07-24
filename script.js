import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const SUPABASE_URL_PLACEHOLDER = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY_PLACEHOLDER = "YOUR_SUPABASE_ANON_KEY";
const PUBLIC_GROUPS_RPC = "get_public_groups";

let map;
let markers = [];
let allGroups = [];

const initialCenter = { lat: 39.7392, lng: -104.9903 };
const initialZoom = 9;
let geocoder;

export async function initMap() {
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

  geocoder = new google.maps.Geocoder();

  map = new google.maps.Map(document.getElementById("map"), {
    center: initialCenter,
    zoom: initialZoom,
    mapId: "8f453e71c329ac123f8540c9"
  });

  try {
    allGroups = await fetchGroupsWithCoords();
    renderGroups(allGroups, map, AdvancedMarkerElement);
    setupFilters(AdvancedMarkerElement);
  } catch (error) {
    console.error("Failed to load public groups:", error);
    showGroupsLoadError();
  }
}

async function fetchGroupsWithCoords() {
  const rpcGroups = await fetchPublicGroupsFromSupabase();
  const groups = [];

  for (const group of rpcGroups.map(mapSupabaseGroupToLegacyGroup)) {
    if (!group.crossStreets || !group.zipCode) continue;

    const fullAddress = `${group.crossStreets}, ${group.zipCode}`;
    try {
      // TODO: Replace temporary browser geocoding with privacy-safe stored
      // public intersection labels and coordinates after the read cutover.
      const coords = hasStoredCoords(group) ? group.coords : await geocodeAddress(fullAddress);
      groups.push({ ...group, coords, id: group.id });
    } catch (err) {
      console.warn(`Geocode failed for ${fullAddress}:`, err);
    }
  }

  return groups;
}

async function fetchPublicGroupsFromSupabase() {
  if (
    SUPABASE_URL === SUPABASE_URL_PLACEHOLDER ||
    SUPABASE_ANON_KEY === SUPABASE_ANON_KEY_PLACEHOLDER
  ) {
    throw new Error("Supabase public configuration is missing.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${PUBLIC_GROUPS_RPC}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Supabase RPC ${PUBLIC_GROUPS_RPC} failed with status ${response.status}.`);
  }

  const groups = await response.json();
  if (!Array.isArray(groups)) {
    throw new Error(`Supabase RPC ${PUBLIC_GROUPS_RPC} returned an unexpected response.`);
  }

  return groups;
}

function mapSupabaseGroupToLegacyGroup(group) {
  const timeParts = splitMeetingTime(group.meeting_time);
  const coords = getCoords(group);

  return {
    id: group.id,
    title: group.title,
    description: group.description,
    day: group.day,
    audience: group.audience,
    city: group.city,
    ageGroup: group.age_group,
    zipCode: group.zip_code,
    crossStreets: group.cross_streets,
    additionalInfo: group.additional_info,
    contactEmail: group.contact_email,
    isClosed: group.is_closed === true,
    hour: timeParts.hour,
    minute: timeParts.minute,
    ampm: timeParts.ampm,
    coords
  };
}

function splitMeetingTime(meetingTime) {
  if (!meetingTime) {
    return { hour: "", minute: "", ampm: "" };
  }

  const [hourText, minuteText] = meetingTime.split(":");
  const hour24 = Number(hourText);
  if (!Number.isInteger(hour24) || !minuteText) {
    return { hour: "", minute: "", ampm: "" };
  }

  const ampm = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return {
    hour: String(hour12),
    minute: minuteText.padStart(2, "0"),
    ampm
  };
}

function getCoords(group) {
  if (typeof group.latitude !== "number" || typeof group.longitude !== "number") {
    return null;
  }

  return {
    lat: group.latitude,
    lng: group.longitude
  };
}

function hasStoredCoords(group) {
  return group.coords &&
    typeof group.coords.lat === "number" &&
    typeof group.coords.lng === "number";
}

function formatGroupTime(group) {
  const hour = group.hour || "";
  const minute = (group.minute || "00").toString().padStart(2, "0");
  const ampm = group.ampm || "";
  return hour && ampm ? `${hour}:${minute} ${ampm}` : "N/A";
}

function availabilityLabel(group) {
  return group.isClosed === true ? "Currently Closed" : "Open to New Members";
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

function createDetail(label, value) {
  const paragraph = document.createElement("p");
  const strong = createElement("strong", "", `${label}:`);
  paragraph.append(strong, document.createTextNode(` ${value || "N/A"}`));
  return paragraph;
}

function createButton(className, text) {
  const button = createElement("button", className, text);
  button.type = "button";
  return button;
}

function showGroupsLoadError() {
  const container = document.getElementById("groups-container");
  if (container) {
    container.innerHTML = `
      <div class="group-card show">
        <h3>Communities could not be loaded</h3>
        <p>Please refresh the page or try again later.</p>
      </div>
    `;
  }

  const count = document.getElementById("group-count");
  if (count) {
    count.textContent = "0";
  }
}

async function renderGroups(groups, map, AdvancedMarkerElement) {
  // Clear old markers
  markers.forEach(marker => marker.map = null);
  markers = [];

  const container = document.getElementById("groups-container");
  const existingCards = container.querySelectorAll(".group-card");

  // Apply fade-out to all existing cards
  existingCards.forEach(card => {
    card.classList.remove("show");
    card.classList.add("fade-out");
  });

  // Wait for fade-out animation to complete before clearing
  setTimeout(() => {
    container.innerHTML = ""; // Clear all cards after animation

    // Force reflow to ensure new cards start with correct initial state
    container.offsetHeight; // Trigger reflow

    // Add new cards
    groups.forEach((group, index) => {
      const timeStr = formatGroupTime(group);
      const availability = availabilityLabel(group);

      const marker = new AdvancedMarkerElement({
        map,
        position: group.coords,
        title: group.title || "Group"
      });
      markers.push(marker);

      marker.addListener("click", () => {
        showGroupModal(group);
      });

      let shortDesc = "";
      if (group.description) {
        shortDesc = group.description.length > 40
          ? group.description.slice(0, 40) + "…"
          : group.description;
      }

      const div = document.createElement("div");
      div.className = "group-card";

      const titleRow = createElement("div", "group-card-heading");
      titleRow.append(
        createElement("h3", "", group.title || "No Title"),
        createElement("span", `availability-badge ${group.isClosed === true ? "availability-closed" : "availability-open"}`, availability)
      );

      const moreInfoButton = createButton("more-info-btn", "More Info");
      moreInfoButton.dataset.index = String(index);

      const contactButton = createButton("contact-btn", "Contact");
      contactButton.dataset.title = group.title || "";
      contactButton.dataset.email = group.contactEmail || "";

      const viewOnMapButton = createButton("view-on-map-btn", "View on Map");
      viewOnMapButton.dataset.id = group.id;

      div.append(
        titleRow,
        createElement("p", "", shortDesc),
        createDetail("Availability", availability),
        createDetail("Day", group.day),
        createDetail("Time", timeStr),
        createDetail("Audience", group.audience),
        createDetail("Age Group", group.ageGroup),
        createDetail("City", group.city),
        moreInfoButton,
        contactButton,
        viewOnMapButton
      );
      container.appendChild(div);

      // Trigger fade-in after a slightly longer delay
      setTimeout(() => div.classList.add("show"), 50);
    });

    // Update group count
    document.getElementById("group-count").textContent = groups.length;

    // Attach event listeners
    document.querySelectorAll(".more-info-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        const i = parseInt(e.target.dataset.index);
        showGroupModal(groups[i]);
      });
    });

    document.querySelectorAll(".contact-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const title = btn.dataset.title || "";
        const email = btn.dataset.email || "";
        document.getElementById("contact-modal").style.display = "block";
        document.getElementById("contact-form").setAttribute("data-group-title", title);
        document.getElementById("contact-form").setAttribute("data-group-email", email);
      });
    });

    document.querySelectorAll(".view-on-map-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        const groupId = e.target.dataset.id;
        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        const mapElement = document.getElementById("map");
        const offset = 20;
        const elementPosition = mapElement.getBoundingClientRect().top + window.pageYOffset;

        window.scrollTo({
          top: elementPosition - offset,
          behavior: 'smooth'
        });

        map.setCenter(group.coords);
        map.setZoom(14);
      });
    });
  }, 300); // Match CSS transition duration
}

function showGroupModal(group) {
  const timeStr = formatGroupTime(group);

  document.getElementById("info-title").textContent = group.title || "No Title";
  document.getElementById("info-description").textContent = group.description || "No description available.";
  document.getElementById("info-availability").textContent = availabilityLabel(group);
  document.getElementById("info-day").textContent = group.day || "N/A";
  document.getElementById("info-time").textContent = timeStr;
  document.getElementById("info-audience").textContent = group.audience || "N/A";
  document.getElementById("info-age-group").textContent = group.ageGroup || "N/A";
  document.getElementById("info-modal").style.display = "block";
}

function setupFilters(AdvancedMarkerElement) {
  const dayFilter = document.getElementById("day-filter");
  const audienceFilter = document.getElementById("audience-filter");
  const ageFilter = document.getElementById("age-filter");
  const zipInput = document.getElementById("location-search");
  const searchBtn = document.getElementById("search-location-btn");

  const applyFilters = () => {
    const dayVal = dayFilter.value.toLowerCase();
    const audienceVal = audienceFilter.value.toLowerCase();
    const ageVal = ageFilter.value.toLowerCase();

    const filtered = allGroups.filter(group => {
      const dayMatch = !dayVal || (group.day && group.day.toLowerCase().includes(dayVal));
      const audienceMatch = !audienceVal || (group.audience && group.audience.toLowerCase() === audienceVal);
      const ageMatch = !ageVal || (group.ageGroup && group.ageGroup.toLowerCase() === ageVal);
      return dayMatch && audienceMatch && ageMatch;
    });

    renderGroups(filtered, map, AdvancedMarkerElement);
  };

  searchBtn.addEventListener("click", async () => {
    const zip = zipInput.value.trim();
    if (!zip) return;

    try {
      const coords = await geocodeAddress(zip);
      map.setCenter(coords);
      map.setZoom(12);
    } catch (err) {
      alert("Could not locate that ZIP code.");
      console.error("ZIP search failed:", err);
    }
  });

  zipInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchBtn.click();
    }
  });

  document.getElementById("clear-filters").addEventListener("click", () => {
    dayFilter.value = "";
    audienceFilter.value = "";
    ageFilter.value = "";
    zipInput.value = "";

    map.setCenter(initialCenter);
    map.setZoom(initialZoom);

    applyFilters();
  });

  [dayFilter, audienceFilter, ageFilter].forEach(el => {
    el.addEventListener("change", applyFilters);
  });
}

function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        reject(`Geocode failed: ${status}`);
      }
    });
  });
}

// Modal logic
document.querySelector(".close-info").onclick = () => {
  document.getElementById("info-modal").style.display = "none";
};
document.querySelectorAll(".close-contact").forEach(el => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".modal").forEach(modal => {
      modal.style.display = "none";
    });
  });
});

window.onclick = (e) => {
  if (e.target.classList.contains("modal")) {
    e.target.style.display = "none";
  }
};

// Contact form submission
document.getElementById("contact-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const name = document.getElementById("contact-name").value.trim();
  const email = document.getElementById("contact-email").value.trim();
  const phone = document.getElementById("contact-phone").value.trim();
  const message = document.getElementById("contact-message").value.trim();
  const groupTitle = this.getAttribute("data-group-title");
  const groupEmail = this.getAttribute("data-group-email");

  if (!name || !email || !message) {
    alert("Please fill out all required fields.");
    return;
  }
  try {
    await emailjs.send("service_fmkha6h", "template_9hiiteh", {
      name,
      email,
      phone,
      message,
      group_title: groupTitle,
      to_email: groupEmail
    });

    document.getElementById("contact-modal").style.display = "none";
    document.getElementById("groupmsg-confirmation-modal").style.display = "block";
    this.reset();
  } catch (error) {
    console.error("EmailJS error:", error);
    alert("There was an error sending your message. Please try again later.");
  }

  document.querySelector(".close-groupmsg-confirmation").addEventListener("click", function () {
    document.getElementById("groupmsg-confirmation-modal").style.display = "none";
  });
});

// Format phone number for contact modal
const phoneInput = document.getElementById("contact-phone");
phoneInput.addEventListener("input", (e) => {
  let digits = e.target.value.replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(0, 10);

  let formatted = digits;
  if (digits.length > 6) {
    formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length > 3) {
    formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  } else if (digits.length > 0) {
    formatted = `(${digits}`;
  }

  e.target.value = formatted;
});

document.getElementById("open-church-modal").addEventListener("click", () => {
  document.getElementById("contact-church").style.display = "block";
});


// Contact the church via EmailJS
document.getElementById("contact-church-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const name = this.querySelector("#contact-church-name").value.trim();
  const email = this.querySelector("#contact-church-email").value.trim();
  const phone = this.querySelector("#contact-church-phone").value.trim();
  const message = this.querySelector("#contact-church-message").value.trim();

  if (!name || !email || !message) {
    alert("Please fill out all required fields.");
    return;
  }

  try {
    await emailjs.send("service_fmkha6h", "template_9hiiteh", {
      name,
      email,
      phone,
      message,
      group_title: "Message to Church",
      to_email: "lifegatecommunitywebsite@gmail.com" // Replace with your actual email
    });

    document.getElementById("contact-church").style.display = "none";
    document.getElementById("groupmsg-confirmation-modal").style.display = "block";
    this.reset();
  } catch (error) {
    console.error("EmailJS error:", error);
    alert("There was an error sending your message. Please try again later.");
  }

  document.querySelector(".close-groupmsg-confirmation").addEventListener("click", function () {
    document.getElementById("groupmsg-confirmation-modal").style.display = "none";
  });
});
