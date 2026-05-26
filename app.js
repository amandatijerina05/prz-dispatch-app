const STORAGE_KEY = "prz-dispatch-app-v2";

const permissions = {
  admin: ["dispatch", "drivers", "invoicing", "customers", "operations", "maintenance", "reports", "notifications", "admin"],
  dispatcher: ["dispatch", "drivers", "customers", "operations", "notifications"],
  driver: ["drivers", "notifications"],
  invoicing: ["invoicing", "customers", "notifications"],
  maintenance: ["maintenance"],
};

const viewTitles = {
  dispatch: "Dispatch",
  drivers: "Driver Mobile",
  invoicing: "Invoicing",
  customers: "Customers",
  operations: "Calendar & Map",
  maintenance: "Maintenance",
  reports: "Reports",
  notifications: "Notifications",
  admin: "Admin Dashboard",
};

const defaultState = {
  role: "admin",
  nextTicket: 1048,
  users: [
    { id: "usr-1", name: "PRZ Admin", username: "admin", role: "admin", password: "ChangeMe123!" },
    { id: "usr-2", name: "Dispatch Desk", username: "dispatch", role: "dispatcher", password: "Dispatch123!" },
    { id: "usr-3", name: "Billing Desk", username: "billing", role: "invoicing", password: "Billing123!" },
  ],
  drivers: [
    { id: "drv-1", name: "Ramon Alvarez", phone: "432-555-0198" },
    { id: "drv-2", name: "Caleb Stone", phone: "432-555-0144" },
    { id: "drv-3", name: "Mia Torres", phone: "432-555-0137" },
  ],
  equipment: [
    { id: "eq-1", name: "110 Ton Crane", type: "Crane", status: "Available", cert: "2026-11-12", nextService: "2026-06-10" },
    { id: "eq-2", name: "Peterbilt Winch Truck", type: "Truck", status: "Available", cert: "2026-09-30", nextService: "2026-06-02" },
    { id: "eq-3", name: "Lowboy Trailer", type: "Trailer", status: "Assigned", cert: "2026-12-15", nextService: "2026-07-01" },
  ],
  customers: [
    {
      id: "cus-1",
      name: "Black Mesa Services",
      contact: "Jared | 432-555-0108",
      terms: "Net 30",
      site: "County Road 118 lease pad",
      instructions: "Call before entering gate. H2S briefing required.",
    },
    {
      id: "cus-2",
      name: "Red Rock Energy",
      contact: "Elena | 432-555-0161",
      terms: "Net 15",
      site: "South yard",
      instructions: "PO required on every ticket.",
    },
  ],
  maintenance: [],
  notifications: [],
  tickets: [],
};

let state = loadState();
let invoiceFilter = "ready";
let signatureDrawing = false;
let deferredInstallPrompt = null;
let supabaseClient = null;
let supabaseSession = null;
let supabaseProfile = null;

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const closedStatuses = ["Completed", "Invoiced", "Canceled"];

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultState);
  try {
    return normalizeState({ ...structuredClone(defaultState), ...JSON.parse(saved) });
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(data) {
  data.customers ||= structuredClone(defaultState.customers);
  data.users ||= structuredClone(defaultState.users);
  data.maintenance ||= [];
  data.notifications ||= [];
  data.role ||= "admin";
  data.equipment = (data.equipment || []).map((item) => ({
    status: "Available",
    cert: "2026-12-31",
    nextService: "2026-06-30",
    ...item,
  }));
  data.tickets = (data.tickets || []).map((ticket) => ({
    attachments: [],
    driverAttachments: [],
    driverNotes: "",
    customerSignature: "",
    signerName: "",
    actualStart: "",
    actualEnd: "",
    completedAt: "",
    invoicedAt: "",
    mileage: 0,
    fuel: 0,
    minimum: 0,
    overtimeHours: 0,
    ...ticket,
  }));
  return data;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function mapCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    terms: row.billing_terms,
    site: row.default_site,
    instructions: row.instructions,
  };
}

function mapEquipment(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    cert: row.certification_due,
    nextService: row.next_service_due,
  };
}

function mapMaintenance(row) {
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    task: row.task,
    due: row.due_date,
    status: row.status,
  };
}

async function loadSupabaseReferenceData() {
  if (!supabaseClient || !supabaseSession) return;
  const [customersResult, driversResult, equipmentResult, maintenanceResult] = await Promise.all([
    supabaseClient.from("customers").select("*").eq("active", true).order("name"),
    supabaseClient.from("drivers").select("*").eq("active", true).order("name"),
    supabaseClient.from("equipment").select("*").order("name"),
    supabaseClient.from("maintenance_records").select("*").order("due_date"),
  ]);

  const firstError = [customersResult, driversResult, equipmentResult, maintenanceResult].find((result) => result.error)?.error;
  if (firstError) {
    alert(`Supabase data load failed: ${firstError.message}`);
    return;
  }

  state.customers = customersResult.data.map(mapCustomer);
  state.drivers = driversResult.data;
  state.equipment = equipmentResult.data.map(mapEquipment);
  state.maintenance = maintenanceResult.data.map(mapMaintenance);
  saveState();
  renderAll();
}

function setSupabaseStatus(message, connected = false) {
  const status = document.querySelector("#supabaseStatus");
  status.textContent = message;
  status.classList.toggle("connected", connected);
  document.body.classList.toggle("supabase-connected", connected);
  document.querySelector("#authForm").hidden = connected;
  document.querySelector("#signOutButton").hidden = !connected;
}

function roleLabel(role) {
  return {
    admin: "Admin",
    dispatcher: "Dispatcher",
    driver: "Driver",
    invoicing: "Invoicing",
    maintenance: "Maintenance",
  }[role] || role;
}

async function applySupabaseSession(session) {
  supabaseSession = session;
  supabaseProfile = null;

  if (!session?.user?.email) {
    setSupabaseStatus("Ready for login");
    renderAll();
    return;
  }

  const { data, error } = await supabaseClient
    .from("app_users")
    .select("full_name, role")
    .eq("auth_user_id", session.user.id)
    .eq("active", true)
    .single();

  if (error || !data) {
    setSupabaseStatus(`${session.user.email} needs role setup`, true);
    return;
  }

  supabaseProfile = data;
  state.role = data.role;
  setSupabaseStatus(`${data.full_name} (${roleLabel(data.role)})`, true);
  await loadSupabaseReferenceData();
  renderAll();
}

async function initSupabase() {
  if (!window.supabase || !window.PRZ_SUPABASE) {
    setSupabaseStatus("Local demo mode");
    return;
  }

  supabaseClient = window.supabase.createClient(window.PRZ_SUPABASE.url, window.PRZ_SUPABASE.publishableKey);
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    setSupabaseStatus("Connection issue");
    return;
  }

  await applySupabaseSession(data.session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    applySupabaseSession(session);
  });
}

async function signInWithSupabase(email, password) {
  if (!supabaseClient) {
    alert("Supabase is not connected yet.");
    return;
  }
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert(error.message);
    return;
  }
  document.querySelector("#authForm").reset();
}

async function signOutOfSupabase() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ticketNumber() {
  return `PRZ-${String(state.nextTicket).padStart(4, "0")}`;
}

function displayDate(value) {
  if (!value) return "Unscheduled";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function customerName(id) {
  return state.customers.find((customer) => customer.id === id)?.name || "Unknown customer";
}

function findDriver(id) {
  return state.drivers.find((driver) => driver.id === id);
}

function findEquipment(id) {
  return state.equipment.find((equipment) => equipment.id === id);
}

function ticketTotal(ticket) {
  const base = Number(ticket.hours || 0) * Number(ticket.rate || 0);
  const overtime = Number(ticket.overtimeHours || 0) * Number(ticket.rate || 0) * 1.5;
  const mileage = Number(ticket.mileage || 0) * 3;
  const total = base + overtime + mileage + Number(ticket.fuel || 0);
  return Math.max(total, Number(ticket.minimum || 0));
}

function formatAmount(ticket) {
  return moneyFormatter.format(ticketTotal(ticket));
}

function statusClass(status) {
  return `status-${status.replaceAll(" ", "-")}`;
}

function notify(message, audience = "dispatcher") {
  state.notifications.unshift({ id: uid("note"), message, audience, at: new Date().toISOString(), read: false });
  state.notifications = state.notifications.slice(0, 80);
}

function fileNames(input) {
  return [...input.files].map((file) => file.name);
}

function isSignatureBlank(canvas) {
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  return !pixels.some((value) => value !== 0);
}

function missingDispatchFields(data) {
  const labels = {
    customerId: "Customer",
    jobDate: "Job date",
    site: "Job site",
    serviceType: "Service type",
    priority: "Priority",
    driverId: "Driver",
    equipmentId: "Equipment",
    startTime: "Start time",
    hours: "Estimated hours",
    rate: "Base rate",
    mileage: "Mileage",
    fuel: "Fuel surcharge",
    minimum: "Minimum charge",
    notes: "Work instructions",
  };

  return Object.entries(labels).filter(([field]) => {
    const value = String(data.get(field) ?? "").trim();
    if (!value) return true;
    if (["hours", "rate", "mileage", "fuel", "minimum"].includes(field)) {
      const number = Number(value);
      return Number.isNaN(number) || number < 0 || (field === "hours" && number <= 0);
    }
    return false;
  }).map(([, label]) => label);
}

function setView(name) {
  const allowed = permissions[state.role];
  const safeName = allowed.includes(name) ? name : allowed[0];
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${safeName}View`);
  });
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === safeName);
  });
  document.querySelector("#viewTitle").textContent = viewTitles[safeName];
}

function applyRole() {
  const allowed = permissions[state.role];
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.hidden = !allowed.includes(button.dataset.view);
  });
  document.querySelector("#roleSelect").value = state.role;
  document.querySelector("#activeRoleLabel").textContent = roleLabel(state.role);
  document.body.classList.toggle("driver-mode", state.role === "driver");
  document.body.classList.toggle("maintenance-mode", state.role === "maintenance");
  const active = document.querySelector(".nav-tab.active")?.dataset.view;
  setView(active && allowed.includes(active) ? active : allowed[0]);
}

function renderSelects() {
  const activeDriverId = document.querySelector("#driverQueueSelect").value;
  const activeSignatureTicket = document.querySelector("#signatureTicketSelect").value;
  const driverOptions = state.drivers.map((driver) => `<option value="${driver.id}">${driver.name}</option>`).join("");
  const availableEquipment = state.equipment.filter((item) => item.status !== "Out of Service");
  const equipmentOptions = availableEquipment.map((item) => `<option value="${item.id}">${item.name} - ${item.type} (${item.status})</option>`).join("");
  const customerOptions = state.customers.map((customer) => `<option value="${customer.id}">${customer.name}</option>`).join("");
  const maintenanceOptions = state.equipment.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  const activeTicketOptions = state.tickets
    .filter((ticket) => !["Invoiced", "Canceled"].includes(ticket.status))
    .map((ticket) => `<option value="${ticket.id}">${ticket.id} - ${customerName(ticket.customerId)}</option>`)
    .join("");

  document.querySelector("#driver").innerHTML = driverOptions;
  document.querySelector("#driverQueueSelect").innerHTML = driverOptions;
  document.querySelector("#equipment").innerHTML = equipmentOptions;
  document.querySelector("#customerSelect").innerHTML = customerOptions;
  document.querySelector("#maintenanceEquipment").innerHTML = maintenanceOptions;
  document.querySelector("#signatureTicketSelect").innerHTML = activeTicketOptions || `<option value="">No open tickets</option>`;

  if (state.drivers.some((driver) => driver.id === activeDriverId)) document.querySelector("#driverQueueSelect").value = activeDriverId;
  if (state.tickets.some((ticket) => ticket.id === activeSignatureTicket)) document.querySelector("#signatureTicketSelect").value = activeSignatureTicket;
}

function renderStats() {
  const open = state.tickets.filter((ticket) => !closedStatuses.includes(ticket.status)).length;
  const withDrivers = state.tickets.filter((ticket) => ["Sent", "Accepted", "In Progress"].includes(ticket.status)).length;
  const ready = state.tickets.filter((ticket) => ticket.status === "Completed").length;
  const revenue = state.tickets.reduce((sum, ticket) => sum + ticketTotal(ticket), 0);
  document.querySelector("#openCount").textContent = open;
  document.querySelector("#driverCount").textContent = withDrivers;
  document.querySelector("#invoiceCount").textContent = ready;
  document.querySelector("#revenueCount").textContent = moneyFormatter.format(revenue);
  document.querySelector("#nextTicketNumber").textContent = ticketNumber();
}

function ticketDetails(ticket) {
  const driver = findDriver(ticket.driverId);
  const equipment = findEquipment(ticket.equipmentId);
  return [
    ["Date", displayDate(ticket.jobDate)],
    ["Service", ticket.serviceType],
    ["Driver", driver?.name || "Unassigned"],
    ["Equipment", equipment ? `${equipment.name} (${equipment.type})` : "Unassigned"],
    ["Scheduled", ticket.startTime || "TBD"],
    ["Actual", `${ticket.actualStart || "--"} to ${ticket.actualEnd || "--"}`],
    ["Amount", formatAmount(ticket)],
    ["Site", ticket.site],
    ["Priority", ticket.priority],
    ["Signature", ticket.signerName ? `Signed by ${ticket.signerName}` : "Not signed"],
  ];
}

function buildTicketCard(ticket, context = "dispatch") {
  const card = document.querySelector("#ticketCardTemplate").content.firstElementChild.cloneNode(true);
  card.querySelector(".ticket-id").textContent = ticket.id;
  card.querySelector("h3").textContent = customerName(ticket.customerId);
  const pill = card.querySelector(".status-pill");
  pill.textContent = ticket.status;
  pill.classList.add(statusClass(ticket.status));
  card.querySelector(".ticket-details").innerHTML = ticketDetails(ticket).map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  card.querySelector(".ticket-notes").textContent = ticket.notes || "No special instructions added.";

  const allFiles = [...(ticket.attachments || []), ...(ticket.driverAttachments || [])];
  card.querySelector(".attachment-list").innerHTML = allFiles.length
    ? allFiles.map((name) => `<span class="file-chip">${name}</span>`).join("")
    : `<span class="muted-small">No attachments yet</span>`;

  const actions = card.querySelector(".ticket-actions");
  if (context === "driver") {
    if (ticket.status === "Sent") actions.append(actionButton("Accept ticket", () => updateTicket(ticket.id, "Accepted")));
    if (ticket.status === "Accepted") actions.append(actionButton("Start work", () => updateTicket(ticket.id, "In Progress")));
    if (ticket.status === "In Progress") actions.append(actionButton("Mark complete", () => updateTicket(ticket.id, "Completed")));
  } else {
    if (!["Invoiced", "Canceled"].includes(ticket.status)) {
      actions.append(actionButton("Mark complete", () => updateTicket(ticket.id, "Completed")));
    }
    if (!closedStatuses.includes(ticket.status)) {
      actions.append(actionButton("Cancel ticket", () => cancelTicket(ticket.id), "danger-inline"));
    }
  }
  return card;
}

function actionButton(label, handler, extraClass = "") {
  const button = document.createElement("button");
  button.className = `small-button ${extraClass}`.trim();
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function renderTickets() {
  const list = document.querySelector("#ticketList");
  const filter = document.querySelector("#statusFilter").value;
  const tickets = [...state.tickets].filter((ticket) => filter === "all" || ticket.status === filter).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  list.innerHTML = "";
  if (!tickets.length) {
    list.innerHTML = `<div class="empty-state">No work tickets match this view.</div>`;
    return;
  }
  tickets.forEach((ticket) => list.append(buildTicketCard(ticket)));
}

function renderDriverQueue() {
  const select = document.querySelector("#driverQueueSelect");
  const driverId = select.value || state.drivers[0]?.id;
  if (driverId && select.value !== driverId) select.value = driverId;
  const tickets = state.tickets.filter((ticket) => ticket.driverId === driverId && !["Invoiced", "Canceled"].includes(ticket.status)).sort((a, b) => a.jobDate.localeCompare(b.jobDate));
  const activeCount = tickets.filter((ticket) => ticket.status !== "Completed").length;
  const completedCount = tickets.filter((ticket) => ticket.status === "Completed").length;
  const driver = findDriver(driverId);
  document.querySelector("#driverSummary").innerHTML = `
    <div class="summary-box"><span>Driver</span><strong>${driver?.name || "No driver selected"}</strong></div>
    <div class="summary-box"><span>Phone</span><strong>${driver?.phone || "--"}</strong></div>
    <div class="summary-box"><span>Tickets</span><strong>${activeCount} active / ${completedCount} completed</strong></div>
  `;
  const list = document.querySelector("#driverTicketList");
  list.innerHTML = "";
  if (!tickets.length) {
    list.innerHTML = `<div class="empty-state">This driver has no assigned work tickets.</div>`;
    return;
  }
  tickets.forEach((ticket) => list.append(buildTicketCard(ticket, "driver")));
}

function focusDriverTickets(mode) {
  const select = document.querySelector("#driverQueueSelect");
  const driverId = select.value || state.drivers[0]?.id;
  const tickets = state.tickets.filter((ticket) => ticket.driverId === driverId && !["Invoiced", "Canceled"].includes(ticket.status));
  const visibleTickets = mode === "completed"
    ? tickets.filter((ticket) => ticket.status === "Completed")
    : tickets.filter((ticket) => ticket.status !== "Completed");
  const list = document.querySelector("#driverTicketList");
  list.innerHTML = "";
  if (!visibleTickets.length) {
    list.innerHTML = `<div class="empty-state">No ${mode === "completed" ? "completed" : "active"} tickets for this driver.</div>`;
    return;
  }
  visibleTickets.forEach((ticket) => list.append(buildTicketCard(ticket, "driver")));
}

function renderInvoices() {
  const rows = document.querySelector("#invoiceRows");
  const tickets = state.tickets.filter((ticket) => invoiceFilter === "all" || ticket.status === "Completed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!tickets.length) {
    rows.innerHTML = `<tr><td colspan="8">No tickets are ready for invoicing.</td></tr>`;
    return;
  }
  rows.innerHTML = tickets.map((ticket) => {
    const disabled = ticket.status !== "Completed" ? "disabled" : "";
    const packet = `${(ticket.attachments || []).length + (ticket.driverAttachments || []).length} files / ${ticket.signerName ? "signed" : "unsigned"}`;
    return `
      <tr>
        <td><strong>${ticket.id}</strong><br><span>${displayDate(ticket.jobDate)}</span></td>
        <td>${customerName(ticket.customerId)}<br><span>${ticket.site}</span></td>
        <td>${ticket.serviceType}</td>
        <td>${findDriver(ticket.driverId)?.name || "Unassigned"}</td>
        <td>${packet}</td>
        <td><strong>${formatAmount(ticket)}</strong></td>
        <td><span class="status-pill ${statusClass(ticket.status)}">${ticket.status}</span></td>
        <td><button class="small-button invoice-action" data-ticket="${ticket.id}" ${disabled}>Mark invoiced</button></td>
      </tr>`;
  }).join("");
  document.querySelectorAll(".invoice-action").forEach((button) => button.addEventListener("click", () => updateTicket(button.dataset.ticket, "Invoiced")));
}

function renderCustomers() {
  document.querySelector("#customerList").innerHTML = state.customers.map((customer) => `
    <div class="admin-row">
      <div><strong>${customer.name}</strong><span>${customer.contact || "No contact"} | ${customer.terms || "No terms"}</span><span>${customer.site || "No default site"}</span></div>
      <button class="small-button remove-customer" data-id="${customer.id}" type="button">Remove</button>
    </div>`).join("");
  document.querySelectorAll(".remove-customer").forEach((button) => button.addEventListener("click", () => removeCustomer(button.dataset.id)));

  const tickets = state.tickets.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = document.querySelector("#customerHistory");
  history.innerHTML = "";
  if (!tickets.length) {
    history.innerHTML = `<div class="empty-state">No customer job history yet.</div>`;
    return;
  }
  tickets.forEach((ticket) => history.append(buildTicketCard(ticket)));
}

function renderOperations() {
  const grouped = state.tickets.reduce((acc, ticket) => {
    acc[ticket.jobDate] ||= [];
    acc[ticket.jobDate].push(ticket);
    return acc;
  }, {});
  document.querySelector("#calendarBoard").innerHTML = Object.keys(grouped).sort().map((date) => `
    <div class="schedule-day"><strong>${displayDate(date)}</strong>${grouped[date].map((ticket) => `<span>${ticket.startTime || "TBD"} | ${ticket.id} | ${customerName(ticket.customerId)}</span>`).join("")}</div>
  `).join("") || `<div class="empty-state">No scheduled tickets.</div>`;

  document.querySelector("#mapBoard").innerHTML = state.tickets.map((ticket) => `
    <div class="map-pin">
      <strong>${ticket.site}</strong>
      <span>${ticket.id} | ${customerName(ticket.customerId)}</span>
      <span>${findEquipment(ticket.equipmentId)?.name || "No equipment"} | ${ticket.status}</span>
    </div>
  `).join("") || `<div class="empty-state">No job sites to map.</div>`;
}

function renderMaintenance() {
  document.querySelector("#fleetStatusList").innerHTML = state.equipment.map((item) => `
    <div class="admin-row">
      <div><strong>${item.name}</strong><span>${item.type} | ${item.status}</span><span>Cert: ${displayDate(item.cert)} | Service: ${displayDate(item.nextService)}</span></div>
      <select class="equipment-status" data-id="${item.id}"><option ${item.status === "Available" ? "selected" : ""}>Available</option><option ${item.status === "Assigned" ? "selected" : ""}>Assigned</option><option ${item.status === "Maintenance" ? "selected" : ""}>Maintenance</option><option ${item.status === "Out of Service" ? "selected" : ""}>Out of Service</option></select>
    </div>`).join("");
  document.querySelectorAll(".equipment-status").forEach((select) => select.addEventListener("change", () => {
    state.equipment = state.equipment.map((item) => item.id === select.dataset.id ? { ...item, status: select.value } : item);
    notify(`${findEquipment(select.dataset.id)?.name || "Equipment"} marked ${select.value}.`, "maintenance");
    renderAll();
  }));

  document.querySelector("#maintenanceList").innerHTML = state.maintenance.map((item) => `
    <div class="admin-row">
      <div><strong>${item.task}</strong><span>${findEquipment(item.equipmentId)?.name || "Equipment"} | ${displayDate(item.due)} | ${item.status}</span></div>
      <button class="small-button complete-maintenance" data-id="${item.id}" type="button">Complete</button>
    </div>`).join("") || `<div class="empty-state">No maintenance items yet.</div>`;
  document.querySelectorAll(".complete-maintenance").forEach((button) => button.addEventListener("click", () => {
    state.maintenance = state.maintenance.map((item) => item.id === button.dataset.id ? { ...item, status: "Complete" } : item);
    renderAll();
  }));
}

function renderReports() {
  const customerTotals = sumBy(state.tickets, (ticket) => customerName(ticket.customerId));
  const equipmentTotals = sumBy(state.tickets, (ticket) => findEquipment(ticket.equipmentId)?.name || "Unassigned");
  const uninvoiced = state.tickets.filter((ticket) => ticket.status === "Completed").reduce((sum, ticket) => sum + ticketTotal(ticket), 0);
  document.querySelector("#customerReport").innerHTML = reportBars(customerTotals);
  document.querySelector("#equipmentReport").innerHTML = reportBars(equipmentTotals);
  document.querySelector("#uninvoicedReport").innerHTML = `<div class="big-number">${moneyFormatter.format(uninvoiced)}</div><p class="muted-small">Completed work waiting on invoicing.</p>`;
}

function sumBy(tickets, labeler) {
  return tickets.reduce((acc, ticket) => {
    const label = labeler(ticket);
    acc[label] = (acc[label] || 0) + ticketTotal(ticket);
    return acc;
  }, {});
}

function reportBars(totals) {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return entries.map(([label, value]) => `
    <div class="report-row"><div><strong>${label}</strong><span>${moneyFormatter.format(value)}</span></div><div class="bar"><span style="width:${(value / max) * 100}%"></span></div></div>
  `).join("") || `<div class="empty-state">No report data yet.</div>`;
}

function renderNotifications() {
  document.querySelector("#notificationList").innerHTML = state.notifications.map((note) => `
    <div class="admin-row">
      <div><strong>${note.message}</strong><span>${new Date(note.at).toLocaleString()} | ${note.audience}</span></div>
    </div>`).join("") || `<div class="empty-state">No notifications yet.</div>`;
}

function renderAdmin() {
  document.querySelector("#userList").innerHTML = state.users.map((user) => `
    <div class="user-row">
      <div><strong>${user.name}</strong><span>@${user.username}</span></div>
      <div><strong>${user.role}</strong><span>Role</span></div>
      <form class="password-form" data-id="${user.id}">
        <input required minlength="8" type="password" placeholder="New password" />
        <button class="small-button" type="submit">Reset password</button>
      </form>
      <button class="small-button remove-user" data-id="${user.id}" type="button">Remove</button>
    </div>`).join("");
  document.querySelector("#driverList").innerHTML = state.drivers.map((driver) => `
    <div class="admin-row"><div><strong>${driver.name}</strong><span>${driver.phone}</span></div><button class="small-button remove-driver" data-id="${driver.id}" type="button">Remove</button></div>`).join("");
  document.querySelector("#equipmentList").innerHTML = state.equipment.map((item) => `
    <div class="admin-row"><div><strong>${item.name}</strong><span>${item.type} | ${item.status}</span></div><button class="small-button remove-equipment" data-id="${item.id}" type="button">Remove</button></div>`).join("");
  document.querySelectorAll(".remove-driver").forEach((button) => button.addEventListener("click", () => removeDriver(button.dataset.id)));
  document.querySelectorAll(".remove-equipment").forEach((button) => button.addEventListener("click", () => removeEquipment(button.dataset.id)));
  document.querySelectorAll(".remove-user").forEach((button) => button.addEventListener("click", () => removeUser(button.dataset.id)));
  document.querySelectorAll(".password-form").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const password = form.querySelector("input").value;
    resetPassword(form.dataset.id, password);
    form.reset();
  }));
}

function renderAll() {
  renderSelects();
  renderStats();
  renderTickets();
  renderDriverQueue();
  renderInvoices();
  renderCustomers();
  renderOperations();
  renderMaintenance();
  renderReports();
  renderNotifications();
  renderAdmin();
  applyRole();
  saveState();
}

function updateTicket(id, status) {
  if (status === "Invoiced" && !["admin", "invoicing"].includes(state.role)) {
    alert("Only invoicing or admin users can mark a ticket as invoiced.");
    return;
  }
  state.tickets = state.tickets.map((ticket) => {
    if (ticket.id !== id) return ticket;
    const next = { ...ticket, status };
    if (status === "In Progress" && !next.actualStart) next.actualStart = new Date().toTimeString().slice(0, 5);
    if (status === "Completed") {
      next.completedAt = new Date().toISOString();
      if (!next.actualEnd) next.actualEnd = new Date().toTimeString().slice(0, 5);
    }
    if (status === "Invoiced") next.invoicedAt = new Date().toISOString();
    return next;
  });
  const ticket = state.tickets.find((item) => item.id === id);
  notify(`${id} moved to ${status}.`, status === "Invoiced" ? "invoicing" : "dispatcher");
  if (ticket) updateEquipmentFromTickets(ticket.equipmentId);
  renderAll();
}

function cancelTicket(id) {
  if (!["admin", "dispatcher"].includes(state.role)) {
    alert("Only dispatch or admin users can cancel a work ticket.");
    return;
  }
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket || closedStatuses.includes(ticket.status)) return;
  if (!confirm(`Cancel work ticket ${id}?`)) return;
  updateTicket(id, "Canceled");
}

function updateEquipmentFromTickets(equipmentId) {
  const hasActive = state.tickets.some((ticket) => ticket.equipmentId === equipmentId && ["Sent", "Accepted", "In Progress"].includes(ticket.status));
  state.equipment = state.equipment.map((item) => item.id === equipmentId ? { ...item, status: hasActive ? "Assigned" : item.status === "Assigned" ? "Available" : item.status } : item);
}

function removeDriver(id) {
  if (state.tickets.some((ticket) => ticket.driverId === id && !["Invoiced", "Canceled"].includes(ticket.status))) return alert("This driver has open tickets.");
  state.drivers = state.drivers.filter((driver) => driver.id !== id);
  renderAll();
}

function removeEquipment(id) {
  if (state.tickets.some((ticket) => ticket.equipmentId === id && !["Invoiced", "Canceled"].includes(ticket.status))) return alert("This equipment has open tickets.");
  state.equipment = state.equipment.filter((item) => item.id !== id);
  renderAll();
}

function removeCustomer(id) {
  if (state.tickets.some((ticket) => ticket.customerId === id)) return alert("This customer has ticket history.");
  state.customers = state.customers.filter((customer) => customer.id !== id);
  renderAll();
}

function removeUser(id) {
  const user = state.users.find((item) => item.id === id);
  if (user?.role === "admin" && state.users.filter((item) => item.role === "admin").length === 1) {
    alert("Keep at least one admin user.");
    return;
  }
  state.users = state.users.filter((item) => item.id !== id);
  notify(`${user?.name || "User"} removed from user access.`, "admin");
  renderAll();
}

function resetPassword(id, password) {
  state.users = state.users.map((user) => user.id === id ? { ...user, password } : user);
  const user = state.users.find((item) => item.id === id);
  notify(`Password reset for ${user?.name || "user"}.`, "admin");
  renderAll();
}

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const rows = [["Ticket", "Customer", "Date", "Service", "Driver", "Equipment", "Status", "Amount", "Signed", "Files"]];
  const readyTickets = state.tickets.filter((ticket) => ticket.status === "Completed");
  if (!readyTickets.length) {
    alert("There are no completed tickets ready to export for invoicing.");
    return;
  }
  readyTickets.forEach((ticket) => rows.push([
    ticket.id,
    customerName(ticket.customerId),
    ticket.jobDate,
    ticket.serviceType,
    findDriver(ticket.driverId)?.name || "",
    findEquipment(ticket.equipmentId)?.name || "",
    ticket.status,
    ticketTotal(ticket),
    ticket.signerName || "",
    [...(ticket.attachments || []), ...(ticket.driverAttachments || [])].join("; "),
  ]));
  downloadText("prz-ready-for-invoicing.csv", rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv");
}

function exportPacket() {
  const packet = state.tickets
    .filter((ticket) => ticket.status === "Completed")
    .map((ticket) => `${ticket.id}\nCustomer: ${customerName(ticket.customerId)}\nSite: ${ticket.site}\nAmount: ${formatAmount(ticket)}\nDriver: ${findDriver(ticket.driverId)?.name || ""}\nSigned by: ${ticket.signerName || "Not signed"}\nNotes: ${ticket.driverNotes || ticket.notes || ""}\nFiles: ${[...(ticket.attachments || []), ...(ticket.driverAttachments || [])].join(", ") || "None"}`)
    .join("\n\n---\n\n");
  downloadText("prz-invoice-packet.txt", packet || "No completed tickets ready for invoicing.");
}

function seedSampleDay() {
  state = structuredClone(defaultState);
  state.nextTicket = 1051;
  state.maintenance = [
    { id: "mnt-1", equipmentId: "eq-1", task: "Annual crane inspection", due: "2026-06-15", status: "Scheduled" },
    { id: "mnt-2", equipmentId: "eq-2", task: "DOT service and oil change", due: "2026-05-22", status: "Due Soon" },
  ];
  state.tickets = [
    {
      id: "PRZ-1048", customerId: "cus-1", site: "County Road 118 lease pad", serviceType: "Crane lift", priority: "High",
      driverId: "drv-1", equipmentId: "eq-1", jobDate: todayISO(), startTime: "07:30", hours: 6, rate: 225, mileage: 18,
      fuel: 95, minimum: 1000, overtimeHours: 0, attachments: ["lift-plan.pdf"], driverAttachments: ["compressor-set-photo.jpg"],
      notes: "Set compressor skid. Call site contact before entering the gate.", status: "In Progress", actualStart: "07:42",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "PRZ-1049", customerId: "cus-2", site: "South yard to Hobbs location", serviceType: "Trucking", priority: "Standard",
      driverId: "drv-2", equipmentId: "eq-2", jobDate: todayISO(), startTime: "10:00", hours: 4, rate: 175, mileage: 42,
      fuel: 60, minimum: 650, overtimeHours: 0, attachments: ["bill-of-lading.pdf"], driverAttachments: [], notes: "Move pipe racks. Yard manager will load.",
      status: "Sent", createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "PRZ-1050", customerId: "cus-1", site: "PRZ yard", serviceType: "Rig move", priority: "Emergency",
      driverId: "drv-3", equipmentId: "eq-3", jobDate: todayISO(), startTime: "13:00", hours: 8, rate: 250, mileage: 22,
      fuel: 125, minimum: 1500, overtimeHours: 1, attachments: ["route-permit.pdf"], driverAttachments: ["signed-ticket.jpg"],
      notes: "Confirm route before dispatch. Oversize load escort requested.", status: "Completed", actualStart: "13:05", actualEnd: "18:40",
      signerName: "Luis Moreno", customerSignature: "typed approval", completedAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
  ];
  notify("Sample day loaded with dispatch, maintenance, attachments, and invoicing data.", "admin");
  renderAll();
}

document.querySelector("#ticketForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const missing = missingDispatchFields(data);
  if (missing.length) {
    alert(`Complete these required dispatch fields before sending:\n\n${missing.join("\n")}`);
    return;
  }
  const ticket = {
    id: ticketNumber(),
    customerId: data.get("customerId"),
    site: data.get("site").trim(),
    serviceType: data.get("serviceType"),
    priority: data.get("priority"),
    driverId: data.get("driverId"),
    equipmentId: data.get("equipmentId"),
    jobDate: data.get("jobDate"),
    startTime: data.get("startTime"),
    hours: Number(data.get("hours")),
    rate: Number(data.get("rate")),
    mileage: Number(data.get("mileage")),
    fuel: Number(data.get("fuel")),
    minimum: Number(data.get("minimum")),
    overtimeHours: 0,
    notes: data.get("notes").trim(),
    attachments: fileNames(document.querySelector("#ticketFiles")),
    driverAttachments: [],
    driverNotes: "",
    customerSignature: "",
    signerName: "",
    status: "Sent",
    createdAt: new Date().toISOString(),
  };
  state.tickets.push(ticket);
  state.nextTicket += 1;
  updateEquipmentFromTickets(ticket.equipmentId);
  notify(`${ticket.id} sent to ${findDriver(ticket.driverId)?.name || "driver"}.`, "driver");
  event.currentTarget.reset();
  document.querySelector("#jobDate").value = todayISO();
  renderAll();
  setView("drivers");
  document.querySelector("#driverQueueSelect").value = ticket.driverId;
  renderDriverQueue();
});

document.querySelector("#driverForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const driver = { name: document.querySelector("#driverName").value.trim(), phone: document.querySelector("#driverPhone").value.trim() };
  if (supabaseSession) {
    supabaseClient.from("drivers").insert(driver).then(async ({ error }) => {
      if (error) return alert(error.message);
      event.currentTarget.reset();
      await loadSupabaseReferenceData();
    });
    return;
  }
  state.drivers.push({ id: uid("drv"), ...driver });
  event.currentTarget.reset();
  renderAll();
});

document.querySelector("#equipmentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const equipment = {
    name: document.querySelector("#equipmentName").value.trim(),
    type: document.querySelector("#equipmentType").value,
    status: "Available",
    certification_due: "2026-12-31",
    next_service_due: "2026-06-30",
  };
  if (supabaseSession) {
    supabaseClient.from("equipment").insert(equipment).then(async ({ error }) => {
      if (error) return alert(error.message);
      event.currentTarget.reset();
      await loadSupabaseReferenceData();
    });
    return;
  }
  state.equipment.push({ id: uid("eq"), name: equipment.name, type: equipment.type, status: equipment.status, cert: equipment.certification_due, nextService: equipment.next_service_due });
  event.currentTarget.reset();
  renderAll();
});

document.querySelector("#userForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const username = document.querySelector("#userUsername").value.trim();
  if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    alert("That username already exists.");
    return;
  }
  state.users.push({
    id: uid("usr"),
    name: document.querySelector("#userName").value.trim(),
    username,
    role: document.querySelector("#userRole").value,
    password: document.querySelector("#userPassword").value,
  });
  notify(`${document.querySelector("#userName").value.trim()} added as ${document.querySelector("#userRole").value}.`, "admin");
  event.currentTarget.reset();
  renderAll();
});

document.querySelector("#customerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const customer = {
    name: document.querySelector("#customerName").value.trim(),
    contact: document.querySelector("#customerContact").value.trim(),
    billing_terms: document.querySelector("#customerTerms").value.trim(),
    default_site: document.querySelector("#customerSite").value.trim(),
    instructions: document.querySelector("#customerInstructions").value.trim(),
  };
  if (supabaseSession) {
    supabaseClient.from("customers").insert(customer).then(async ({ error }) => {
      if (error) return alert(error.message);
      event.currentTarget.reset();
      await loadSupabaseReferenceData();
    });
    return;
  }
  state.customers.push({ id: uid("cus"), name: customer.name, contact: customer.contact, terms: customer.billing_terms, site: customer.default_site, instructions: customer.instructions });
  event.currentTarget.reset();
  renderAll();
});

document.querySelector("#maintenanceForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const maintenance = {
    equipment_id: document.querySelector("#maintenanceEquipment").value,
    due_date: document.querySelector("#maintenanceDue").value,
    task: document.querySelector("#maintenanceTask").value.trim(),
    status: document.querySelector("#maintenanceStatus").value,
  };
  if (supabaseSession) {
    supabaseClient.from("maintenance_records").insert(maintenance).then(async ({ error }) => {
      if (error) return alert(error.message);
      event.currentTarget.reset();
      await loadSupabaseReferenceData();
    });
    return;
  }
  state.maintenance.push({ id: uid("mnt"), equipmentId: maintenance.equipment_id, due: maintenance.due_date, task: maintenance.task, status: maintenance.status });
  event.currentTarget.reset();
  renderAll();
});

document.querySelector("#saveCompletion").addEventListener("click", () => {
  const ticketId = document.querySelector("#signatureTicketSelect").value;
  const noteField = document.querySelector("#driverNote");
  const signerField = document.querySelector("#signerName");
  const canvas = document.querySelector("#signatureCanvas");
  if (!ticketId || !noteField.value.trim() || !signerField.value.trim()) {
    alert("Complete the ticket, driver note, and customer name before saving the packet.");
    return;
  }
  if (isSignatureBlank(canvas)) {
    alert("Customer signature is required before saving the completion packet.");
    return;
  }
  state.tickets = state.tickets.map((ticket) => ticket.id === ticketId ? {
    ...ticket,
    driverNotes: noteField.value.trim(),
    driverAttachments: [...(ticket.driverAttachments || []), ...fileNames(document.querySelector("#driverAttachment"))],
    signerName: signerField.value.trim(),
    customerSignature: canvas.toDataURL("image/png"),
  } : ticket);
  notify(`${ticketId} completion packet updated.`, "invoicing");
  noteField.value = "";
  signerField.value = "";
  document.querySelector("#driverAttachment").value = "";
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  renderAll();
});

document.querySelectorAll(".nav-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelector("#statusFilter").addEventListener("change", renderTickets);
document.querySelector("#driverQueueSelect").addEventListener("change", renderDriverQueue);
document.querySelector("#roleSelect").addEventListener("change", (event) => {
  state.role = event.target.value;
  renderAll();
});
document.querySelector("#showCurrentTicket").addEventListener("click", () => focusDriverTickets("active"));
document.querySelector("#showCompletedTickets").addEventListener("click", () => focusDriverTickets("completed"));
document.querySelectorAll(".segment").forEach((button) => button.addEventListener("click", () => {
  invoiceFilter = button.dataset.invoiceFilter;
  document.querySelectorAll(".segment").forEach((segment) => segment.classList.toggle("active", segment === button));
  renderInvoices();
}));
document.querySelector("#seedDataButton").addEventListener("click", seedSampleDay);
document.querySelector("#clearDataButton").addEventListener("click", () => {
  if (!confirm("Clear all local PRZ operations data?")) return;
  state = structuredClone(defaultState);
  renderAll();
});
document.querySelector("#exportCsv").addEventListener("click", exportCsv);
document.querySelector("#exportPacket").addEventListener("click", exportPacket);
document.querySelector("#clearNotifications").addEventListener("click", () => {
  state.notifications = [];
  renderAll();
});
document.querySelector("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await signInWithSupabase(document.querySelector("#authEmail").value.trim(), document.querySelector("#authPassword").value);
});
document.querySelector("#signOutButton").addEventListener("click", signOutOfSupabase);

const canvas = document.querySelector("#signatureCanvas");
const ctx = canvas.getContext("2d");
ctx.lineWidth = 3;
ctx.lineCap = "round";
ctx.strokeStyle = "#0a0a0c";
function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event;
  return { x: ((source.clientX - rect.left) / rect.width) * canvas.width, y: ((source.clientY - rect.top) / rect.height) * canvas.height };
}
function startSignature(event) {
  signatureDrawing = true;
  const point = canvasPoint(event);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}
function drawSignature(event) {
  if (!signatureDrawing) return;
  event.preventDefault();
  const point = canvasPoint(event);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
}
function stopSignature() {
  signatureDrawing = false;
}
canvas.addEventListener("mousedown", startSignature);
canvas.addEventListener("mousemove", drawSignature);
canvas.addEventListener("mouseup", stopSignature);
canvas.addEventListener("mouseleave", stopSignature);
canvas.addEventListener("touchstart", startSignature);
canvas.addEventListener("touchmove", drawSignature);
canvas.addEventListener("touchend", stopSignature);
document.querySelector("#clearSignature").addEventListener("click", () => ctx.clearRect(0, 0, canvas.width, canvas.height));

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.querySelector("#installAppButton").hidden = false;
});

document.querySelector("#installAppButton").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.querySelector("#installAppButton").hidden = true;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

document.querySelector("#todayLabel").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
document.querySelector("#jobDate").value = todayISO();
document.querySelector("#maintenanceDue").value = todayISO();
initSupabase();
renderAll();
