const statuses = [
  ["new", "Новый"],
  ["need_check", "Проверить"],
  ["fit", "Подходит"],
  ["not_fit", "Не подходит"],
  ["contacted", "Написали"],
  ["replied", "Ответил"],
  ["interested", "Заинтересован"],
  ["call_scheduled", "Назначен звонок"],
  ["client", "Клиент"],
  ["rejected", "Отказ"],
  ["do_not_contact", "Не писать"],
];

let leads = [];
let selectedLeadId = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API error ${response.status}`);
  }

  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.text();
}

async function loadLeads() {
  const params = new URLSearchParams();
  const search = document.querySelector("#searchInput")?.value || "";
  const city = document.querySelector("#cityFilter")?.value || "";
  const status = document.querySelector("#statusFilter")?.value || "";
  const source = document.querySelector("#sourceFilter")?.value || "";
  const noWebsite = document.querySelector("#noWebsiteFilter")?.checked || false;

  if (search) params.set("search", search);
  if (city) params.set("city", city);
  if (status) params.set("status", status);
  if (source) params.set("source", source);
  if (noWebsite) params.set("hasWebsite", "false");

  leads = await api(`/api/leads?${params}`);
  await renderAll(true);
}

async function loadAllLeadsForStats() {
  return api("/api/leads");
}

function statusLabel(value) {
  return statuses.find(([key]) => key === value)?.[1] || value;
}

function hasWebsite(lead) {
  return Boolean(String(lead.website || "").trim());
}

async function renderMetrics() {
  const all = await loadAllLeadsForStats();
  const total = all.length;
  const noSite = all.filter((lead) => !hasWebsite(lead)).length;
  const contacted = all.filter((lead) => lead.status === "contacted").length;
  const replied = all.filter((lead) => ["replied", "interested", "call_scheduled", "client"].includes(lead.status)).length;
  const clients = all.filter((lead) => lead.status === "client").length;
  const conversion = total ? `${Math.round((clients / total) * 100)}%` : "0%";
  const metrics = [
    ["Лидов", total],
    ["Без сайта", noSite],
    ["Написали", contacted],
    ["Ответили", replied],
    ["Клиенты", clients],
    ["Конверсия", conversion],
  ];

  document.querySelector("#metricGrid").innerHTML = metrics
    .map(([label, value]) => `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></div>`)
    .join("");

  renderStats(all);
  renderNoWebsitePreview(all);
  renderFilters(all);
  renderTasks(all);
}

function renderStats(all) {
  renderGroupedStats("#nicheStats", all, "niche");
  renderGroupedStats("#sourceStats", all, "source");
}

function renderGroupedStats(selector, items, key) {
  const counts = items.reduce((acc, lead) => {
    const value = lead[key] || "Не указано";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([label, value]) => `<div class="stat-row"><strong>${escapeHtml(label)}</strong><span>${value}</span></div>`)
    .join("");

  document.querySelector(selector).innerHTML = rows || `<div class="empty-state">Пока нет данных</div>`;
}

function renderNoWebsitePreview(all) {
  const rows = all
    .filter((lead) => !hasWebsite(lead))
    .slice(0, 6)
    .map(
      (lead) => `
        <tr data-lead-id="${lead.id}">
          <td>${escapeHtml(lead.companyName)}</td>
          <td>${escapeHtml(lead.niche)}</td>
          <td>${escapeHtml(lead.city)}</td>
          <td>${lead.rating ?? "—"}</td>
          <td><span class="pill warning">${statusLabel(lead.status)}</span></td>
        </tr>
      `
    )
    .join("");

  document.querySelector("#noWebsitePreview").innerHTML = rows || `<tr><td colspan="5">Нет лидов без сайта</td></tr>`;
}

function renderFilters(all) {
  const currentCity = document.querySelector("#cityFilter").value;
  const currentStatus = document.querySelector("#statusFilter").value;
  const cities = [...new Set(all.map((lead) => lead.city).filter(Boolean))].sort();
  document.querySelector("#cityFilter").innerHTML = `<option value="">Все города</option>${cities
    .map((city) => `<option value="${escapeAttr(city)}" ${city === currentCity ? "selected" : ""}>${escapeHtml(city)}</option>`)
    .join("")}`;

  document.querySelector("#statusFilter").innerHTML = `<option value="">Все статусы</option>${statuses
    .map(([key, label]) => `<option value="${key}" ${key === currentStatus ? "selected" : ""}>${label}</option>`)
    .join("")}`;

  document.querySelector("#statusSelect").innerHTML = statuses.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
}

function renderLeadsTable() {
  const rows = leads
    .map((lead) => {
      const score = lead.leadScore ?? 0;
      const scoreClass = score >= 70 ? "" : score >= 45 ? "warning" : "danger";
      return `
        <tr data-lead-id="${lead.id}">
          <td><strong>${escapeHtml(lead.companyName)}</strong><br><span class="muted">${escapeHtml(lead.source)}</span></td>
          <td>${escapeHtml(lead.niche || "—")}</td>
          <td>${escapeHtml(lead.city || "—")}</td>
          <td>${escapeHtml(lead.phone || lead.whatsapp || lead.instagram || "—")}</td>
          <td>${hasWebsite(lead) ? `<a href="${escapeAttr(lead.website)}" target="_blank" rel="noreferrer">Есть</a>` : `<span class="pill warning">Нет сайта</span>`}</td>
          <td><span class="pill ${scoreClass}">${score}</span></td>
          <td><span class="pill">${statusLabel(lead.status)}</span></td>
        </tr>
      `;
    })
    .join("");

  document.querySelector("#leadsTable").innerHTML = rows || `<tr><td colspan="7">Лиды не найдены</td></tr>`;
}

function renderLeadDetail() {
  const container = document.querySelector("#leadDetail");
  const lead = leads.find((item) => item.id === selectedLeadId);
  if (!lead) {
    container.innerHTML = `<div class="empty-state">Выберите лида в таблице, чтобы открыть карточку.</div>`;
    return;
  }

  const recommendation = hasWebsite(lead)
    ? "У компании есть сайт. Приоритетнее предложить аудит скорости, адаптивности, SEO, формы заявок и интеграцию с CRM/WhatsApp."
    : "У компании есть видимое присутствие в справочнике/соцсетях, но нет сайта. Лучше предложить короткий бесплатный разбор и простой сайт с заявками, WhatsApp-кнопкой, картой, отзывами и аналитикой.";

  container.innerHTML = `
    <div class="lead-detail-grid">
      <div>
        <div class="panel-header">
          <div>
            <h2>${escapeHtml(lead.companyName)}</h2>
            <p class="eyebrow">${escapeHtml(lead.niche || "Ниша не указана")} · ${escapeHtml(lead.city || "Город не указан")}</p>
          </div>
          <span class="pill">${lead.leadScore ?? 0}/100</span>
        </div>
        <div class="detail-list">
          ${detailItem("Телефон", lead.phone || "—")}
          ${detailItem("WhatsApp", lead.whatsapp || "—")}
          ${detailItem("Instagram", lead.instagram || "—")}
          ${detailItem("Сайт", lead.website || "Нет сайта")}
          ${detailItem("Адрес", lead.address || "—")}
          ${detailItem("Рейтинг", lead.rating ? `${lead.rating} / ${lead.reviewsCount || 0} отзывов` : "—")}
        </div>
        <div class="legal-note"><strong>AI-анализ:</strong> ${escapeHtml(recommendation)}</div>
        <label class="full-width">
          Заметки
          <textarea id="detailNotes">${escapeHtml(lead.notes || "")}</textarea>
        </label>
      </div>
      <div class="side-actions">
        <label>
          Статус
          <select id="detailStatus">
            ${statuses.map(([key, label]) => `<option value="${key}" ${lead.status === key ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <button class="primary-button" id="detailGenerateButton">Сообщение WhatsApp</button>
        <button class="secondary-button" id="detailFollowUpButton">Создать follow-up</button>
        <button class="ghost-button" id="detailSaveButton">Сохранить изменения</button>
      </div>
    </div>
  `;
}

function detailItem(label, value) {
  return `<div class="detail-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderMessageSelect() {
  document.querySelector("#messageLeadSelect").innerHTML = leads
    .map((lead) => `<option value="${lead.id}">${escapeHtml(lead.companyName)} · ${escapeHtml(lead.city || "—")}</option>`)
    .join("");
}

function renderTasks(all = leads) {
  const taskLeads = all.filter((lead) => ["contacted", "replied", "interested", "call_scheduled"].includes(lead.status));
  const html = taskLeads
    .map((lead) => {
      const date = lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate).toLocaleDateString("ru-RU") : "ближайшие 2 дня";
      return `<div class="task-row"><strong>${escapeHtml(lead.companyName)}</strong><span>Follow-up: ${date}</span></div>`;
    })
    .join("");
  document.querySelector("#tasksList").innerHTML = html || `<div class="empty-state">Нет активных follow-up задач</div>`;
}

async function generateMessage(leadId, channel) {
  const payload = await api(`/api/ai/leads/${leadId}/message`, {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
  return payload.content;
}

async function exportCsv() {
  const params = new URLSearchParams();
  const search = document.querySelector("#searchInput")?.value || "";
  const city = document.querySelector("#cityFilter")?.value || "";
  const status = document.querySelector("#statusFilter")?.value || "";
  const source = document.querySelector("#sourceFilter")?.value || "";
  const noWebsite = document.querySelector("#noWebsiteFilter")?.checked || false;
  if (search) params.set("search", search);
  if (city) params.set("city", city);
  if (status) params.set("status", status);
  if (source) params.set("source", source);
  if (noWebsite) params.set("hasWebsite", "false");

  const response = await fetch(`/api/leads/export.csv?${params}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lead-crm-export-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const headers = rows.shift()?.map((item) => item.trim()) || [];
  return rows.map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] || "";
    });
    return item;
  });
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function renderAll(refreshStats = true) {
  if (refreshStats) await renderMetrics();
  renderLeadsTable();
  renderLeadDetail();
  renderMessageSelect();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      document.querySelectorAll(".view").forEach((section) => section.classList.remove("is-visible"));
      const target = document.querySelector(`#${view}View`);
      target.classList.add("is-visible");
      document.querySelector("#pageTitle").textContent = target.dataset.title;
    });
  });

  document.querySelector("#leadForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await api("/api/leads", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    event.currentTarget.reset();
    await loadLeads();
  });

  ["searchInput", "cityFilter", "statusFilter", "sourceFilter", "noWebsiteFilter"].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("input", loadLeads);
  });

  document.body.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-lead-id]");
    if (row) {
      selectedLeadId = row.dataset.leadId;
      document.querySelector('[data-view="clients"]').click();
      await loadLeads();
    }

    if (event.target.matches("[data-filter-no-site]")) {
      document.querySelector('[data-view="clients"]').click();
      document.querySelector("#noWebsiteFilter").checked = true;
      await loadLeads();
    }
  });

  document.querySelector("#leadDetail").addEventListener("click", async (event) => {
    const lead = leads.find((item) => item.id === selectedLeadId);
    if (!lead) return;

    if (event.target.id === "detailSaveButton") {
      await api(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: document.querySelector("#detailStatus").value,
          notes: document.querySelector("#detailNotes").value,
        }),
      });
      await loadLeads();
    }

    if (event.target.id === "detailGenerateButton") {
      document.querySelector('[data-view="messages"]').click();
      document.querySelector("#messageLeadSelect").value = lead.id;
      document.querySelector("#messageChannel").value = "WhatsApp";
      document.querySelector("#generatedMessage").value = "Генерирую через backend...";
      document.querySelector("#generatedMessage").value = await generateMessage(lead.id, "WhatsApp");
    }

    if (event.target.id === "detailFollowUpButton") {
      const next = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      await api(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "contacted",
          lastContactDate: new Date().toISOString(),
          nextFollowUpDate: next,
        }),
      });
      await loadLeads();
      document.querySelector('[data-view="tasks"]').click();
    }
  });

  document.querySelector("#generateMessageButton").addEventListener("click", async () => {
    const leadId = document.querySelector("#messageLeadSelect").value;
    const channel = document.querySelector("#messageChannel").value;
    document.querySelector("#generatedMessage").value = "Генерирую через backend...";
    document.querySelector("#generatedMessage").value = await generateMessage(leadId, channel);
  });

  document.querySelector("#csvInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    for (const item of parseCsv(text)) {
      await api("/api/leads", {
        method: "POST",
        body: JSON.stringify(item),
      });
    }
    event.target.value = "";
    await loadLeads();
  });

  document.querySelector("#twoGisForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const found = await api("/api/integrations/2gis/search-and-save", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    alert(`Найдено и сохранено лидов: ${found.length}`);
    await loadLeads();
    document.querySelector('[data-view="clients"]').click();
  });

  document.querySelector("#sampleImportButton").addEventListener("click", async () => {
    const found = await api("/api/integrations/2gis/search-and-save", {
      method: "POST",
      body: JSON.stringify({ city: "Бишкек", query: "стоматология" }),
    });
    alert(`Добавлено/обновлено лидов: ${found.length}`);
    await loadLeads();
  });

  document.querySelector("#exportButton").addEventListener("click", exportCsv);

  document.querySelector("#resetSeedButton").addEventListener("click", async () => {
    await api("/api/integrations/2gis/search-and-save", {
      method: "POST",
      body: JSON.stringify({ city: "Бишкек", query: "салон красоты" }),
    });
    await loadLeads();
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

bindEvents();
loadLeads().catch((error) => {
  document.body.innerHTML = `<pre style="padding:24px;white-space:pre-wrap">Backend error: ${escapeHtml(error.message)}\n\nЗапустите приложение командой: npm start</pre>`;
});
