(() => {
  "use strict";
  const STORAGE_KEY = "carnes-erdella-partes-v1";
  const AUTH_KEY = "carnes-erdella-autorizado-v1";
  const LAST_WORKER_KEY = "carnes-erdella-ultimo-trabajador-v1";
  const WORKERS_KEY = "carnes-erdella-trabajadores-v1";
  const VEHICLES_KEY = "carnes-erdella-camiones-v1";
  const ACCESS_USER = "goikola";
  const ACCESS_PASSWORD = "2828";
  const ADMIN_USER = "soraya";
  const ADMIN_EMAIL = "soraya@carnes-erdella.local";
  const FIREBASE_API_KEY = "AIzaSyBjT_49FR1Fxq6kuph4n8L2SGje1WxYxJs";
  const FIREBASE_DATABASE_URL = "https://partes-trabajo-erdella-default-rtdb.europe-west1.firebasedatabase.app";
  const $ = (id) => document.getElementById(id);
  const form = $("workForm");
  const fields = {
    id: $("recordId"), date: $("date"), worker: $("worker"), vehicle: $("vehicle"),
    route: $("route"), startTime: $("startTime"), endTime: $("endTime"),
    startKm: $("startKm"), endKm: $("endKm"), notes: $("notes")
  };
  let deferredInstallPrompt = null;
  let adminUnlocked = false;
  let adminToken = "";
  let sharedWorkers = null;
  let sharedVehicles = null;

  function unlockApp() {
    document.body.classList.remove("auth-locked");
    $("loginScreen").hidden = true;
  }
  function initializeAccess() {
    if (localStorage.getItem(AUTH_KEY) === "si") { unlockApp(); return; }
    $("loginScreen").hidden = false;
    $("loginForm").addEventListener("submit", event => {
      event.preventDefault();
      const valid = $("loginUser").value.trim().toLowerCase() === ACCESS_USER && $("loginPassword").value === ACCESS_PASSWORD;
      if (!valid) {
        $("loginError").textContent = "Usuario o contraseña incorrectos.";
        $("loginError").hidden = false;
        $("loginPassword").value = "";
        $("loginPassword").focus();
        return;
      }
      localStorage.setItem(AUTH_KEY, "si");
      unlockApp();
    });
  }

  const readRecords = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  };
  const writeRecords = (records) => localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  const normalizeWorker = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const normalizePlate = (value) => String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
  const normalizeVehicleType = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
  const normalizeWorkers = (workers) => [...new Set((Array.isArray(workers) ? workers : []).map(normalizeWorker).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  function readWorkers() {
    if (sharedWorkers) return [...sharedWorkers];
    try {
      const saved = JSON.parse(localStorage.getItem(WORKERS_KEY));
      if (Array.isArray(saved)) return normalizeWorkers(saved);
    } catch {}
    return normalizeWorkers(APP_DATA.workers);
  }
  function normalizeVehicles(vehicles) {
    const unique = new Map();
    for (const vehicle of vehicles) {
      const plate = normalizePlate(Array.isArray(vehicle) ? vehicle[0] : vehicle?.plate);
      const type = normalizeVehicleType(Array.isArray(vehicle) ? vehicle[1] : vehicle?.type);
      if (plate) unique.set(plate, [plate, type]);
    }
    return [...unique.values()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }
  function readVehicles() {
    if (sharedVehicles) return sharedVehicles.map(vehicle => [...vehicle]);
    try {
      const saved = JSON.parse(localStorage.getItem(VEHICLES_KEY));
      if (Array.isArray(saved)) return normalizeVehicles(saved);
    } catch {}
    return normalizeVehicles(APP_DATA.vehicles);
  }
  function applyCatalog(workers, vehicles) {
    sharedWorkers = normalizeWorkers(workers);
    sharedVehicles = normalizeVehicles(vehicles);
    localStorage.setItem(WORKERS_KEY, JSON.stringify(sharedWorkers));
    localStorage.setItem(VEHICLES_KEY, JSON.stringify(sharedVehicles));
    fillWorkerSelect();
    fillVehicleSelect();
    renderAdminWorkers();
    renderAdminVehicles();
  }
  function validCatalog(catalog) {
    return catalog && Array.isArray(catalog.workers) && Array.isArray(catalog.vehicles);
  }
  async function fetchSharedCatalog() {
    const response = await fetch(`${FIREBASE_DATABASE_URL}/catalog.json`, { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo descargar la lista compartida.");
    const catalog = await response.json();
    if (!validCatalog(catalog)) return false;
    applyCatalog(catalog.workers, catalog.vehicles);
    return true;
  }
  async function signInAdmin(password) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password, returnSecureToken: true })
    });
    if (!response.ok) throw new Error("AUTH");
    const result = await response.json();
    return result.idToken;
  }
  async function saveSharedCatalog(workers, vehicles) {
    if (!adminToken) throw new Error("AUTH");
    const cleanWorkers = normalizeWorkers(workers);
    const cleanVehicles = normalizeVehicles(vehicles);
    const payload = {
      workers: cleanWorkers,
      vehicles: cleanVehicles.map(([plate, type]) => ({ plate, type }))
    };
    const response = await fetch(`${FIREBASE_DATABASE_URL}/catalog.json?auth=${encodeURIComponent(adminToken)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("SAVE");
    applyCatalog(cleanWorkers, cleanVehicles);
  }
  const writeWorkers = (workers) => saveSharedCatalog(workers, readVehicles());
  const writeVehicles = (vehicles) => saveSharedCatalog(readWorkers(), vehicles);
  const formatDate = (value) => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

  function minutesBetween(start, end) {
    if (!start || !end) return null;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes < 0) minutes += 24 * 60;
    return minutes;
  }
  function durationLabel(start, end) {
    const minutes = minutesBetween(start, end);
    if (minutes === null) return "—";
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  }
  function distanceValue(start, end) {
    if (start === "" || end === "") return null;
    return Number(end) - Number(start);
  }
  function refreshCalculations() {
    $("duration").textContent = durationLabel(fields.startTime.value, fields.endTime.value);
    const distance = distanceValue(fields.startKm.value, fields.endKm.value);
    $("distance").textContent = distance === null ? "—" : `${distance.toLocaleString("es-ES")} km`;
    $("distance").style.color = distance !== null && distance < 0 ? "#a61b1b" : "";
  }
  function todayLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  function resetForm() {
    form.reset();
    fields.id.value = "";
    fields.date.value = todayLocal();
    const lastWorker = localStorage.getItem(LAST_WORKER_KEY);
    if (lastWorker && readWorkers().includes(lastWorker)) fields.worker.value = lastWorker;
    $("formTitle").textContent = "Nueva jornada";
    $("vehicleType").textContent = "";
    $("formMessage").hidden = true;
    refreshCalculations();
  }
  function fillWorkerSelect() {
    const selected = fields.worker.value || localStorage.getItem(LAST_WORKER_KEY) || "";
    fields.worker.replaceChildren(new Option("Seleccionar trabajador…", ""));
    const workers = readWorkers();
    for (const worker of workers) fields.worker.add(new Option(worker, worker));
    if (workers.includes(selected)) fields.worker.value = selected;
  }
  function fillVehicleSelect() {
    const selected = fields.vehicle.value;
    fields.vehicle.replaceChildren(new Option("Seleccionar matrícula…", ""));
    const vehicles = readVehicles();
    for (const [plate, type] of vehicles) {
      const option = new Option(plate, plate);
      option.dataset.type = type;
      fields.vehicle.add(option);
    }
    if (vehicles.some(([plate]) => plate === selected)) fields.vehicle.value = selected;
    fields.vehicle.dispatchEvent(new Event("change"));
  }
  function fillSelects() {
    fillWorkerSelect();
    fillVehicleSelect();
  }
  function showAdminMessage(text, error = false) {
    const box = $("adminMessage");
    box.textContent = text;
    box.style.background = error ? "#fde4e4" : "#dff3e4";
    box.style.color = error ? "#8b1717" : "#155d2c";
    box.hidden = false;
  }
  function renderAdminWorkers() {
    if (!adminUnlocked) return;
    const workers = readWorkers();
    const list = $("adminWorkerList");
    list.replaceChildren();
    $("adminWorkerCount").textContent = `${workers.length} trabajadores`;
    for (const worker of workers) {
      const row = document.createElement("div");
      row.className = "admin-worker-row";
      const name = document.createElement("span");
      name.textContent = worker;
      const remove = document.createElement("button");
      remove.className = "danger-button";
      remove.type = "button";
      remove.textContent = "Quitar";
      remove.addEventListener("click", async () => {
        if (!confirm(`¿Quitar a ${worker} de la lista?`)) return;
        try {
          remove.disabled = true;
          await writeWorkers(workers.filter(item => item !== worker));
          showAdminMessage("Trabajador eliminado para todos los dispositivos.");
        } catch { showAdminMessage("No se pudo guardar. Comprueba la conexión a Internet.", true); }
        finally { remove.disabled = false; }
      });
      row.append(name, remove);
      list.append(row);
    }
  }
  function renderAdminVehicles() {
    if (!adminUnlocked) return;
    const vehicles = readVehicles();
    const list = $("adminVehicleList");
    list.replaceChildren();
    $("adminVehicleCount").textContent = `${vehicles.length} camiones`;
    for (const [plate, type] of vehicles) {
      const row = document.createElement("div");
      row.className = "admin-worker-row";
      const name = document.createElement("span");
      name.textContent = type ? `${plate} · ${type}` : plate;
      const remove = document.createElement("button");
      remove.className = "danger-button";
      remove.type = "button";
      remove.textContent = "Quitar";
      remove.addEventListener("click", async () => {
        if (!confirm(`¿Quitar el camión ${plate} de la lista?`)) return;
        try {
          remove.disabled = true;
          await writeVehicles(vehicles.filter(([itemPlate]) => itemPlate !== plate));
          showAdminMessage("Camión eliminado para todos los dispositivos.");
        } catch { showAdminMessage("No se pudo guardar. Comprueba la conexión a Internet.", true); }
        finally { remove.disabled = false; }
      });
      row.append(name, remove);
      list.append(row);
    }
  }
  function switchView(view) {
    const admin = view === "admin";
    $("workView").hidden = admin;
    $("adminView").hidden = !admin;
    $("workTabButton").classList.toggle("active", !admin);
    $("adminTabButton").classList.toggle("active", admin);
    if (admin && adminUnlocked) {
      renderAdminWorkers();
      renderAdminVehicles();
    }
    if (admin && !adminUnlocked) $("adminUser").focus();
  }
  function currentRecord() {
    return {
      id: fields.id.value || (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`),
      date: fields.date.value,
      worker: fields.worker.value,
      vehicle: fields.vehicle.value,
      vehicleType: fields.vehicle.selectedOptions[0]?.dataset.type || "",
      route: fields.route.value.trim(),
      startTime: fields.startTime.value,
      endTime: fields.endTime.value,
      startKm: Number(fields.startKm.value),
      endKm: Number(fields.endKm.value),
      notes: fields.notes.value.trim(),
      updatedAt: new Date().toISOString()
    };
  }
  function validateRecord(record) {
    if (record.endKm < record.startKm) return "Los kilómetros finales no pueden ser menores que los iniciales.";
    if (minutesBetween(record.startTime, record.endTime) === 0) return "La hora de inicio y la hora de fin no pueden ser iguales.";
    return "";
  }
  function showMessage(text, error = false) {
    const box = $("formMessage");
    box.textContent = text;
    box.style.background = error ? "#fde4e4" : "#dff3e4";
    box.style.color = error ? "#8b1717" : "#155d2c";
    box.hidden = false;
  }
  function saveRecord(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const record = currentRecord();
    const problem = validateRecord(record);
    if (problem) { showMessage(problem, true); return; }
    const records = readRecords();
    const index = records.findIndex(item => item.id === record.id);
    if (index >= 0) records[index] = record; else records.push(record);
    writeRecords(records);
    localStorage.setItem(LAST_WORKER_KEY, record.worker);
    resetForm();
    showMessage(index >= 0 ? "Parte actualizado correctamente." : "Parte guardado correctamente.");
    renderRecords();
  }
  function editRecord(id) {
    const record = readRecords().find(item => item.id === id);
    if (!record) return;
    for (const key of Object.keys(fields)) if (key in record) fields[key].value = record[key];
    fields.id.value = record.id;
    $("formTitle").textContent = "Editar jornada";
    fields.vehicle.dispatchEvent(new Event("change"));
    refreshCalculations();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function deleteRecord(id) {
    if (!confirm("¿Eliminar este parte de trabajo?")) return;
    writeRecords(readRecords().filter(item => item.id !== id));
    renderRecords();
  }
  async function shareRecord(id) {
    const r = readRecords().find(item => item.id === id);
    if (!r) return;
    const distance = r.endKm - r.startKm;
    const text = `Parte ${formatDate(r.date)}\n${r.worker}\n${r.vehicle} · ${r.route}\n${r.startTime}–${r.endTime} (${durationLabel(r.startTime, r.endTime)})\n${distance} km`;
    if (navigator.share) await navigator.share({ title: "Parte de trabajo", text }).catch(() => {});
    else await navigator.clipboard.writeText(text).then(() => alert("Parte copiado al portapapeles."));
  }
  function filteredRecords() {
    const month = $("monthFilter").value;
    return readRecords()
      .filter(item => !month || item.date.startsWith(month))
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  }
  function renderRecords() {
    const records = filteredRecords();
    const list = $("recordsList");
    list.replaceChildren();
    $("recordCount").textContent = `${records.length} ${records.length === 1 ? "registro" : "registros"}`;
    $("emptyState").hidden = records.length > 0;
    for (const record of records) {
      const card = $("recordTemplate").content.firstElementChild.cloneNode(true);
      card.dataset.id = record.id;
      card.querySelector(".record-date").textContent = formatDate(record.date);
      card.querySelector(".record-worker").textContent = record.worker;
      card.querySelector(".record-plate").textContent = record.vehicle;
      card.querySelector(".record-route").textContent = record.route;
      card.querySelector(".record-time").textContent = `${record.startTime}–${record.endTime}`;
      card.querySelector(".record-duration").textContent = durationLabel(record.startTime, record.endTime);
      card.querySelector(".record-km").textContent = `${(record.endKm - record.startKm).toLocaleString("es-ES")} km`;
      card.querySelector(".record-notes").textContent = record.notes;
      card.querySelector(".edit-record").addEventListener("click", () => editRecord(record.id));
      card.querySelector(".share-record").addEventListener("click", () => shareRecord(record.id));
      card.querySelector(".delete-record").addEventListener("click", () => deleteRecord(record.id));
      list.append(card);
    }
  }
  function exportExcel() {
    const records = filteredRecords();
    if (!records.length) { alert("No hay registros para exportar."); return; }
    XlsxExporter.download(records, `partes_trabajo_${$("monthFilter").value || "todos"}.xlsx`, minutesBetween);
  }

  initializeAccess();
  fillSelects();
  resetForm();
  renderRecords();
  fetchSharedCatalog().catch(() => {});
  form.addEventListener("submit", saveRecord);
  $("newButton").addEventListener("click", resetForm);
  [fields.startTime, fields.endTime, fields.startKm, fields.endKm].forEach(el => el.addEventListener("input", refreshCalculations));
  fields.vehicle.addEventListener("change", () => { $("vehicleType").textContent = fields.vehicle.selectedOptions[0]?.dataset.type || ""; });
  $("monthFilter").addEventListener("change", renderRecords);
  $("clearFilter").addEventListener("click", () => { $("monthFilter").value = ""; renderRecords(); });
  $("exportButton").addEventListener("click", exportExcel);
  $("workTabButton").addEventListener("click", () => switchView("work"));
  $("adminTabButton").addEventListener("click", () => switchView("admin"));
  $("adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault();
    if ($("adminUser").value.trim().toLowerCase() !== ADMIN_USER) {
      $("adminLoginError").textContent = "Usuario o clave incorrectos.";
      $("adminLoginError").hidden = false;
      $("adminPassword").value = "";
      $("adminPassword").focus();
      return;
    }
    const button = event.submitter;
    button.disabled = true;
    button.textContent = "Conectando…";
    try {
      adminToken = await signInAdmin($("adminPassword").value);
      const exists = await fetchSharedCatalog();
      if (!exists) await saveSharedCatalog(APP_DATA.workers, APP_DATA.vehicles);
      adminUnlocked = true;
      $("adminLoginError").hidden = true;
      $("adminLoginForm").hidden = true;
      $("adminManager").hidden = false;
      renderAdminWorkers();
      renderAdminVehicles();
      showAdminMessage("Listas compartidas cargadas. Los cambios se guardarán para todos.");
    } catch (error) {
      adminToken = "";
      $("adminLoginError").textContent = error.message === "AUTH" ? "Usuario o clave incorrectos." : "No se pudo conectar con las listas compartidas.";
      $("adminLoginError").hidden = false;
      $("adminPassword").value = "";
      $("adminPassword").focus();
    } finally {
      button.disabled = false;
      button.textContent = "Entrar en administración";
    }
  });
  $("adminWorkerForm").addEventListener("submit", async event => {
    event.preventDefault();
    const worker = normalizeWorker($("adminWorkerName").value);
    const workers = readWorkers();
    if (workers.includes(worker)) { showAdminMessage("Ese trabajador ya está en la lista.", true); return; }
    const button = event.submitter;
    try {
      button.disabled = true;
      await writeWorkers([...workers, worker]);
      $("adminWorkerName").value = "";
      showAdminMessage("Trabajador añadido para todos los dispositivos.");
    } catch { showAdminMessage("No se pudo guardar. Comprueba la conexión a Internet.", true); }
    finally { button.disabled = false; }
  });
  $("resetWorkersButton").addEventListener("click", async () => {
    if (!confirm("¿Restablecer la lista original de trabajadores?")) return;
    try {
      $("resetWorkersButton").disabled = true;
      await writeWorkers(APP_DATA.workers);
      showAdminMessage("Lista original de trabajadores restablecida para todos.");
    } catch { showAdminMessage("No se pudo guardar. Comprueba la conexión a Internet.", true); }
    finally { $("resetWorkersButton").disabled = false; }
  });
  $("adminVehicleForm").addEventListener("submit", async event => {
    event.preventDefault();
    const plate = normalizePlate($("adminVehiclePlate").value);
    const type = normalizeVehicleType($("adminVehicleType").value);
    const vehicles = readVehicles();
    if (!plate) { showAdminMessage("Escribe una matrícula.", true); return; }
    if (vehicles.some(([itemPlate]) => itemPlate === plate)) {
      showAdminMessage("Esa matrícula ya está en la lista.", true);
      return;
    }
    const button = event.submitter;
    try {
      button.disabled = true;
      await writeVehicles([...vehicles, [plate, type]]);
      $("adminVehiclePlate").value = "";
      $("adminVehicleType").value = "";
      showAdminMessage("Camión añadido para todos los dispositivos.");
    } catch { showAdminMessage("No se pudo guardar. Comprueba la conexión a Internet.", true); }
    finally { button.disabled = false; }
  });
  $("resetVehiclesButton").addEventListener("click", async () => {
    if (!confirm("¿Restablecer la lista original de camiones?")) return;
    try {
      $("resetVehiclesButton").disabled = true;
      await writeVehicles(APP_DATA.vehicles);
      showAdminMessage("Lista original de camiones restablecida para todos.");
    } catch { showAdminMessage("No se pudo guardar. Comprueba la conexión a Internet.", true); }
    finally { $("resetVehiclesButton").disabled = false; }
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); deferredInstallPrompt = event; $("installButton").hidden = false;
  });
  $("installButton").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null; $("installButton").hidden = true;
  });
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
})();
