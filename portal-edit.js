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
const MAX_SIZE_OPTIONS = Array.from({ length: 25 }, (_, index) => index + 1);
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
  primary_host_first_name: document.getElementById("edit-primary-host-first-name"),
  primary_host_last_name: document.getElementById("edit-primary-host-last-name"),
  primary_host_email: document.getElementById("edit-primary-host-email"),
  primary_host_phone: document.getElementById("edit-primary-host-phone"),
  secondary_host_first_name: document.getElementById("edit-secondary-host-first-name"),
  secondary_host_last_name: document.getElementById("edit-secondary-host-last-name"),
  secondary_host_email: document.getElementById("edit-secondary-host-email"),
  secondary_host_phone: document.getElementById("edit-secondary-host-phone"),
  remove_secondary_host: document.getElementById("edit-secondary-host-remove"),
  day: document.getElementById("edit-day"),
  meeting_time: document.getElementById("edit-meeting-time"),
  audience: document.getElementById("edit-audience"),
  childcare_option: document.getElementById("edit-childcare-option"),
  max_size: document.getElementById("edit-max-size"),
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
  primary_host_first_name: document.getElementById("edit-primary-host-first-name-error"),
  primary_host_last_name: document.getElementById("edit-primary-host-last-name-error"),
  primary_host_email: document.getElementById("edit-primary-host-email-error"),
  primary_host_phone: document.getElementById("edit-primary-host-phone-error"),
  secondary_host_first_name: document.getElementById("edit-secondary-host-first-name-error"),
  secondary_host_last_name: document.getElementById("edit-secondary-host-last-name-error"),
  secondary_host_email: document.getElementById("edit-secondary-host-email-error"),
  secondary_host_phone: document.getElementById("edit-secondary-host-phone-error"),
  remove_secondary_host: document.getElementById("edit-secondary-host-remove-error"),
  day: document.getElementById("edit-day-error"),
  meeting_time: document.getElementById("edit-meeting-time-error"),
  audience: document.getElementById("edit-audience-error"),
  childcare_option: document.getElementById("edit-childcare-option-error"),
  max_size: document.getElementById("edit-max-size-error"),
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

function isCollectiveRecord() {
  return recordType === "collective";
}

function setCollectiveHostControlsHidden(isHidden) {
  [
    "edit-primary-host-heading",
    "edit-primary-host-first-name-group",
    "edit-primary-host-last-name-group",
    "edit-primary-host-email-group",
    "edit-primary-host-phone-group",
    "edit-secondary-host-heading",
    "edit-secondary-host-first-name-group",
    "edit-secondary-host-last-name-group",
    "edit-secondary-host-email-group",
    "edit-secondary-host-phone-group",
    "edit-secondary-host-remove-group"
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.hidden = isHidden;
  });
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

function normalizeMaxSize(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 25 ? number : 12;
}

function setSelectOptions(select, values) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    select.append(option);
  });
}

function normalizeRecord(record) {
  if (isCollectiveRecord()) {
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
      max_size: normalizeMaxSize(record.max_size),
      primary_host_id: record.primary_host_id || null,
      primary_host_user_id: record.primary_host_user_id || null,
      primary_host_is_primary: record.primary_host_is_primary !== false,
      primary_host_first_name: normalizeText(record.primary_host_first_name),
      primary_host_last_name: normalizeText(record.primary_host_last_name),
      primary_host_email: normalizeText(record.primary_host_email),
      primary_host_phone: normalizeText(record.primary_host_phone),
      secondary_host_id: record.secondary_host_id || null,
      secondary_host_user_id: record.secondary_host_user_id || null,
      secondary_host_is_primary: false,
      secondary_host_first_name: normalizeText(record.secondary_host_first_name),
      secondary_host_last_name: normalizeText(record.secondary_host_last_name),
      secondary_host_email: normalizeText(record.secondary_host_email),
      secondary_host_phone: normalizeText(record.secondary_host_phone),
      my_host_id: record.my_host_id || null,
      my_host_is_primary: record.my_host_is_primary === true,
      my_host_first_name: normalizeText(record.my_host_first_name),
      my_host_last_name: normalizeText(record.my_host_last_name),
      my_host_email: normalizeText(record.my_host_email),
      my_host_phone: normalizeText(record.my_host_phone),
      approval_status: approvalStatus,
      listing_status: listingStatus,
      status: approvalStatus === "pending" ? "pending" : listingStatus,
      is_closed: record.is_closed === true,
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
  setSelectOptions(fields.audience, isCollectiveRecord() ? COLLECTIVE_AUDIENCES : COMMUNITY_AUDIENCES);
  setSelectOptions(fields.max_size, MAX_SIZE_OPTIONS);
  if (isCollectiveRecord()) {
    fields.title.value = "Collective Host";
    fields.description.value = "7-week Collective gathering";
    fields.contact_name.value = "Collective Host";
    fields.contact_email.value = "";
    fields.contact_phone.value = "";
    fields.primary_host_first_name.value = editMode === "admin" ? record.primary_host_first_name : record.my_host_first_name;
    fields.primary_host_last_name.value = editMode === "admin" ? record.primary_host_last_name : record.my_host_last_name;
    fields.primary_host_email.value = editMode === "admin" ? record.primary_host_email : record.my_host_email;
    fields.primary_host_phone.value = editMode === "admin" ? record.primary_host_phone : record.my_host_phone;
    fields.secondary_host_first_name.value = record.secondary_host_first_name;
    fields.secondary_host_last_name.value = record.secondary_host_last_name;
    fields.secondary_host_email.value = record.secondary_host_email;
    fields.secondary_host_phone.value = record.secondary_host_phone;
    fields.remove_secondary_host.checked = false;
    fields.remove_secondary_host.closest(".portal-check-row").hidden =
      editMode !== "admin" || !record.secondary_host_id;
    fields.primary_host_email.disabled = editMode !== "admin";
    fields.secondary_host_email.disabled = false;
    fields.day.value = "";
    fields.meeting_time.value = "";
    fields.audience.value = record.audience;
    fields.childcare_option.value = record.childcare_option;
    fields.max_size.value = String(record.max_size);
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
  fields.contact_email.disabled = false;
  fields.secondary_host_email.disabled = false;
  fields.remove_secondary_host.checked = false;
  setCollectiveHostControlsHidden(true);
  fields.day.value = record.day || "";
  fields.meeting_time.value = record.meeting_time || "";
  fields.audience.value = record.audience;
  fields.max_size.value = "";
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
  const isCollective = isCollectiveRecord();
  const isCollectiveAdmin = isCollective && editMode === "admin";

  const pageTitle = document.getElementById("portal-edit-title");
  const communityLegend = form.querySelector(".portal-edit-section legend");
  pageTitle.textContent = isCollective ? "Edit Collective" : "Edit Community";
  communityLegend.textContent = isCollective ? "Collective Information" : "Community Information";

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
  const maxSizeGroup = fields.max_size.closest(".form-group");
  const primaryHostHeading = document.getElementById("edit-primary-host-heading");
  const secondaryHostHeading = document.getElementById("edit-secondary-host-heading");
  const primaryHostGroups = [
    fields.primary_host_first_name.closest(".form-group"),
    fields.primary_host_last_name.closest(".form-group"),
    fields.primary_host_email.closest(".form-group"),
    fields.primary_host_phone.closest(".form-group")
  ];
  const secondaryNameGroups = [
    fields.secondary_host_first_name.closest(".form-group"),
    fields.secondary_host_last_name.closest(".form-group")
  ];
  const secondaryEmailGroup = fields.secondary_host_email.closest(".form-group");
  const secondaryPhoneGroup = fields.secondary_host_phone.closest(".form-group");
  const secondaryRemoveGroup = fields.remove_secondary_host.closest(".portal-check-row");
  isClosedRow.hidden = false;
  childcareOptionGroup.hidden = !isCollective;
  maxSizeGroup.hidden = !isCollective;
  const isClosedLabel = document.querySelector('label[for="edit-is-closed"]');
  const isClosedHelp = document.getElementById("edit-is-closed-help");
  isClosedLabel.textContent = isCollective ? "Collective is Closed" : "Group is Closed";
  isClosedHelp.textContent = isCollective
    ? "Check this when the Collective is not accepting attendee signups. Closed status does not hide the Collective."
    : "Check this when the group is not accepting new members. If the community is visible on the website, visitors will see that it is currently closed. Closed status does not hide the group.";
  const contactFieldset = fields.contact_name.closest("fieldset");
  const contactLegend = document.getElementById("portal-contact-legend");
  const coordinateFields = [
    fields.latitude.closest(".form-group"),
    fields.longitude.closest(".form-group"),
    document.getElementById("edit-coordinates-help")
  ];
  communityOnlyFields.forEach((element) => {
    if (element) element.hidden = isCollective;
  });
  coordinateFields.forEach((element) => {
    if (element) element.hidden = isCollective;
  });
  contactFieldset.hidden = false;
  contactLegend.textContent = isCollective
    ? editMode === "admin" ? "Host Information" : "My Host Information"
    : "Contact Information";
  fields.contact_name.closest(".form-group").hidden = isCollective;
  fields.contact_email.closest(".form-group").hidden = isCollective;
  fields.contact_phone.closest(".form-group").hidden = isCollective;
  primaryHostHeading.hidden = !isCollectiveAdmin;
  primaryHostHeading.textContent = "Primary Host";
  primaryHostGroups.forEach((element) => {
    element.hidden = !isCollective;
  });
  secondaryHostHeading.hidden = !isCollectiveAdmin;
  secondaryNameGroups.forEach((element) => {
    element.hidden = !isCollectiveAdmin;
  });
  secondaryEmailGroup.hidden = !isCollectiveAdmin;
  secondaryPhoneGroup.hidden = !isCollectiveAdmin;
  secondaryRemoveGroup.hidden = true;
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

function readRequiredIntegerSelect(fieldName, allowedValues, label, errors) {
  const value = Number(fields[fieldName].value);
  if (!Number.isInteger(value) || !allowedValues.includes(value)) {
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
      max_size: readRequiredIntegerSelect("max_size", MAX_SIZE_OPTIONS, "Max Size", errors),
      status: readRequiredSelect("status", ADMIN_STATUSES, "Status", errors),
      is_closed: fields.is_closed.checked
    };

    if (!/^[0-9]{5}$/.test(values.zip_code)) {
      errors.zip_code = "ZIP code must be exactly 5 digits.";
    }

    if (editMode === "admin") {
      values.primary_host_first_name = readRequiredText("primary_host_first_name", "Primary host first name", 80, errors);
      values.primary_host_last_name = readRequiredText("primary_host_last_name", "Primary host last name", 80, errors);
      values.primary_host_email = normalizeText(fields.primary_host_email.value).toLowerCase();
      values.primary_host_phone = readRequiredText("primary_host_phone", "Primary host phone", 40, errors);
      values.secondary_host_first_name = normalizeText(fields.secondary_host_first_name.value);
      values.secondary_host_last_name = normalizeText(fields.secondary_host_last_name.value);
      values.secondary_host_email = normalizeText(fields.secondary_host_email.value).toLowerCase();
      values.secondary_host_phone = normalizeText(fields.secondary_host_phone.value);
      values.remove_secondary_host = fields.remove_secondary_host.checked;
      if (!values.primary_host_email) {
        errors.primary_host_email = "Primary host email is required.";
      } else if (!EMAIL_PATTERN.test(values.primary_host_email)) {
        errors.primary_host_email = "Enter a valid primary host email.";
      }
      if (values.secondary_host_email && !EMAIL_PATTERN.test(values.secondary_host_email)) {
        errors.secondary_host_email = "Enter a valid second host email.";
      }
      const hasSecondaryHostValues = Boolean(
        values.secondary_host_first_name ||
        values.secondary_host_last_name ||
        values.secondary_host_phone
      );
      if (!values.remove_secondary_host && (hasSecondaryHostValues || originalRecord.secondary_host_id) && !values.secondary_host_email) {
        errors.secondary_host_email = "Enter a second host email before adding a second host phone.";
      }
      if (values.remove_secondary_host && !originalRecord.secondary_host_id) {
        errors.remove_secondary_host = "There is no second host to remove.";
      }
      if (originalRecord.approval_status === "approved" && values.status === "pending") {
        errors.status = "Approved collectives cannot be returned to Pending.";
      }
    } else {
      values.my_host_first_name = readRequiredText("primary_host_first_name", "First name", 80, errors);
      values.my_host_last_name = readRequiredText("primary_host_last_name", "Last name", 80, errors);
      values.my_host_phone = normalizeText(fields.primary_host_phone.value);
      values.my_host_email = originalRecord.my_host_email;
      fields.primary_host_email.value = originalRecord.my_host_email;
      if (!values.my_host_phone) {
        errors.primary_host_phone = "Phone is required.";
      } else if (values.my_host_phone.length > 40) {
        errors.primary_host_phone = "Phone must be 40 characters or fewer.";
      }
      if (originalRecord.approval_status === "pending" && values.status !== "pending") {
        errors.status = "Pending collectives cannot change status until approval.";
      } else if (originalRecord.approval_status === "approved" && values.status === "pending") {
        errors.status = "Hosts cannot set status to Pending.";
      }
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
      "max_size",
      "is_closed"
    ];

    commonFields.forEach((fieldName) => {
      if (!valuesAreEqual(values[fieldName], originalRecord[fieldName])) {
        patch[fieldName] = values[fieldName];
      }
    });

    if (editMode === "admin") {
      const primaryHostChanged = !valuesAreEqual(values.primary_host_first_name, originalRecord.primary_host_first_name) ||
        !valuesAreEqual(values.primary_host_last_name, originalRecord.primary_host_last_name) ||
        !valuesAreEqual(values.primary_host_email, originalRecord.primary_host_email) ||
        !valuesAreEqual(values.primary_host_phone, originalRecord.primary_host_phone);
      const secondaryHostChanged = !valuesAreEqual(values.secondary_host_first_name, originalRecord.secondary_host_first_name) ||
        !valuesAreEqual(values.secondary_host_last_name, originalRecord.secondary_host_last_name) ||
        !valuesAreEqual(values.secondary_host_email, originalRecord.secondary_host_email) ||
        !valuesAreEqual(values.secondary_host_phone, originalRecord.secondary_host_phone);

      if (primaryHostChanged) {
        patch.primary_host_first_name = values.primary_host_first_name;
        patch.primary_host_last_name = values.primary_host_last_name;
        patch.primary_host_email = values.primary_host_email;
        patch.primary_host_phone = values.primary_host_phone;
      }
      if (values.remove_secondary_host) {
        patch.remove_secondary_host = true;
      } else if (secondaryHostChanged) {
        patch.secondary_host_first_name = values.secondary_host_first_name || null;
        patch.secondary_host_last_name = values.secondary_host_last_name || null;
        patch.secondary_host_email = values.secondary_host_email;
        patch.secondary_host_phone = values.secondary_host_phone || null;
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
    if (editMode !== "admin") {
      const myHostChanged = !valuesAreEqual(values.my_host_first_name, originalRecord.my_host_first_name) ||
        !valuesAreEqual(values.my_host_last_name, originalRecord.my_host_last_name) ||
        !valuesAreEqual(values.my_host_phone, originalRecord.my_host_phone);
      if (myHostChanged) {
        patch.my_host_first_name = values.my_host_first_name;
        patch.my_host_last_name = values.my_host_last_name;
        patch.my_host_phone = values.my_host_phone;
      }
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
    const message = recordType === "collective" && error.message
      ? error.message
      : "Changes could not be saved. Please review the form and try again.";
    setStatus(message, "error");
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
