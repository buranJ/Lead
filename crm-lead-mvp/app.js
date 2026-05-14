const STORAGE_KEY = "lead-crm-mvp-leads";

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

const seedLeads = [
  {
    id: "seed-1",
    source: "2gis",
    companyName: "Smile Dent",
    niche: "стоматология",
    city: "Бишкек",
    phone: "+996 555 120 404",
    whatsapp: "https://wa.me/996555120404",
    instagram: "@smiledent.kg",
    website: "",
    address: "ул. Киевская, 114",
    rating: 4.7,
    reviewsCount: 128,
    status: "new",
    priority: "high",
    notes: "Хороший рейтинг, сайта не найдено. Можно предложить сайт с онлайн-записью.",
    createdAt: "2026-05-10T10:00:00.000Z",
    updatedAt: "2026-05-10T10:00:00.000Z",
  },
  {
    id: "seed-2",
    source: "2gis",
    companyName: "Beauty Lab Bishkek",
    niche: "салон красоты",
    city: "Бишкек",
    phone: "+996 700 300 210",
    whatsapp: "https://wa.me/996700300210",
    instagram: "@beautylab_bishkek",
    website: "",
    address: "пр. Чуй, 92",
    rating: 4.8,
    reviewsCount: 87,
    status: "need_check",
    priority: "high",
    notes: "Активный Instagram, нет отдельного сайта и CRM-записи.",
    createdAt: "2026-05-11T12:00:00.000Z",
    updatedAt: "2026-05-11T12:00:00.000Z",
  },
  {
    id: "seed-3",
    source: "2gis",
    companyName: "Mebel Line",
    niche: "мебельный магазин",
    city: "Бишкек",
    phone: "+996 312 44 88 20",
    whatsapp: "",
    instagram: "@mebelline.kg",
    website: "https://mebelline.example",
    address: "ул. Льва Толстого, 19",
    rating: 4.2,
    reviewsCount: 43,
    status: "fit",
    priority: "medium",
    notes: "Есть сайт, но стоит проверить скорость, каталог и мобильную версию.",
    createdAt: "2026-05-12T09:30:00.000Z",
    updatedAt: "2026-05-12T09:30:00.000Z",
  },
  {
    id: "seed-4",
    source: "manual",
    companyName: "Cafe Mira",
    niche: "кафе",
    city: "Бишкек",
    phone: "+996 500 909 100",
    whatsapp: "https://wa.me/996500909100",
    instagram: "@cafemira.kg",
    website: "",
    address: "ул. Токтогула, 57",
    rating: 4.5,
    reviewsCount: 210,
    status: "contacted",
    priority: "medium",
    notes: "Можно предложить мини-сайт с меню, картой, доставкой и аналитикой.",
    createdAt: "2026-05-13T08:20:00.000Z",
    updatedAt: "2026-05-13T08:20:00.000Z",
  },
  {
    id: "seed-5",
    source: "instagram",
    companyName: "Remont Pro KG",
    niche: "ремонт квартир",
    city: "Бишкек",
    phone: "",
    whatsapp: "https://wa.me/996777456789",
    instagram: "@remontpro.kg",
    website: "",
    address: "",
    rating: null,
    reviewsCount: null,
    status: "new",
    priority: "medium",
    notes: "Данные внесены вручную из публичного профиля. Автоскрейпинг Instagram не используется.",
    createdAt: "2026-05-14T07:45:00.000Z",
    updatedAt: "2026-05-14T07:45:00.000Z",
  },
];

let leads = loadLeads();
let selectedLeadId = null;

function loadLeads() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedLeads));
    return [...seedLeads];
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedLeads));
    return [...seedLeads];
  }
}

function saveLeads() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

function uid() {
  return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

function hasWebsite(lead) {
  return Boolean(String(lead.website || "").trim());
}

function statusLabel(value) {
  return statuses.find(([key]) => key === value)?.[1] || value;
}

function leadScore(lead) {
  let score = 35;
  if (!hasWebsite(lead)) score += 30;
  if (Number(lead.rating) >= 4.4) score += 10;
  if (Number(lead.reviewsCount) >= 50) score += 10;
  if (lead.whatsapp || lead.phone) score += 8;
  if (lead.instagram) score += 5;
  if (lead.status === "do_not_contact" || lead.status === "not_fit") score = 0;
  if (hasWebsite(lead)) score -= 12;
  return Math.max(0, Math.min(100, score));
}

function priorityByScore(score) {
  if (score >= 78) return "urgent";
  if (score >= 62) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function upsertLead(input) {
  const now = new Date().toISOString();
  const website = normalizeUrl(input.website);
  const candidate = {
    id: input.id || uid(),
    source: input.source || "manual",
    companyName: input.companyName?.trim() || "Без названия",
    niche: input.niche?.trim() || "",
    city: input.city?.trim() || "",
    phone: input.phone?.trim() || "",
    whatsapp: input.whatsapp?.trim() || "",
    instagram: input.instagram?.trim() || "",
    website,
    address: input.address?.trim() || "",
    rating: input.rating === "" || input.rating == null ? null : Number(input.rating),
    reviewsCount: input.reviewsCount === "" || input.reviewsCount == null ? null : Number(input.reviewsCount),
    status: input.status || "new",
    priority: input.priority || "medium",
    notes: input.notes?.trim() || "",
    createdAt: input.createdAt || now,
    updatedAt: now,
  };

  candidate.priority = priorityByScore(leadScore(candidate));

  const duplicateIndex = leads.findIndex((lead) => {
    const sameName = lead.companyName.toLowerCase() === candidate.companyName.toLowerCase();
    const samePhone = candidate.phone && lead.phone === candidate.phone;
    const sameInstagram = candidate.instagram && lead.instagram.toLowerCase() === candidate.instagram.toLowerCase();
    return samePhone || sameInstagram || (sameName && lead.city.toLowerCase() === candidate.city.toLowerCase());
  });

  if (duplicateIndex >= 0) {
    leads[duplicateIndex] = { ...leads[duplicateIndex], ...candidate, id: leads[duplicateIndex].id, createdAt: leads[duplicateIndex].createdAt };
  } else {
    leads.unshift(candidate);
  }

  saveLeads();
  renderAll();
}

function filteredLeads() {
  const search = document.querySelector("#searchInput")?.value.toLowerCase() || "";
  const city = document.querySelector("#cityFilter")?.value || "";
  const status = document.querySelector("#statusFilter")?.value || "";
  const source = document.querySelector("#sourceFilter")?.value || "";
  const noWebsite = document.querySelector("#noWebsiteFilter")?.checked || false;

  return leads.filter((lead) => {
    const haystack = [lead.companyName, lead.niche, lead.city, lead.phone, lead.instagram, lead.website].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (city && lead.city !== city) return false;
    if (status && lead.status !== status) return false;
    if (source && lead.source !== source) return false;
    if (noWebsite && hasWebsite(lead)) return false;
    return true;
  });
}

function renderMetrics() {
  const total = leads.length;
  const noSite = leads.filter((lead) => !hasWebsite(lead)).length;
  const contacted = leads.filter((lead) => lead.status === "contacted").length;
  const replied = leads.filter((lead) => ["replied", "interested", "call_scheduled", "client"].includes(lead.status)).length;
  const clients = leads.filter((lead) => lead.status === "client").length;
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
}

function renderStats() {
  renderGroupedStats("#nicheStats", "niche");
  renderGroupedStats("#sourceStats", "source");
}

function renderGroupedStats(selector, key) {
  const counts = leads.reduce((acc, lead) => {
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

function renderNoWebsitePreview() {
  const rows = leads
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

function renderFilters() {
  const cities = [...new Set(leads.map((lead) => lead.city).filter(Boolean))].sort();
  const cityFilter = document.querySelector("#cityFilter");
  cityFilter.innerHTML = `<option value="">Все города</option>${cities.map((city) => `<option value="${escapeAttr(city)}">${escapeHtml(city)}</option>`).join("")}`;

  const statusOptions = `<option value="">Все статусы</option>${statuses.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}`;
  document.querySelector("#statusFilter").innerHTML = statusOptions;
  document.querySelector("#statusSelect").innerHTML = statuses.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
}

function renderLeadsTable() {
  const rows = filteredLeads()
    .map((lead) => {
      const score = leadScore(lead);
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

  const score = leadScore(lead);
  const recommendation = buildRecommendation(lead);
  container.innerHTML = `
    <div class="lead-detail-grid">
      <div>
        <div class="panel-header">
          <div>
            <h2>${escapeHtml(lead.companyName)}</h2>
            <p class="eyebrow">${escapeHtml(lead.niche || "Ниша не указана")} · ${escapeHtml(lead.city || "Город не указан")}</p>
          </div>
          <span class="pill">${score}/100</span>
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

function buildRecommendation(lead) {
  if (!hasWebsite(lead)) {
    return `У компании есть видимое присутствие в справочнике/соцсетях, но нет сайта. Лучше предложить короткий бесплатный разбор и простой сайт с заявками, WhatsApp-кнопкой, картой, отзывами и аналитикой.`;
  }

  return `У компании есть сайт. Приоритетнее предложить аудит скорости, адаптивности, SEO, формы заявок и интеграцию с CRM/WhatsApp.`;
}

function generateMessage(lead, channel = "WhatsApp") {
  if (!lead) return "";
  const intro = channel === "Звонок" ? "Здравствуйте" : "Здравствуйте!";
  const source = lead.source === "2gis" ? "в 2GIS" : lead.source === "instagram" ? "в Instagram" : "в открытых контактах";
  const noSiteText = hasWebsite(lead)
    ? "заметил, что сайт можно проверить на скорость, мобильную версию и заявки"
    : "не нашел у вас отдельный сайт";
  const offer = hasWebsite(lead)
    ? "могу бесплатно отправить короткий разбор, где сайт может терять заявки"
    : "могу показать, как простой сайт с WhatsApp-кнопкой и картой может приносить больше обращений";

  if (channel === "Звонок") {
    return `${intro}, меня зовут [Ваше имя]. Нашел ${lead.companyName} ${source}. ${noSiteText}. Я занимаюсь сайтами и автоматизацией заявок для локального бизнеса. ${offer}. Куда удобнее отправить 3-4 пункта разбора?`;
  }

  return `${intro} Нашел ${lead.companyName} ${source}. У вас хороший бизнес${lead.rating ? ` и рейтинг ${lead.rating}` : ""}, но ${noSiteText}. Я занимаюсь разработкой сайтов и автоматизацией заявок для локальных компаний. ${offer}. Можно отправить вам короткий разбор?`;
}

function renderMessageSelect() {
  const options = leads
    .map((lead) => `<option value="${lead.id}">${escapeHtml(lead.companyName)} · ${escapeHtml(lead.city || "—")}</option>`)
    .join("");
  document.querySelector("#messageLeadSelect").innerHTML = options;
}

function renderTasks() {
  const taskLeads = leads.filter((lead) => ["contacted", "replied", "interested", "call_scheduled"].includes(lead.status));
  const html = taskLeads
    .map((lead) => {
      const date = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString("ru-RU");
      return `<div class="task-row"><strong>${escapeHtml(lead.companyName)}</strong><span>Follow-up до ${date}</span></div>`;
    })
    .join("");
  document.querySelector("#tasksList").innerHTML = html || `<div class="empty-state">Нет активных follow-up задач</div>`;
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

function exportCsv() {
  const headers = ["id", "source", "companyName", "niche", "city", "phone", "whatsapp", "instagram", "website", "address", "rating", "reviewsCount", "status", "priority", "notes", "createdAt", "updatedAt"];
  const rows = [headers.join(",")].concat(
    filteredLeads().map((lead) => headers.map((key) => csvCell(lead[key] ?? "")).join(","))
  );
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lead-crm-export-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
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

function renderAll() {
  renderMetrics();
  renderStats();
  renderNoWebsitePreview();
  renderFilters();
  renderLeadsTable();
  renderLeadDetail();
  renderMessageSelect();
  renderTasks();
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

  document.querySelector("#leadForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    upsertLead(Object.fromEntries(formData.entries()));
    event.currentTarget.reset();
  });

  ["searchInput", "cityFilter", "statusFilter", "sourceFilter", "noWebsiteFilter"].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("input", renderLeadsTable);
  });

  document.body.addEventListener("click", (event) => {
    const row = event.target.closest("[data-lead-id]");
    if (row) {
      selectedLeadId = row.dataset.leadId;
      document.querySelector('[data-view="clients"]').click();
      renderLeadDetail();
    }

    if (event.target.matches("[data-filter-no-site]")) {
      document.querySelector('[data-view="clients"]').click();
      document.querySelector("#noWebsiteFilter").checked = true;
      renderLeadsTable();
    }
  });

  document.querySelector("#leadDetail").addEventListener("click", (event) => {
    const lead = leads.find((item) => item.id === selectedLeadId);
    if (!lead) return;

    if (event.target.id === "detailSaveButton") {
      lead.status = document.querySelector("#detailStatus").value;
      lead.notes = document.querySelector("#detailNotes").value;
      lead.updatedAt = new Date().toISOString();
      saveLeads();
      renderAll();
    }

    if (event.target.id === "detailGenerateButton") {
      document.querySelector('[data-view="messages"]').click();
      document.querySelector("#messageLeadSelect").value = lead.id;
      document.querySelector("#messageChannel").value = "WhatsApp";
      document.querySelector("#generatedMessage").value = generateMessage(lead, "WhatsApp");
    }

    if (event.target.id === "detailFollowUpButton") {
      lead.status = "contacted";
      lead.updatedAt = new Date().toISOString();
      saveLeads();
      renderAll();
      document.querySelector('[data-view="tasks"]').click();
    }
  });

  document.querySelector("#generateMessageButton").addEventListener("click", () => {
    const lead = leads.find((item) => item.id === document.querySelector("#messageLeadSelect").value);
    const channel = document.querySelector("#messageChannel").value;
    document.querySelector("#generatedMessage").value = generateMessage(lead, channel);
  });

  document.querySelector("#csvInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    parseCsv(text).forEach(upsertLead);
    event.target.value = "";
  });

  document.querySelector("#sampleImportButton").addEventListener("click", () => {
    seedLeads.forEach((lead) => upsertLead({ ...lead, id: undefined }));
  });

  document.querySelector("#exportButton").addEventListener("click", exportCsv);

  document.querySelector("#resetSeedButton").addEventListener("click", () => {
    leads = [...seedLeads];
    selectedLeadId = null;
    saveLeads();
    renderAll();
  });
}

bindEvents();
renderAll();
