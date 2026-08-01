import {
  getAdminCollectives,
  getAdminGroups,
  getCurrentSession,
  getMyCollectives,
  getMyCommunities,
  isExpectedNonAdminError,
  PORTAL_LOGIN_PAGE,
  redirectTo,
  supabase,
  updateAdminGroup,
  updateCollective,
  updateMyCommunity
} from './portal-auth.js';

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COMMUNITY_AUDIENCES = ["All", "Men", "Women"];
const COLLECTIVE_AUDIENCES = ["Everyone Welcome", "Men", "Women", "Couples"];
const CHILDCARE_OPTIONS = [
  "Childcare Available | Sitter Provided",
  "Children Welcome | No Sitter Provided",
  "Childcare Not Provided"
];
const AGE_GROUPS = ["All-ages", "Kids", "Teens", "Adult"];
const ADMIN_STATUSES = ["pending", "active", "inactive"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const communityName = document.getElementById("portal-edit-community");
const statusMessage = document.getElementById("portal-edit-status");
const errorSummary = document.getElementById("portal-edit-error-summary");
const form = document.getElementById("portal-edit-form");
const saveButton = document.getElementById("portal-save-edit");
const resetButton = document.getElementById("portal-reset-edit");
const adminFields = document.getElementById("portal-admin-fields");

const fields = {
  title: document.getElementById("edit-title"),
  description: document.getElementById("edit-description"),
  contact_name: document.getElementById("edit-contact-name"),
  contact_email: document.getElementById("edit-contact-email"),
  contact_phone: document.getElementById("edit-contact-phone"),
  day: document.getElementById("edit-day"),
  meeting_time: document.getElementById("edit-meeting-time"),
  audience: document.getElementById("edit-audience"),
  childcare_option: document.getElementById("edit-childcare-option"),
  age_group: document.getElementById("edit-age-group"),
  city: document.getElementById("edit-city"),
  zip_code: document.getElementById("edit-zip-code"),
  cross_streets: document.getElementById("edit-cross-streets"),
  additional_info: document.getElementById("edit-additional-info"),
  status: document.getElementById("edit-status"),
  is_closed: document.getElementById("edit-is-closed"),
  latitude: document.getElementById("edit-latitude"),
  longitude: document.getElementById("edit-longitude"),
  owner_user_id: document.getElementById("edit-owner-user-id")
};

const errorFields = {
  title: document.getElementById("edit-title-error"),
  description: document.getElementById("edit-description-error"),
  contact_name: document.getElementById("edit-contact-name-error"),
  contact_email: document.getElementById("edit-contact-email-error"),
  contact_phone: document.getElementById("edit-contact-phone-error"),
  day: document.getElementById("edit-day-error"),
  meeting_time: document.getElementById("edit-meeting-time-error"),
  audience: document.getElementById("edit-audience-error"),
  childcare_option: document.getElementById("edit-childcare-option-error"),
  age_group: document.getElementById("edit-age-group-error"),
  city: document.getElementById("edit-city-error"),
  zip_code: document.getElementById("edit-zip-code-error"),
  cross_streets: document.getElementById("edit-cross-streets-error"),
  additional_info: document.getElementById("edit-additional-info-error"),
  status: document.getElementById("edit-status-error"),
  is_closed: document.getElementById("edit-is-closed-error"),
  latitude: document.getElementById("edit-latitude-error"),
  longitude: document.getElementById("edit-longitude-error"),
  owner_user_id: document.getElementById("edit-owner-user-id-error")
};

let authSubscription;
let originalRecord = null;
let editMode = "contact";
let recordType = "community";
let isSubmitting = false;

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function clearStatus() {
  statusMessage.textContent = "";
  delete statusMessage.dataset.tone;
}

function selectedGroupId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function selectedRecordType() {
  const params = new URLSearchParams(window.location.search);
  return params.get("type") === "collective" ? "collective" : "community";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNullableText(value) {
  const trimmed = normalizeText(value);
  return trimmed.length === 0 ? null : trimmed;
}

function toTimeInputValue(value) {
  if (!value) return "";
  const [hours, minutes] = String(value).split(":");
  if (!hours || !minutes) return "";
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function normalizeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCollectiveAudience(value) {
  return value === "All" ? "Everyone Welcome" : normalizeText(value) || "Everyone Welcome";
}

function normalizeChildcareOption(record) {
  const option = normalizeText(record.childcare_option);
  if (CHILDCARE_OPTIONS.includes(option)) return option;
  return "Childcare Not Provided";
}

function setSelectOptions(select, values) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function normalizeRecord(record) {
  if (recordType === "collective") {
    const approvalStatus = record.approval_status || "pending";
    const listingStatus = record.listing_status || "inactive";
    return {
      id: record.id,
      city: normalizeText(record.city),
      zip_code: normalizeText(record.zip_code),
      cross_streets: normalizeText(record.cross_streets),
      formatted_location: normalizeNullableText(record.formatted_location),
      audience: normalizeCollectiveAudience(record.audience),
      childcare_option: normalizeChildcareOption(record),
      primary_host_phone: normalizeText(record.primary_host_phone),
      approval_status: approvalStatus,
      listing_status: listingStatus,
      status: approvalStatus === "pending" ? "pending" : listingStatus,
      latitude: normalizeNumber(record.latitude),
      longitude: normalizeNumber(record.longitude)
    };
  }

  return {
    id: record.id,
    title: normalizeText(record.title),
    description: normalizeText(record.description),
    contact_name: normalizeText(record.contact_name),
    contact_email: normalizeText(record.contact_email),
    contact_phone: normalizeText(record.contact_phone),
    day: record.day || null,
    meeting_time: toTimeInputValue(record.meeting_time) || null,
    audience: record.audience || "All",
    age_group: record.age_group || "All-ages",
    city: normalizeText(record.city),
    zip_code: normalizeText(record.zip_code),
    cross_streets: normalizeText(record.cross_streets),
    additional_info: normalizeNullableText(record.additional_info),
    status: record.status || "pending",
    is_closed: record.is_closed === true,
    latitude: normalizeNumber(record.latitude),
    longitude: normalizeNumber(record.longitude),
    owner_user_id: record.owner_user_id || null
  };
}

function showPageError(title, message) {
  communityName.textContent = title;
  form.hidden = true;
  setStatus(message, "error");
}

function setError(fieldName, message) {
  const input = fields[fieldName];
  const error = errorFields[fieldName];
  if (!input || !error) return;

  error.textContent = message || "";
  input.toggleAttribute("aria-invalid", Boolean(message));
}

function clearErrors() {
  Object.keys(errorFields).forEach((fieldName) => setError(fieldName, ""));
  errorSummary.hidden = true;
  errorSummary.textContent = "";
}

function showErrorSummary(errors) {
  const messages = Object.values(errors);
  if (messages.length === 0) return;

  errorSummary.textContent = `Please fix ${messages.length} field ${messages.length === 1 ? "error" : "errors"} before saving.`;
  errorSummary.hidden = false;
  errorSummary.focus();
}

function populateForm(record) {
  const statusControl = document.getElementById("status-control");
  setSelectOptions(fields.audience, recordType === "collective" ? COLLECTIVE_AUDIENCES : COMMUNITY_AUDIENCES);
  if (recordType === "collective") {
    fields.title.value = "Collective Host";
    fields.description.value = "7-week Collective gathering";
    fields.contact_name.value = "Collective Host";
    fields.contact_email.value = "collectives@lifegatecommunity.com";
    fields.contact_phone.value = record.primary_host_phone;
    fields.day.value = "";
    fields.meeting_time.value = "";
    fields.audience.value = record.audience;
    fields.childcare_option.value = record.childcare_option;
    fields.age_group.value = "Adult";
    fields.city.value = record.city;
    fields.zip_code.value = record.zip_code;
    fields.cross_streets.value = record.cross_streets;
    fields.additional_info.value = record.formatted_location || "";
    fields.status.value = ADMIN_STATUSES.includes(record.status) ? record.status : "pending";
    fields.status.disabled = editMode !== "admin" && record.approval_status === "pending";
    if (statusControl) {
      statusControl.hidden = editMode !== "admin" && record.approval_status === "pending";
    }
    fields.status.querySelector('option[value="pending"]').disabled =
      record.approval_status === "approved";
    fields.latitude.value = record.latitude === null ? "" : String(record.latitude);
    fields.longitude.value = record.longitude === null ? "" : String(record.longitude);
    fields.owner_user_id.value = "";
    fields.contact_phone.value = record.primary_host_phone;
    return;
  }

  if (statusControl) {
    statusControl.hidden = false;
  }
  fields.title.value = record.title;
  fields.description.value = record.description;
  fields.contact_name.value = record.contact_name;
  fields.contact_email.value = record.contact_email;
  fields.contact_phone.value = record.contact_phone;
  fields.day.value = record.day || "";
  fields.meeting_time.value = record.meeting_time || "";
  fields.audience.value = record.audience;
  fields.age_group.value = record.age_group;
  fields.city.value = record.city;
  fields.zip_code.value = record.zip_code;
  fields.cross_streets.value = record.cross_streets;
  fields.additional_info.value = record.additional_info || "";
  fields.is_closed.checked = record.is_closed;
  fields.status.value = ADMIN_STATUSES.includes(record.status) ? record.status : "pending";
  fields.status.disabled = editMode !== "admin" && record.status === "pending";
  fields.status.querySelector('option[value="pending"]').disabled =
    editMode !== "admin" && record.status !== "pending";
  fields.latitude.value = record.latitude === null ? "" : String(record.latitude);
  fields.longitude.value = record.longitude === null ? "" : String(record.longitude);
  fields.owner_user_id.value = record.owner_user_id || "";
}

function configureMode(isAdmin) {
  editMode = isAdmin ? "admin" : "contact";
  adminFields.hidden = !isAdmin;

  const pageTitle = document.getElementById("portal-edit-title");
  const communityLegend = form.querySelector(".portal-edit-section legend");
  pageTitle.textContent = recordType === "collective" ? "Edit Collective" : "Edit Community";
  communityLegend.textContent = recordType === "collective" ? "Collective Information" : "Community Information";

  const communityOnlyFields = [
    fields.title.closest(".form-group"),
    fields.description.closest(".form-group"),
    fields.day.closest(".form-group"),
    fields.meeting_time.closest(".form-group"),
    fields.age_group.closest(".form-group"),
    fields.additional_info.closest(".form-group"),
    fields.owner_user_id.closest(".form-group")
  ];
  const isClosedRow = fields.is_closed.closest(".portal-check-row");
  const childcareOptionGroup = fields.childcare_option.closest(".form-group");
  isClosedRow.hidden = false;
  childcareOptionGroup.hidden = recordType !== "collective";
  const isClosedLabel = document.querySelector('label[for="edit-is-closed"]');
  const isClosedHelp = document.getElementById("edit-is-closed-help");
  isClosedLabel.textContent = recordType === "collective" ? "Collective is Closed" : "Group is Closed";
  isClosedHelp.textContent = recordType === "collective"
    ? "Check this when the Collective is not accepting attendee signups. Closed status does not hide the Collective."
    : "Check this when the group is not accepting new members. If the community is visible on the website, visitors will see that it is currently closed. Closed status does not hide the group.";
  const contactFieldset = fields.contact_name.closest("fieldset");
  const coordinateFields = [
    fields.latitude.closest(".form-group"),
    fields.longitude.closest(".form-group"),
    document.getElementById("edit-coordinates-help")
  ];
  communityOnlyFields.forEach((element) => {
    if (element) element.hidden = recordType === "collective";
  });
  coordinateFields.forEach((element) => {
    if (element) element.hidden = recordType === "collective";
  });
  contactFieldset.hidden = recordType === "collective" && editMode !== "admin";
  fields.contact_name.closest(".form-group").hidden = recordType === "collective";
  fields.contact_email.closest(".form-group").hidden = recordType === "collective";
  fields.contact_phone.closest(".form-group").hidden = recordType !== "collective" ? false : editMode !== "admin";
}

function readRequiredText(fieldName, label, maxLength, errors) {
  const value = normalizeText(fields[fieldName].value);
  if (!value) {
    errors[fieldName] = `${label} is required.`;
  } else if (maxLength && value.length > maxLength) {
    errors[fieldName] = `${label} must be ${maxLength} characters or fewer.`;
  }
  return value;
}

function readNullableSelect(fieldName, allowedValues, label, errors) {
  const value = fields[fieldName].value;
  if (!value) return null;
  if (!allowedValues.includes(value)) {
    errors[fieldName] = `${label} is not valid.`;
  }
  return value;
}

function readRequiredSelect(fieldName, allowedValues, label, errors) {
  const value = fields[fieldName].value;
  if (!allowedValues.includes(value)) {
    errors[fieldName] = `${label} is not valid.`;
  }
  return value;
}

function readNullableCoordinate(fieldName, min, max, label, errors) {
  const raw = normalizeText(fields[fieldName].value);
  if (!raw) return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    errors[fieldName] = `${label} must be between ${min} and ${max}.`;
  }
  return value;
}

function readFormValues() {
  const errors = {};

  if (recordType === "collective") {
    const values = {
      city: readRequiredText("city", "City", 120, errors),
      zip_code: readRequiredText("zip_code", "ZIP code", null, errors),
      cross_streets: readRequiredText("cross_streets", "Cross streets", null, errors),
      audience: readRequiredSelect("audience", COLLECTIVE_AUDIENCES, "Audience", errors),
      childcare_option: readRequiredSelect("childcare_option", CHILDCARE_OPTIONS, "Childcare", errors),
      status: readRequiredSelect("status", ADMIN_STATUSES, "Status", errors),
      is_closed: fields.is_closed.checked
    };

    if (!/^[0-9]{5}$/.test(values.zip_code)) {
      errors.zip_code = "ZIP code must be exactly 5 digits.";
    }

    if (editMode === "admin") {
      values.primary_host_phone = readRequiredText("contact_phone", "Primary host phone", null, errors);
      if (originalRecord.approval_status === "approved" && values.status === "pending") {
        errors.status = "Approved collectives cannot be returned to Pending.";
      }
    } else if (originalRecord.approval_status === "pending" && values.status !== "pending") {
      errors.status = "Pending collectives cannot change status until approval.";
    } else if (originalRecord.approval_status === "approved" && values.status === "pending") {
      errors.status = "Hosts cannot set status to Pending.";
    }

    return { values, errors };
  }

  const values = {
    title: readRequiredText("title", "Title", 120, errors),
    description: readRequiredText("description", "Description", null, errors),
    contact_name: readRequiredText("contact_name", "Contact name", null, errors),
    contact_email: normalizeText(fields.contact_email.value),
    contact_phone: readRequiredText("contact_phone", "Contact phone", null, errors),
    day: readNullableSelect("day", WEEKDAYS, "Day", errors),
    meeting_time: normalizeText(fields.meeting_time.value) || null,
    audience: readRequiredSelect("audience", COMMUNITY_AUDIENCES, "Audience", errors),
    age_group: readRequiredSelect("age_group", AGE_GROUPS, "Age group", errors),
    city: readRequiredText("city", "City", 120, errors),
    zip_code: readRequiredText("zip_code", "ZIP code", null, errors),
    cross_streets: readRequiredText("cross_streets", "Cross streets", null, errors),
    additional_info: normalizeNullableText(fields.additional_info.value),
    is_closed: fields.is_closed.checked
  };

  if (!values.contact_email) {
    errors.contact_email = "Contact email is required.";
  } else if (!EMAIL_PATTERN.test(values.contact_email)) {
    errors.contact_email = "Enter a valid contact email.";
  }

  if (values.meeting_time && !/^\d{2}:\d{2}$/.test(values.meeting_time)) {
    errors.meeting_time = "Enter a valid meeting time.";
  }

  values.status = readRequiredSelect("status", ADMIN_STATUSES, "Status", errors);

  if (editMode === "admin") {
    values.latitude = readNullableCoordinate("latitude", -90, 90, "Latitude", errors);
    values.longitude = readNullableCoordinate("longitude", -180, 180, "Longitude", errors);
    values.owner_user_id = normalizeNullableText(fields.owner_user_id.value);

    const latitudeBlank = normalizeText(fields.latitude.value).length === 0;
    const longitudeBlank = normalizeText(fields.longitude.value).length === 0;
    if (latitudeBlank !== longitudeBlank) {
      errors.latitude = errors.latitude || "Latitude and longitude must be supplied or cleared together.";
      errors.longitude = errors.longitude || "Latitude and longitude must be supplied or cleared together.";
    }

    if (values.owner_user_id && !UUID_PATTERN.test(values.owner_user_id)) {
      errors.owner_user_id = "Owner User ID must be a valid UUID.";
    }
  } else {
    if (originalRecord.status === "pending" && values.status !== "pending") {
      errors.status = "Pending communities cannot change status until approval.";
    } else if (originalRecord.status !== "pending" && values.status === "pending") {
      errors.status = "Contacts cannot set status to Pending.";
    }
  }

  return { values, errors };
}

function displayValidationErrors(errors) {
  clearErrors();
  Object.entries(errors).forEach(([fieldName, message]) => setError(fieldName, message));
  showErrorSummary(errors);
}

function valuesAreEqual(left, right) {
  return left === right || (left === null && right === null);
}

function buildPatch(values) {
  const patch = {};

  if (recordType === "collective") {
    const commonFields = [
      "city",
      "zip_code",
      "cross_streets",
      "audience",
      "childcare_option",
      "is_closed"
    ];

    commonFields.forEach((fieldName) => {
      if (!valuesAreEqual(values[fieldName], originalRecord[fieldName])) {
        patch[fieldName] = values[fieldName];
      }
    });

    if (editMode === "admin") {
      if (!valuesAreEqual(values.primary_host_phone, originalRecord.primary_host_phone)) {
        patch.primary_host_phone = values.primary_host_phone;
      }
      if (!valuesAreEqual(values.status, originalRecord.status)) {
        if (values.status === "pending") {
          patch.approval_status = "pending";
          patch.listing_status = "inactive";
        } else {
          patch.approval_status = "approved";
          patch.listing_status = values.status;
        }
      }
    } else if (originalRecord.approval_status === "approved" && !valuesAreEqual(values.status, originalRecord.status)) {
      patch.listing_status = values.status;
    }

    return patch;
  }

  const commonFields = [
    "title",
    "description",
    "contact_name",
    "contact_email",
    "contact_phone",
    "day",
    "meeting_time",
    "audience",
    "age_group",
    "city",
    "zip_code",
    "cross_streets",
    "additional_info",
    "is_closed"
  ];

  commonFields.forEach((fieldName) => {
    if (!valuesAreEqual(values[fieldName], originalRecord[fieldName])) {
      patch[fieldName] = values[fieldName];
    }
  });

  if (editMode === "admin") {
    if (!valuesAreEqual(values.status, originalRecord.status)) {
      patch.status = values.status;
    }

    const latitudeChanged = !valuesAreEqual(values.latitude, originalRecord.latitude);
    const longitudeChanged = !valuesAreEqual(values.longitude, originalRecord.longitude);
    if (latitudeChanged || longitudeChanged) {
      patch.latitude = values.latitude;
      patch.longitude = values.longitude;
    }

    if (!valuesAreEqual(values.owner_user_id, originalRecord.owner_user_id)) {
      patch.owner_user_id = values.owner_user_id;
    }
  } else if (originalRecord.status !== "pending" && !valuesAreEqual(values.status, originalRecord.status)) {
    patch.status = values.status;
  }

  return patch;
}

function hasUnsavedChanges() {
  if (!originalRecord || form.hidden || isSubmitting) return false;
  const { values, errors } = readFormValues();
  if (Object.keys(errors).length > 0) return true;
  return Object.keys(buildPatch(values)).length > 0;
}

function setSubmitting(isSaving) {
  isSubmitting = isSaving;
  saveButton.disabled = isSaving;
  resetButton.disabled = isSaving;
  saveButton.textContent = isSaving ? "Saving..." : "Save Changes";
}

function selectedGroupFrom(groups, groupId) {
  return groups.find((group) => group.id === groupId) || null;
}

async function loadEditableCommunity() {
  setStatus("Checking your portal session...", "info");

  const session = await getCurrentSession();
  if (!session) {
    redirectTo(PORTAL_LOGIN_PAGE);
    return;
  }

  const groupId = selectedGroupId();
  recordType = selectedRecordType();
  if (!groupId) {
    showPageError(`${recordType === "collective" ? "Collective" : "Community"} not found.`, "Choose an item from the portal dashboard.");
    return;
  }

  setStatus(`Loading ${recordType}...`, "info");

  const [myCommunitiesResult, adminGroupsResult] = recordType === "collective"
    ? await Promise.allSettled([getMyCollectives(), getAdminCollectives()])
    : await Promise.allSettled([getMyCommunities(), getAdminGroups()]);

  if (myCommunitiesResult.status === "rejected") {
    throw myCommunitiesResult.reason;
  }

  const myGroup = selectedGroupFrom(myCommunitiesResult.value, groupId);
  let adminGroup = null;
  let adminLoadFailed = false;

  if (adminGroupsResult.status === "fulfilled") {
    adminGroup = selectedGroupFrom(adminGroupsResult.value, groupId);
  } else if (!isExpectedNonAdminError(adminGroupsResult.reason)) {
    adminLoadFailed = true;
    console.error("Admin communities failed to load on edit page:", adminGroupsResult.reason);
  }

  const selectedGroup = adminGroup || myGroup;
  if (!selectedGroup) {
    const message = adminLoadFailed
      ? "Access could not be confirmed. Please refresh and try again."
      : `This ${recordType} is unavailable from your portal account.`;
    showPageError(`${recordType === "collective" ? "Collective" : "Community"} not found.`, message);
    return;
  }

  configureMode(Boolean(adminGroup));
  originalRecord = normalizeRecord(selectedGroup);
  populateForm(originalRecord);
  communityName.textContent = recordType === "collective" ? "Collective Host" : originalRecord.title || "Untitled community";
  form.hidden = false;
  clearErrors();
  clearStatus();
}

async function saveChanges() {
  if (isSubmitting || !originalRecord) return;

  const { values, errors } = readFormValues();
  if (Object.keys(errors).length > 0) {
    displayValidationErrors(errors);
    setStatus("Please fix the highlighted fields.", "error");
    return;
  }

  clearErrors();
  const patch = buildPatch(values);
  if (Object.keys(patch).length === 0) {
    setStatus("No changes to save.", "info");
    return;
  }

  setSubmitting(true);
  setStatus("Saving changes...", "info");

  try {
    const updatedRecord = recordType === "collective"
      ? await updateCollective(originalRecord.id, patch)
      : editMode === "admin"
        ? await updateAdminGroup(originalRecord.id, patch)
        : await updateMyCommunity(originalRecord.id, patch);

    if (!updatedRecord) {
      throw new Error("Update RPC did not return the updated community.");
    }

    originalRecord = normalizeRecord(updatedRecord);
    populateForm(originalRecord);
    communityName.textContent = recordType === "collective" ? "Collective Host" : originalRecord.title || "Untitled community";
    setStatus("Changes saved.", "success");
  } catch (error) {
    console.error("Community update failed:", error);
    setStatus("Changes could not be saved. Please review the form and try again.", "error");
  } finally {
    setSubmitting(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveChanges();
});

resetButton.addEventListener("click", () => {
  if (!originalRecord || isSubmitting) return;
  populateForm(originalRecord);
  clearErrors();
  setStatus("Changes reset.", "info");
});

window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedChanges()) return;

  event.preventDefault();
  event.returnValue = "";
});

authSubscription = supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    redirectTo(PORTAL_LOGIN_PAGE);
  }
}).data.subscription;

window.addEventListener("pagehide", () => {
  authSubscription.unsubscribe();
});

loadEditableCommunity().catch((error) => {
  console.error("Edit page failed to load:", error);
  showPageError("Community could not be loaded.", "Please return to the portal and try again.");
});
