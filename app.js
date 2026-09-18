(() => {
  "use strict";
  const STORAGE_KEY = "carnes-erdella-partes-v1";
  const AUTH_KEY = "carnes-erdella-autorizado-v1";
  const LAST_WORKER_KEY = "carnes-erdella-ultimo-trabajador-v1";
  const WORKERS_KEY = "carnes-erdella-trabajadores-v1";
  const ACCESS_USER = "goikola";
  const ACCESS_PASSWORD = "2828";
  const ADMIN_USER = "soraya";
  const ADMIN_PASSWORD = "649407828";
  const $ = (id) => document.getElementById(id);
  const form = $("workForm");
  const fields = {
    id: $("recordId"), date: $("date"), worker: $("worker"), vehicle: $("vehicle"),
    route: $("route"), startTime: $("startTime"), endTime: $("endTime"),
    startKm: $("startKm"), endKm: $("endKm"), notes: $("notes")
  };
  let deferredInstallPrompt = null;
  let adminUnlocked = false;

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
  function readWorkers() {
    try {
      const saved = JSON.parse(localStorage.getItem(WORKERS_KEY));
      if (Array.isArray(saved)) return [...new Set(saved.map(normalizeWorker).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    } catch {}
    return [...APP_DATA.workers];
  }
  function writeWorkers(workers) {
    localStorage.setItem(WORKERS_KEY, JSON.stringify([...new Set(workers.map(normalizeWorker).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"))));
    fillWorkerSelect();
    renderAdminWorkers();
  }
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
  function fillSelects() {
    fillWorkerSelect();
    for (const [plate, type] of APP_DATA.vehicles) {
      const option = new Option(plate, plate);
      option.dataset.type = type;
      fields.vehicle.add(option);
    }
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
      remove.addEventListener("click", () => {
        if (!confirm(`¿Quitar a ${worker} de la lista?`)) return;
        writeWorkers(workers.filter(item => item !== worker));
        showAdminMessage("Trabajador eliminado de este dispositivo.");
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
    if (admin && adminUnlocked) renderAdminWorkers();
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
  form.addEventListener("submit", saveRecord);
  $("newButton").addEventListener("click", resetForm);
  [fields.startTime, fields.endTime, fields.startKm, fields.endKm].forEach(el => el.addEventListener("input", refreshCalculations));
  fields.vehicle.addEventListener("change", () => { $("vehicleType").textContent = fields.vehicle.selectedOptions[0]?.dataset.type || ""; });
  $("monthFilter").addEventListener("change", renderRecords);
  $("clearFilter").addEventListener("click", () => { $("monthFilter").value = ""; renderRecords(); });
  $("exportButton").addEventListener("click", exportExcel);
  $("workTabButton").addEventListener("click", () => switchView("work"));
  $("adminTabButton").addEventListener("click", () => switchView("admin"));
  $("adminLoginForm").addEventListener("submit", event => {
    event.preventDefault();
    const valid = $("adminUser").value.trim().toLowerCase() === ADMIN_USER && $("adminPassword").value === ADMIN_PASSWORD;
    if (!valid) {
      $("adminLoginError").textContent = "Usuario o clave incorrectos.";
      $("adminLoginError").hidden = false;
      $("adminPassword").value = "";
      $("adminPassword").focus();
      return;
    }
    adminUnlocked = true;
    $("adminLoginError").hidden = true;
    $("adminLoginForm").hidden = true;
    $("adminManager").hidden = false;
    renderAdminWorkers();
  });
  $("adminWorkerForm").addEventListener("submit", event => {
    event.preventDefault();
    const worker = normalizeWorker($("adminWorkerName").value);
    const workers = readWorkers();
    if (workers.includes(worker)) { showAdminMessage("Ese trabajador ya está en la lista.", true); return; }
    writeWorkers([...workers, worker]);
    $("adminWorkerName").value = "";
    showAdminMessage("Trabajador añadido en este dispositivo.");
  });
  $("resetWorkersButton").addEventListener("click", () => {
    if (!confirm("¿Restablecer la lista original de trabajadores?")) return;
    localStorage.removeItem(WORKERS_KEY);
    fillWorkerSelect();
    renderAdminWorkers();
    showAdminMessage("Lista original restablecida.");
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
