import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "crm-lead-mvp");
const dataDir = path.join(__dirname, "data");
const leadsPath = path.join(dataDir, "leads.json");
const env = await loadEnv(path.join(rootDir, ".env"));
const port = Number(env.PORT || process.env.PORT || 4173);
const twoGisFields = "items.point,items.contact_groups,items.reviews,items.rubrics,items.address_name,items.full_address_name,items.name,items.external_content,items.links,items.adm_div";
const knownCityPoints = new Map([
  ["бишкек", "74.5698,42.8746"],
  ["bishkek", "74.5698,42.8746"],
  ["алматы", "76.9455,43.2389"],
  ["almaty", "76.9455,43.2389"],
  ["астана", "71.4304,51.1282"],
  ["astana", "71.4304,51.1282"],
  ["ош", "72.7985,40.5139"],
  ["osh", "72.7985,40.5139"],
]);

const statuses = new Set([
  "new",
  "need_check",
  "fit",
  "not_fit",
  "contacted",
  "replied",
  "interested",
  "call_scheduled",
  "client",
  "rejected",
  "do_not_contact",
]);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: "internal_error", message: error.message });
  }
});

server.listen(port, () => {
  console.log(`Lead CRM is running: http://localhost:${port}`);
});

async function routeApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      integrations: {
        twoGis: Boolean(env.TWO_GIS_API_KEY || process.env.TWO_GIS_API_KEY),
        openAi: Boolean(env.OPENAI_API_KEY || process.env.OPENAI_API_KEY),
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/leads") {
    const leads = filterLeads(await readLeads(), url.searchParams);
    sendJson(res, 200, leads.map(enrichLead));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/leads") {
    const body = await readJson(req);
    const lead = await upsertLead(body);
    sendJson(res, 201, enrichLead(lead));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/leads/export.csv") {
    const leads = filterLeads(await readLeads(), url.searchParams);
    sendText(res, 200, toCsv(leads.map(enrichLead)), "text/csv; charset=utf-8");
    return;
  }

  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadMatch && req.method === "GET") {
    const lead = (await readLeads()).find((item) => item.id === leadMatch[1]);
    if (!lead) return sendJson(res, 404, { error: "not_found" });
    sendJson(res, 200, enrichLead(lead));
    return;
  }

  if (leadMatch && req.method === "PATCH") {
    const body = await readJson(req);
    const lead = await updateLead(leadMatch[1], body);
    if (!lead) return sendJson(res, 404, { error: "not_found" });
    sendJson(res, 200, enrichLead(lead));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/integrations/2gis/search") {
    const body = await readJson(req);
    const leads = await searchTwoGis(body);
    sendJson(res, 200, leads.map(enrichLead));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/integrations/2gis/debug") {
    const body = await readJson(req);
    const result = await debugTwoGis(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/integrations/2gis/search-and-save") {
    const body = await readJson(req);
    const found = await searchTwoGis(body);
    const saved = [];
    for (const lead of found) {
      saved.push(await upsertLead(lead));
    }
    sendJson(res, 200, saved.map(enrichLead));
    return;
  }

  const aiMatch = url.pathname.match(/^\/api\/ai\/leads\/([^/]+)\/message$/);
  if (aiMatch && req.method === "POST") {
    const body = await readJson(req);
    const lead = (await readLeads()).find((item) => item.id === aiMatch[1]);
    if (!lead) return sendJson(res, 404, { error: "not_found" });
    const content = await generateAiMessage(lead, body.channel || "WhatsApp");
    sendJson(res, 200, { content, provider: hasOpenAiKey() ? "openai" : "local-template" });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

async function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden", "text/plain");
    return;
  }

  try {
    const file = await readFile(filePath);
    sendBuffer(res, 200, file, contentType(filePath));
  } catch {
    sendText(res, 404, "Not found", "text/plain");
  }
}

async function readLeads() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(leadsPath)) {
    await writeFile(leadsPath, "[]", "utf8");
  }
  return JSON.parse(await readFile(leadsPath, "utf8"));
}

async function writeLeads(leads) {
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${leadsPath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(leads, null, 2)}\n`, "utf8");
  await writeFile(leadsPath, `${JSON.stringify(leads, null, 2)}\n`, "utf8");
}

async function upsertLead(input) {
  const leads = await readLeads();
  const now = new Date().toISOString();
  const candidate = normalizeLead(input, now);
  const duplicateIndex = leads.findIndex((lead) => isDuplicate(lead, candidate));

  if (duplicateIndex >= 0) {
    leads[duplicateIndex] = {
      ...leads[duplicateIndex],
      ...candidate,
      id: leads[duplicateIndex].id,
      createdAt: leads[duplicateIndex].createdAt,
      updatedAt: now,
    };
    await writeLeads(leads);
    return leads[duplicateIndex];
  }

  leads.unshift(candidate);
  await writeLeads(leads);
  return candidate;
}

async function updateLead(id, patch) {
  const leads = await readLeads();
  const index = leads.findIndex((lead) => lead.id === id);
  if (index < 0) return null;

  const updated = normalizeLead({ ...leads[index], ...patch, id }, new Date().toISOString());
  updated.createdAt = leads[index].createdAt;
  leads[index] = updated;
  await writeLeads(leads);
  return updated;
}

function normalizeLead(input, now) {
  const lead = {
    id: input.id || uid(),
    source: clean(input.source || "manual").toLowerCase(),
    externalId: clean(input.externalId),
    companyName: clean(input.companyName) || "Без названия",
    niche: clean(input.niche),
    city: clean(input.city),
    phone: clean(input.phone),
    whatsapp: clean(input.whatsapp),
    instagram: clean(input.instagram),
    website: normalizeUrl(input.website),
    address: clean(input.address),
    rating: toNullableNumber(input.rating),
    reviewsCount: toNullableNumber(input.reviewsCount),
    latitude: toNullableNumber(input.latitude),
    longitude: toNullableNumber(input.longitude),
    status: statuses.has(input.status) ? input.status : "new",
    priority: clean(input.priority) || "medium",
    notes: clean(input.notes),
    lastContactDate: clean(input.lastContactDate),
    nextFollowUpDate: clean(input.nextFollowUpDate),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };

  lead.priority = priorityByScore(leadScore(lead), lead.priority);
  return lead;
}

function filterLeads(leads, params) {
  const search = clean(params.get("search")).toLowerCase();
  const city = clean(params.get("city"));
  const status = clean(params.get("status"));
  const source = clean(params.get("source"));
  const hasWebsiteFilter = params.get("hasWebsite");

  return leads.filter((lead) => {
    const haystack = [lead.companyName, lead.niche, lead.city, lead.phone, lead.whatsapp, lead.instagram, lead.website]
      .join(" ")
      .toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (city && lead.city !== city) return false;
    if (status && lead.status !== status) return false;
    if (source && lead.source !== source) return false;
    if (hasWebsiteFilter === "false" && hasWebsite(lead)) return false;
    if (hasWebsiteFilter === "true" && !hasWebsite(lead)) return false;
    return true;
  });
}

function enrichLead(lead) {
  return {
    ...lead,
    hasWebsite: hasWebsite(lead),
    leadScore: leadScore(lead),
  };
}

async function searchTwoGis({ city = "", query = "", category = "", save = false }) {
  const apiKey = env.TWO_GIS_API_KEY || process.env.TWO_GIS_API_KEY;
  const searchQuery = clean(query || category);
  if (!apiKey) {
    return demoTwoGisLeads(city, searchQuery);
  }

  const { items } = await runTwoGisSearchStrategies(city, searchQuery, apiKey, 10);
  const leads = items.map((item) => mapTwoGisItem(item, city, searchQuery));
  if (!save) return leads;

  const saved = [];
  for (const lead of leads) saved.push(await upsertLead(lead));
  return saved;
}

async function debugTwoGis({ city = "", query = "", category = "" }) {
  const apiKey = env.TWO_GIS_API_KEY || process.env.TWO_GIS_API_KEY;
  const searchQuery = clean(query || category);
  if (!apiKey) {
    return {
      ok: false,
      reason: "TWO_GIS_API_KEY is not set on backend",
      demoResults: demoTwoGisLeads(city, searchQuery).length,
    };
  }

  const result = await runTwoGisSearchStrategies(city, searchQuery, apiKey, 5);
  return {
    ok: result.attempts.some((attempt) => attempt.ok),
    city,
    cityId: result.cityId,
    query: searchQuery,
    total: result.items.length,
    attempts: result.attempts,
    firstItems: result.items.slice(0, 5).map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      subtype: item.subtype,
      address: item.address_name || item.full_address_name,
    })),
  };
}

async function runTwoGisSearchStrategies(city, searchQuery, apiKey, pageSize) {
  const cityId = city ? await resolveTwoGisCityId(city, apiKey) : "";
  const cityPoint = knownCityPoints.get(clean(city).toLowerCase()) || "";
  const fullQuery = [city, searchQuery].filter(Boolean).join(" ").trim();
  const strategies = [];

  if (cityId) {
    strategies.push({
      name: "q + city_id",
      params: { q: searchQuery || fullQuery, city_id: cityId, type: "branch", sort: "rating" },
    });
  }

  strategies.push({
    name: "full text city + query",
    params: { q: fullQuery || searchQuery, type: "branch", sort: "rating" },
  });

  if (cityPoint) {
    strategies.push({
      name: "q + location near city",
      params: { q: searchQuery || fullQuery, location: cityPoint, search_nearby: "true", type: "branch", sort: "rating" },
    });
  }

  strategies.push({
    name: "plain q without city filter",
    params: { q: searchQuery || fullQuery, type: "branch", sort: "rating" },
  });

  const seen = new Set();
  const items = [];
  const attempts = [];

  for (const strategy of strategies) {
    if (!clean(strategy.params.q)) continue;
    const { ok, response, payload, url } = await fetchTwoGisItems(apiKey, strategy.params, pageSize);
    const strategyItems = payload?.result?.items || [];
    attempts.push({
      name: strategy.name,
      ok,
      status: response.status,
      metaCode: payload?.meta?.code ?? null,
      url: maskUrlKey(url),
      total: payload?.result?.total ?? strategyItems.length,
      count: strategyItems.length,
      error: ok ? "" : payload?.meta?.error || payload,
    });

    if (!ok) continue;
    for (const item of strategyItems) {
      if (!item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
    if (items.length >= pageSize) break;
  }

  return { cityId, attempts, items: items.slice(0, pageSize) };
}

async function fetchTwoGisItems(apiKey, params, pageSize) {
  const apiUrl = new URL("https://catalog.api.2gis.com/3.0/items");
  apiUrl.searchParams.set("key", apiKey);
  apiUrl.searchParams.set("page_size", String(Math.max(1, Math.min(10, Number(pageSize) || 10))));
  apiUrl.searchParams.set("locale", env.TWO_GIS_LOCALE || process.env.TWO_GIS_LOCALE || "ru_KG");
  apiUrl.searchParams.set("fields", twoGisFields);
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value != null) apiUrl.searchParams.set(key, String(value));
  }

  const response = await fetch(apiUrl);
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 500) };
  }

  const ok = response.ok && (!payload?.meta?.code || payload.meta.code < 400);
  return { ok, response, payload, url: apiUrl.toString() };
}

async function resolveTwoGisCityId(city, apiKey) {
  const apiUrl = new URL("https://catalog.api.2gis.com/3.0/items");
  apiUrl.searchParams.set("q", city);
  apiUrl.searchParams.set("key", apiKey);
  apiUrl.searchParams.set("type", "adm_div.city");
  apiUrl.searchParams.set("page_size", "5");
  apiUrl.searchParams.set("locale", env.TWO_GIS_LOCALE || process.env.TWO_GIS_LOCALE || "ru_KG");

  const response = await fetch(apiUrl);
  if (!response.ok) return "";

  const payload = await response.json();
  const items = payload?.result?.items || [];
  const normalizedCity = city.toLowerCase();
  const cityItem =
    items.find((item) => clean(item.subtype).includes("city") && clean(item.name).toLowerCase() === normalizedCity) ||
    items.find((item) => clean(item.subtype).includes("city")) ||
    items[0];

  return clean(cityItem?.id);
}

function maskUrlKey(url) {
  const masked = new URL(url);
  if (masked.searchParams.has("key")) masked.searchParams.set("key", "***");
  return masked.toString();
}

function mapTwoGisItem(item, city, niche) {
  const contacts = extractTwoGisContacts(item);
  const website = contacts.website || extractWebsiteFromLinks(item.links) || "";
  return {
    source: "2gis",
    externalId: item.id,
    companyName: item.name || "Без названия",
    niche: item.rubrics?.[0]?.name || niche || "",
    city,
    phone: contacts.phone,
    whatsapp: contacts.whatsapp,
    instagram: contacts.instagram,
    website,
    address: item.address_name || "",
    rating: item.reviews?.general_rating || null,
    reviewsCount: item.reviews?.general_review_count || null,
    latitude: item.point?.lat ?? null,
    longitude: item.point?.lon ?? null,
    status: website ? "need_check" : "new",
    notes: "Импортировано через официальный 2GIS API.",
  };
}

function extractTwoGisContacts(item) {
  const result = { phone: "", whatsapp: "", instagram: "", website: "" };
  const groups = item.contact_groups || [];
  for (const group of groups) {
    for (const contact of group.contacts || []) {
      const value = contact.value || contact.text || "";
      const type = `${contact.type || ""} ${contact.url || ""}`.toLowerCase();
      if (!result.phone && (type.includes("phone") || /^\+?\d[\d\s()-]+$/.test(value))) result.phone = value;
      if (!result.website && (type.includes("website") || type.includes("url"))) result.website = normalizeUrl(value || contact.url);
      if (!result.whatsapp && `${value} ${contact.url}`.toLowerCase().includes("whatsapp")) result.whatsapp = value || contact.url;
      if (!result.instagram && `${value} ${contact.url}`.toLowerCase().includes("instagram")) result.instagram = value || contact.url;
    }
  }
  return result;
}

function extractWebsiteFromLinks(links = {}) {
  const values = Array.isArray(links) ? links : Object.values(links).flat();
  const found = values.find((value) => String(value?.url || value).includes("http"));
  return normalizeUrl(found?.url || found || "");
}

function demoTwoGisLeads(city, niche) {
  const safeCity = city || "Бишкек";
  const safeNiche = niche || "локальный бизнес";
  return [
    {
      source: "2gis",
      externalId: `demo-${safeCity}-${safeNiche}-1`,
      companyName: `${capitalize(safeNiche)} Pro`,
      niche: safeNiche,
      city: safeCity,
      phone: "+996 555 100 200",
      whatsapp: "https://wa.me/996555100200",
      instagram: "",
      website: "",
      address: "центр города",
      rating: 4.6,
      reviewsCount: 74,
      status: "new",
      notes: "Демо-результат. Добавьте TWO_GIS_API_KEY в .env для реального поиска.",
    },
    {
      source: "2gis",
      externalId: `demo-${safeCity}-${safeNiche}-2`,
      companyName: `${capitalize(safeNiche)} Plus`,
      niche: safeNiche,
      city: safeCity,
      phone: "+996 700 222 333",
      whatsapp: "",
      instagram: "@demo_business",
      website: "https://example.com",
      address: "деловой район",
      rating: 4.3,
      reviewsCount: 39,
      status: "need_check",
      notes: "Демо-результат. Добавьте TWO_GIS_API_KEY в .env для реального поиска.",
    },
  ];
}

async function generateAiMessage(lead, channel) {
  if (!hasOpenAiKey()) {
    return localMessage(lead, channel);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY || process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "Ты помогаешь веб-студии писать короткие, персональные и не спамные сообщения бизнесам. Пиши только готовый текст сообщения на русском.",
        },
        {
          role: "user",
          content: `Канал: ${channel}
Компания: ${lead.companyName}
Ниша: ${lead.niche || "не указана"}
Город: ${lead.city || "не указан"}
Сайт: ${lead.website || "нет сайта"}
Источник: ${lead.source}
Рейтинг: ${lead.rating || "нет данных"}
Отзывы: ${lead.reviewsCount || "нет данных"}

Сделай сообщение до 500 символов. Без давления, без обещаний результата, с мягким вопросом в конце.`,
        },
      ],
      max_output_tokens: 220,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text.slice(0, 240)}`);
  }

  const payload = await response.json();
  return payload.output_text || payload.output?.flatMap((item) => item.content || []).map((part) => part.text).join("").trim() || localMessage(lead, channel);
}

function localMessage(lead, channel) {
  const source = lead.source === "2gis" ? "в 2GIS" : lead.source === "instagram" ? "в Instagram" : "в открытых контактах";
  const websitePart = hasWebsite(lead)
    ? "заметил, что сайт можно проверить на скорость, мобильную версию и заявки"
    : "не нашел у вас отдельный сайт";
  const offer = hasWebsite(lead)
    ? "могу бесплатно отправить короткий разбор, где сайт может терять обращения"
    : "могу показать, как простой сайт с WhatsApp-кнопкой, картой и отзывами может приносить больше заявок";

  if (channel === "Звонок") {
    return `Здравствуйте, меня зовут [Ваше имя]. Нашел ${lead.companyName} ${source}: ${websitePart}. Я занимаюсь сайтами и автоматизацией заявок для локального бизнеса. ${offer}. Куда удобнее отправить короткий разбор?`;
  }

  return `Здравствуйте! Нашел ${lead.companyName} ${source}. У вас хороший бизнес${lead.rating ? ` и рейтинг ${lead.rating}` : ""}, но ${websitePart}. Я занимаюсь сайтами и автоматизацией заявок. ${offer}. Можно отправить короткий разбор?`;
}

function hasOpenAiKey() {
  return Boolean(env.OPENAI_API_KEY || process.env.OPENAI_API_KEY);
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

function priorityByScore(score, fallback = "medium") {
  if (score >= 78) return "urgent";
  if (score >= 62) return "high";
  if (score >= 40) return "medium";
  return fallback || "low";
}

function toCsv(leads) {
  const headers = ["id", "source", "companyName", "niche", "city", "phone", "whatsapp", "instagram", "website", "address", "rating", "reviewsCount", "status", "priority", "leadScore", "notes", "createdAt", "updatedAt"];
  return [headers.join(",")]
    .concat(leads.map((lead) => headers.map((key) => csvCell(lead[key] ?? "")).join(",")))
    .join("\n");
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function hasWebsite(lead) {
  return Boolean(clean(lead.website));
}

function isDuplicate(a, b) {
  const sameExternal = a.externalId && b.externalId && a.source === b.source && a.externalId === b.externalId;
  const samePhone = a.phone && b.phone && a.phone === b.phone;
  const sameInstagram = a.instagram && b.instagram && a.instagram.toLowerCase() === b.instagram.toLowerCase();
  const sameNameCity = a.companyName.toLowerCase() === b.companyName.toLowerCase() && clean(a.city).toLowerCase() === clean(b.city).toLowerCase();
  return sameExternal || samePhone || sameInstagram || sameNameCity;
}

function normalizeUrl(value) {
  const url = clean(value);
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("@")) return url;
  return `https://${url}`;
}

function toNullableNumber(value) {
  if (value === "" || value == null || Number.isNaN(Number(value))) return null;
  return Number(value);
}

function clean(value) {
  return String(value ?? "").trim();
}

function uid() {
  return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function capitalize(value) {
  const text = clean(value);
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function sendText(res, status, text, type) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function sendBuffer(res, status, buffer, type) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(buffer);
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  }[ext] || "application/octet-stream";
}

async function loadEnv(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), stripEnvQuotes(line.slice(index + 1).trim())];
        })
    );
  } catch {
    return {};
  }
}

function stripEnvQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
