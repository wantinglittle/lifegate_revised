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

function setResponsiveFilterDefaults() {
  const dayFilter = document.getElementById("day-filter");
  const audienceFilter = document.getElementById("audience-filter");
  const ageFilter = document.getElementById("age-filter");
  if (!dayFilter || !audienceFilter || !ageFilter) return;

  dayFilter.value = "";
  audienceFilter.value = "";
  ageFilter.value = "";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setResponsiveFilterDefaults);
} else {
  setResponsiveFilterDefaults();
}

export async function initMap() {
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

  geocoder = new google.maps.Geocoder();

  map = new google.maps.Map(document.getElementById("map"), {
    center: initialCenter,
    zoom: initialZoom,
    mapId: "8f453e71c329ac123f8540c9",
    mapTypeControl: false,
    mapTypeId: "roadmap"
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

function createMetaItem(label, value) {
  const item = createElement("div", "group-card-meta-item");
  item.setAttribute("aria-label", `${label}: ${value || "N/A"}`);
  item.append(
    createIcon(iconNameForDetail(label)),
    createElement("span", "group-card-meta-label", label),
    createElement("strong", "group-card-meta-value", value || "N/A")
  );
  return item;
}

function createButton(className, text) {
  const button = createElement("button", className);
  button.type = "button";
  button.append(createIcon(iconNameForAction(text)), createElement("span", "", text));
  return button;
}

function iconNameForDetail(label) {
  const names = {
    Day: "calendar",
    Time: "clock",
    Who: "people",
    Ages: "person"
  };
  return names[label] || "info";
}

function iconNameForAction(label) {
  const names = {
    "More Info": "info",
    Contact: "mail",
    Map: "map"
  };
  return names[label] || "info";
}

function createIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `card-icon card-icon-${name}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "2");

  const paths = {
    location: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    calendar: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2",
    people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    person: "M20 21a8 8 0 1 0-16 0 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 16v-4 M12 8h.01",
    mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M22 6l-10 7L2 6",
    map: "M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z M9 3v15 M15 6v15"
  };

  path.setAttribute("d", paths[name] || paths.info);
  svg.append(path);
  return svg;
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

      const topRow = createElement("div", "group-card-top");
      const location = createElement("p", "group-card-city");
      const cityName = createElement("span", "group-card-city-name", group.city || "N/A");
      location.append(
        createIcon("location"),
        cityName
      );
      const availabilityTab = createElement(
        "span",
        `availability-badge ${group.isClosed === true ? "availability-closed" : "availability-open"}`,
        availability
      );
      topRow.append(location, availabilityTab);

      const fullTitle = group.title || "No Title";
      const title = createElement("h3", "group-card-title", fullTitle);
      title.title = fullTitle;
      title.setAttribute("aria-label", fullTitle);

      const moreInfoButton = createButton("more-info-btn", "More Info");
      moreInfoButton.dataset.index = String(index);

      const contactButton = createButton("contact-btn", "Contact");
      contactButton.dataset.title = group.title || "";
      contactButton.dataset.email = group.contactEmail || "";

      const viewOnMapButton = createButton("view-on-map-btn", "Map");
      viewOnMapButton.dataset.id = group.id;

      const description = createElement(
        "p",
        "group-card-description",
        group.description || "No description available."
      );

      const details = createElement("div", "group-card-meta");
      details.append(
        createMetaItem("Day", group.day),
        createMetaItem("Time", timeStr),
        createMetaItem("Who", group.audience),
        createMetaItem("Ages", group.ageGroup)
      );

      const actions = createElement("div", "group-card-actions");
      actions.append(moreInfoButton, contactButton, viewOnMapButton);

      div.append(
        topRow,
        title,
        description,
        details,
        actions
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
        const i = parseInt(e.currentTarget.dataset.index, 10);
        if (Number.isNaN(i) || !groups[i]) return;
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
        const groupId = e.currentTarget.dataset.id;
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

  const filterValue = (select) => select.value.toLowerCase();

  setResponsiveFilterDefaults();

  const applyFilters = () => {
    const dayVal = filterValue(dayFilter);
    const audienceVal = filterValue(audienceFilter);
    const ageVal = filterValue(ageFilter);

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
    setResponsiveFilterDefaults();
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
