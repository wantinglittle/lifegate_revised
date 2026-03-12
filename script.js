// Firebase SDK imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAuYODcjC2wO4q5KrO4HqBzvFEmu3rWjWM",
  authDomain: "socialgroupsapp-a8fed.firebaseapp.com",
  projectId: "socialgroupsapp-a8fed",
  storageBucket: "socialgroupsapp-a8fed.appspot.com",
  messagingSenderId: "1071260804262",
  appId: "1:1071260804262:web:fa5925809d05135eef0067"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

  allGroups = await fetchGroupsWithCoords();
  renderGroups(allGroups, map, AdvancedMarkerElement);
  setupFilters(AdvancedMarkerElement);
}

async function fetchGroupsWithCoords() {
  const snapshot = await getDocs(collection(db, "groups"));
  const groups = [];

  for (const doc of snapshot.docs) {
    const group = doc.data();
    if (group.hidden !== "no") continue;
    if (!group.crossStreets || !group.zipCode) continue;

    const fullAddress = `${group.crossStreets}, ${group.zipCode}`;
    try {
      const coords = await geocodeAddress(fullAddress);
      groups.push({ ...group, coords, id: doc.id });
    } catch (err) {
      console.warn(`Geocode failed for ${fullAddress}:`, err);
    }
  }

  return groups;
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
      const hour = group.hour || "";
      const minute = (group.minute || "00").toString().padStart(2, "0");
      const ampm = group.ampm || "";
      const timeStr = hour && ampm ? `${hour}:${minute} ${ampm}` : "N/A";

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
      div.innerHTML = `
        <h3>${group.title || "No Title"}</h3>
        <p>${shortDesc}</p>
        <p><strong>Day:</strong> ${group.day || "N/A"}</p>
        <p><strong>Time:</strong> ${timeStr}</p>
        <p><strong>Audience:</strong> ${group.audience || "N/A"}</p>
        <p><strong>Age Group:</strong> ${group.ageGroup || "N/A"}</p>
        <p><strong>City:</strong> ${group.city || "N/A"}</p>
        <button class="more-info-btn" data-index="${index}">More Info</button>
        <button class="contact-btn" data-title="${group.title || ""}" data-email="${group.contactEmail || ""}">Contact</button>
        <button class="view-on-map-btn" data-id="${group.id}">View on Map</button>
      `;
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
  const hour = group.hour || "";
  const minute = (group.minute || "00").toString().padStart(2, "0");
  const ampm = group.ampm || "";
  const timeStr = hour && ampm ? `${hour}:${minute} ${ampm}` : "N/A";

  document.getElementById("info-title").textContent = group.title || "No Title";
  document.getElementById("info-description").textContent = group.description || "No description available.";
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
