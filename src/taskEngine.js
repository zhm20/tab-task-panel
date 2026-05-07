const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;
const MAX_HISTORY_RESULTS = 6000;
const STORAGE_KEY = "tabTaskPanelState";
const OVERVIEW_TIMEOUT_MS = 900;
const MAX_VISIBLE_TABS_PER_GROUP = 8;
const RECENTLY_CLOSED_MAX = 25;
const CLOSED_LOG_DAYS = 30;
const MAX_CLOSED_LOG_ITEMS = 200;
const THEME_MODES = new Set(["system", "light", "dark"]);

const FRIENDLY_HOSTS = {
  "github.com": "GitHub",
  "gist.github.com": "GitHub Gist",
  "gitlab.transspay.net": "GitLab",
  "gitee.com": "Gitee",
  "palmpay.yuque.com": "Yuque",
  "ai.palmpay-inc.com": "PalmPay AI Hub",
  "qiye.aliyun.com": "PalmPay Mail",
  "mail.google.com": "Gmail",
  "docs.google.com": "Google Docs",
  "drive.google.com": "Google Drive",
  "calendar.google.com": "Google Calendar",
  "meet.google.com": "Google Meet",
  "dms.aliyun.com": "Aliyun DMS",
  "sls.console.aliyun.com": "Aliyun SLS",
  "console.dumacredit.com": "Duma Console",
  "business.palmpay.com": "PalmPay Business",
  "cratos.palmpay-inc.com": "CRATOS",
  "devops.palmpay-inc.com": "PalmPay Devops",
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "chat.deepseek.com": "DeepSeek",
  "cursor.com": "Cursor",
  "x.com": "X",
  "twitter.com": "X",
  "www.youtube.com": "YouTube",
  "youtube.com": "YouTube",
  "music.youtube.com": "YouTube Music",
  "www.linkedin.com": "LinkedIn",
  "linkedin.com": "LinkedIn",
  "reddit.com": "Reddit",
  "old.reddit.com": "Reddit",
  "stackoverflow.com": "Stack Overflow",
  "developer.mozilla.org": "MDN",
  "vercel.com": "Vercel",
  "localhost": "Localhost",
  "local-file": "Local Files"
};

const DEFAULT_LANDING_PAGE_RULES = [
  {
    host: "mail.google.com",
    test: (url) => !url.hash.startsWith("#inbox/") && !url.hash.startsWith("#sent/") && !url.hash.startsWith("#search/")
  },
  { host: "x.com", paths: ["/home"] },
  { host: "twitter.com", paths: ["/home"] },
  { host: "www.linkedin.com", paths: ["/"] },
  { host: "github.com", paths: ["/"] },
  { host: "chatgpt.com", paths: ["/"] },
  { host: "chat.openai.com", paths: ["/"] },
  { host: "www.youtube.com", paths: ["/"] },
  { host: "youtube.com", paths: ["/"] }
];

export async function buildDashboard({ includeOverviews = true } = {}) {
  const [rawTabs, historyItems, state] = await Promise.all([
    chrome.tabs.query({}),
    readHistory(),
    readState()
  ]);

  const extensionInfo = getExtensionInfo();
  const { realTabs, panelTabs } = normalizeTabs(rawTabs, extensionInfo);
  const panelDuplicateTabIds = duplicatePanelTabIds(panelTabs);
  const historyStats = buildHistoryStats(historyItems);
  const [overviewByTabId, closedItems] = await Promise.all([
    includeOverviews ? readPageOverviews(realTabs) : new Map(),
    readClosedHistory(state)
  ]);
  const groups = groupTabs(realTabs, historyStats, overviewByTabId, state);
  const saved = splitSavedItems(state);
  const duplicateCount = groups.reduce((sum, group) => sum + group.duplicateCount, 0);
  const selectedCount = Object.values(state.selected || {}).filter(Boolean).length;

  const summary = {
    generatedAt: Date.now(),
    openTabCount: realTabs.length,
    domainCount: groups.length,
    duplicateCount,
    selectedCount,
    savedCount: saved.active.length,
    archivedCount: saved.archived.length,
    closedCount: closedItems.length,
    historyItemCount: historyItems.length,
    panelTabCount: panelTabs.length,
    panelDuplicateCount: panelDuplicateTabIds.length,
    panelDuplicateTabIds,
    badgeColor: badgeColor(realTabs.length)
  };

  return { groups, savedItems: saved.active, archivedItems: saved.archived, closedItems, summary, state };
}

export async function buildBadgeSummary() {
  const tabs = await chrome.tabs.query({});
  const extensionInfo = getExtensionInfo();
  const { realTabs } = normalizeTabs(tabs, extensionInfo);
  return {
    openTabCount: realTabs.length,
    badgeColor: badgeColor(realTabs.length)
  };
}

export async function readState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeState(stored[STORAGE_KEY]);
}

export async function readThemePreference() {
  const state = await readState();
  return state.theme;
}

export async function setThemePreference(theme) {
  const state = await readState();
  state.theme = THEME_MODES.has(theme) ? theme : "system";
  await writeState(state);
  return state.theme;
}

export async function toggleTabSelected(tabId, selected) {
  const state = await readState();
  state.selected[String(tabId)] = selected;
  await writeState(state);
  return state;
}

export async function clearSelection() {
  const state = await readState();
  state.selected = {};
  await writeState(state);
  return state;
}

export async function saveTabForLater(tab) {
  const state = await readState();
  state.deferred.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: tab.url,
    safeUrl: tab.safeUrl,
    title: tab.title,
    host: tab.host,
    hostLabel: tab.hostLabel,
    faviconUrl: tab.faviconUrl,
    overview: tab.overview,
    savedAt: new Date().toISOString(),
    completed: false,
    dismissed: false
  });
  state.selected[String(tab.tabId)] = false;
  await writeState(state);
  return state;
}

export async function saveTabForLaterAndClose(tab) {
  await saveTabForLater(tab);
  await closeTabs([tab.tabId]);
}

export async function checkSavedItem(id) {
  const state = await readState();
  const item = state.deferred.find((entry) => entry.id === id);
  if (item) {
    item.completed = true;
    item.completedAt = new Date().toISOString();
    await writeState(state);
  }
  return state;
}

export async function dismissSavedItem(id) {
  const state = await readState();
  const item = state.deferred.find((entry) => entry.id === id);
  if (item) {
    item.dismissed = true;
    item.dismissedAt = new Date().toISOString();
    await writeState(state);
  }
  return state;
}

export async function closeTabs(tabIds, options = {}) {
  const ids = tabIds.map(Number).filter((id) => Number.isFinite(id));
  if (!ids.length) return;
  const state = await readState();
  if (!options.skipClosedLog && Array.isArray(options.tabs) && options.tabs.length) {
    appendClosedLog(state, options.tabs, options.reason || "closed");
    await writeState(state);
  }
  await chrome.tabs.remove(ids);
  for (const id of ids) delete state.selected[String(id)];
  await writeState(state);
}

export async function restoreClosedItem(id) {
  if (!id) return null;
  if (id.startsWith("session:")) {
    const sessionId = id.slice("session:".length);
    if (!sessionId) return null;
    return chrome.sessions?.restore ? chrome.sessions.restore(sessionId) : null;
  }

  const state = await readState();
  const item = state.closedLog.find((entry) => entry.id === id);
  if (!item?.safeUrl || !chrome.tabs?.create) return null;
  return chrome.tabs.create({ url: item.safeUrl });
}

export async function dismissClosedItem(id) {
  if (!id) return;
  const state = await readState();
  state.closedDismissed[id] = new Date().toISOString();
  state.closedLog = state.closedLog.filter((entry) => entry.id !== id);
  pruneClosedState(state);
  await writeState(state);
}

export async function focusTab(tabId, windowId) {
  const numericWindowId = Number(windowId);
  const numericTabId = Number(tabId);
  if (Number.isFinite(numericWindowId)) {
    await chrome.windows.update(numericWindowId, { focused: true });
  }
  if (Number.isFinite(numericTabId)) {
    await chrome.tabs.update(numericTabId, { active: true });
  }
}

export async function setBadgeCount(count, color = badgeColor(count)) {
  if (!chrome.action) return;
  await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : "" });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

function writeState(state) {
  return chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function readHistory() {
  if (!chrome.history) return [];
  const startTime = Date.now() - HISTORY_DAYS * DAY_MS;
  const items = await chrome.history.search({
    text: "",
    startTime,
    maxResults: MAX_HISTORY_RESULTS
  });
  return items.map(normalizeHistoryItem).filter(Boolean);
}

function normalizeState(raw) {
  const state = {
    selected: {},
    deferred: [],
    closedLog: [],
    closedDismissed: {},
    theme: "system"
  };

  if (!raw || typeof raw !== "object") return state;
  if (raw.selected && typeof raw.selected === "object") state.selected = raw.selected;
  if (THEME_MODES.has(raw.theme)) state.theme = raw.theme;
  if (Array.isArray(raw.closedLog)) state.closedLog = raw.closedLog.map(normalizeClosedLogItem).filter(Boolean);
  if (raw.closedDismissed && typeof raw.closedDismissed === "object") state.closedDismissed = raw.closedDismissed;

  if (Array.isArray(raw.deferred)) {
    state.deferred = raw.deferred;
  } else if (raw.saved && typeof raw.saved === "object") {
    state.deferred = Object.values(raw.saved).map((item, index) => ({
      id: `${item.savedAt || Date.now()}-${index}`,
      url: item.url || item.safeUrl,
      safeUrl: item.safeUrl || item.url,
      title: item.title,
      host: item.host,
      hostLabel: item.hostLabel,
      faviconUrl: item.faviconUrl,
      overview: item.overview,
      savedAt: new Date(item.savedAt || Date.now()).toISOString(),
      completed: false,
      dismissed: false
    }));
  }

  pruneClosedState(state);
  return state;
}

function splitSavedItems(state) {
  const visible = state.deferred.filter((item) => !item.dismissed);
  return {
    active: visible.filter((item) => !item.completed).sort(sortSavedDesc),
    archived: visible.filter((item) => item.completed).sort(sortCompletedDesc)
  };
}

async function readClosedHistory(state) {
  const [sessionItems, localItems] = await Promise.all([
    readRecentlyClosedSessions(),
    Promise.resolve(normalizedClosedLog(state))
  ]);
  const sessionSignatures = new Set(sessionItems.map((item) => item.signature).filter(Boolean));
  const merged = [
    ...sessionItems,
    ...localItems.filter((item) => !sessionSignatures.has(item.signature) && !state.closedDismissed[item.id])
  ];
  return merged
    .filter((item) => !state.closedDismissed[item.id])
    .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
}

async function readRecentlyClosedSessions() {
  if (!chrome.sessions?.getRecentlyClosed) return [];
  try {
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: RECENTLY_CLOSED_MAX });
    return sessions.map((session, index) => normalizeClosedSession(session, index)).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeClosedSession(session, index) {
  const closedAt = new Date((session.lastModified || Date.now() / 1000) * 1000).toISOString();
  if (session.tab) {
    const item = normalizeClosedSessionTab(session.tab, closedAt);
    return item ? { ...item, sortIndex: index } : null;
  }
  if (session.window) {
    return normalizeClosedSessionWindow(session.window, closedAt, index);
  }
  return null;
}

function normalizeClosedSessionTab(tab, closedAt) {
  const normalized = normalizeUrl(tab.url);
  if (!normalized) return null;
  const title = displayTitle(tab.title, tab.url, normalized.host);
  return {
    id: `session:${tab.sessionId}`,
    sessionId: tab.sessionId,
    kind: "tab",
    source: "Chrome",
    title,
    safeUrl: normalized.safeUrl,
    host: normalized.host,
    hostLabel: labelHost(normalized.host),
    faviconUrl: tab.favIconUrl || faviconForHost(normalized),
    overview: fallbackOverview({ ...normalized, title }),
    closedAt,
    signature: normalized.canonicalSignature,
    restorable: Boolean(tab.sessionId)
  };
}

function normalizeClosedSessionWindow(windowSession, closedAt, index) {
  const tabs = Array.isArray(windowSession.tabs)
    ? windowSession.tabs.map((tab) => normalizeClosedSessionTab(tab, closedAt)).filter(Boolean)
    : [];
  if (!tabs.length && !windowSession.sessionId) return null;
  const firstTab = tabs[0];
  const count = tabs.length || Number(windowSession.tabs?.length || 0);
  return {
    id: `session:${windowSession.sessionId || `window-${index}`}`,
    sessionId: windowSession.sessionId,
    kind: "window",
    source: "Chrome",
    title: `窗口 · ${count} tabs`,
    safeUrl: firstTab?.safeUrl || "",
    host: firstTab?.host || "",
    hostLabel: firstTab?.hostLabel || "Chrome Window",
    faviconUrl: firstTab?.faviconUrl || "",
    overview: {
      title: `窗口 · ${count} tabs`,
      heading: "",
      description: tabs.slice(0, 3).map((tab) => tab.title).join(" / ") || "Recently closed window"
    },
    closedAt,
    signature: `window:${windowSession.sessionId || index}`,
    restorable: Boolean(windowSession.sessionId)
  };
}

function normalizedClosedLog(state) {
  return state.closedLog
    .map(normalizeClosedLogItem)
    .filter(Boolean)
    .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
}

function normalizeClosedLogItem(item) {
  if (!item || typeof item !== "object") return null;
  const normalized = normalizeUrl(item.safeUrl);
  if (!normalized) return null;
  const closedAt = new Date(item.closedAt || Date.now()).toISOString();
  const title = displayTitle(item.title, item.safeUrl, normalized.host);
  return {
    id: item.id || `${closedAt}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "tab",
    source: "Panel",
    title,
    safeUrl: normalized.safeUrl,
    host: normalized.host,
    hostLabel: item.hostLabel || labelHost(normalized.host),
    faviconUrl: item.faviconUrl || faviconForHost(normalized),
    overview: item.overview || fallbackOverview({ ...normalized, title }),
    closedAt,
    reason: item.reason || "closed",
    signature: normalized.canonicalSignature,
    restorable: true
  };
}

function appendClosedLog(state, tabs, reason) {
  const entries = tabs.map((tab) => closedLogEntry(tab, reason)).filter(Boolean);
  if (!entries.length) return;
  state.closedLog = [...entries, ...state.closedLog];
  pruneClosedState(state);
}

function closedLogEntry(tab, reason) {
  const normalized = normalizeUrl(tab.safeUrl || tab.url);
  if (!normalized) return null;
  const title = displayTitle(tab.title, normalized.safeUrl, normalized.host);
  return {
    id: `${Date.now()}-${tab.tabId || Math.random().toString(36).slice(2, 8)}`,
    title,
    safeUrl: normalized.safeUrl,
    host: normalized.host,
    hostLabel: tab.hostLabel || labelHost(normalized.host),
    faviconUrl: tab.faviconUrl || faviconForHost(normalized),
    overview: tab.overview || fallbackOverview({ ...normalized, title }),
    closedAt: new Date().toISOString(),
    reason,
    source: "Panel"
  };
}

function pruneClosedState(state) {
  const cutoff = Date.now() - CLOSED_LOG_DAYS * DAY_MS;
  state.closedLog = (state.closedLog || [])
    .map(normalizeClosedLogItem)
    .filter((item) => new Date(item.closedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())
    .slice(0, MAX_CLOSED_LOG_ITEMS);

  const dismissed = {};
  for (const [id, dismissedAt] of Object.entries(state.closedDismissed || {})) {
    const time = new Date(dismissedAt).getTime();
    if (!time || time >= cutoff) dismissed[id] = dismissedAt;
  }
  state.closedDismissed = dismissed;
}

function sortSavedDesc(a, b) {
  return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
}

function sortCompletedDesc(a, b) {
  return new Date(b.completedAt || b.savedAt).getTime() - new Date(a.completedAt || a.savedAt).getTime();
}

function getExtensionInfo() {
  const extensionId = chrome.runtime?.id || "";
  return {
    extensionId,
    newtabUrl: extensionId ? `chrome-extension://${extensionId}/newtab.html` : ""
  };
}

function normalizeTabs(rawTabs, extensionInfo) {
  const realTabs = [];
  const panelTabs = [];

  for (const tab of rawTabs) {
    if (isPanelTab(tab, extensionInfo)) {
      panelTabs.push(tab);
      continue;
    }
    const normalized = normalizeTab(tab);
    if (normalized) realTabs.push(normalized);
  }

  return { realTabs, panelTabs };
}

function isPanelTab(tab, extensionInfo) {
  const url = tab.url || "";
  return Boolean(extensionInfo.newtabUrl && url === extensionInfo.newtabUrl);
}

function duplicatePanelTabIds(panelTabs) {
  if (panelTabs.length <= 1) return [];
  const keep = panelTabs.find((tab) => tab.active) || panelTabs[0];
  return panelTabs.filter((tab) => tab.id !== keep.id).map((tab) => tab.id);
}

function normalizeHistoryItem(item) {
  const normalized = normalizeUrl(item.url);
  if (!normalized) return null;
  return {
    title: displayTitle(item.title, item.url, normalized.host),
    visitCount: Number(item.visitCount || 0),
    lastVisitTime: Number(item.lastVisitTime || 0),
    ...normalized
  };
}

function normalizeTab(tab) {
  const normalized = normalizeUrl(tab.url);
  if (!normalized) return null;
  const title = displayTitle(tab.title, tab.url, normalized.host);
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible),
    muted: Boolean(tab.mutedInfo?.muted),
    url: tab.url || "",
    title,
    rawTitle: tab.title || "",
    faviconUrl: tab.favIconUrl || faviconForHost(normalized),
    ...normalized
  };
}

function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (!isRealWebUrl(rawUrl)) return null;

  try {
    const url = new URL(rawUrl);
    const host = url.protocol === "file:" ? "local-file" : url.hostname.replace(/^www\./, "").toLowerCase();
    const path = sanitizePath(url.pathname);
    const safeUrl = url.protocol === "file:" ? `file://${path}` : `${url.origin}${path}`;
    const exactSignature = rawUrl;
    const canonicalSignature = `${host}${path}`.replace(/\/$/, "");

    return {
      host,
      domainKey: domainForHost(host),
      path,
      safeUrl,
      exactSignature,
      canonicalSignature,
      protocol: url.protocol,
      port: url.port
    };
  } catch {
    return null;
  }
}

function isRealWebUrl(url) {
  return (
    (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://")) &&
    !url.startsWith("chrome-extension://")
  );
}

function buildHistoryStats(items) {
  const stats = new Map();
  for (const item of items) {
    const current = stats.get(item.groupKey || item.host) || {
      visitCount: 0,
      latest: 0
    };
    current.visitCount += Math.max(1, item.visitCount || 1);
    current.latest = Math.max(current.latest, item.lastVisitTime || 0);
    stats.set(item.groupKey || item.host, current);
    stats.set(item.domainKey, current);
  }
  return stats;
}

async function readPageOverviews(tabs) {
  const entries = await Promise.all(
    tabs.map(async (tab) => {
      const overview = await withTimeout(extractOverview(tab), OVERVIEW_TIMEOUT_MS, fallbackOverview(tab));
      return [tab.tabId, overview];
    })
  );
  return new Map(entries);
}

async function extractOverview(tab) {
  if (!chrome.scripting || tab.protocol !== "http:" && tab.protocol !== "https:") {
    return fallbackOverview(tab);
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.tabId },
      func: extractOverviewFromPage
    });
    return sanitizeOverview(result?.result, tab) || fallbackOverview(tab);
  } catch {
    return fallbackOverview(tab);
  }
}

function extractOverviewFromPage() {
  const pick = (selector, attr) => {
    const node = document.querySelector(selector);
    if (!node) return "";
    return attr ? node.getAttribute(attr) || "" : node.textContent || "";
  };
  const title = document.title || "";
  const description =
    pick('meta[name="description"]', "content") ||
    pick('meta[property="og:description"]', "content") ||
    pick("h1") ||
    pick("main") ||
    pick("article") ||
    document.body?.innerText ||
    "";

  return {
    title,
    description,
    heading: pick("h1"),
    lang: document.documentElement.lang || ""
  };
}

function groupTabs(tabs, historyStats, overviewByTabId, state) {
  const groupMap = new Map();
  const landingTabs = [];

  for (const tab of tabs) {
    const customRule = matchCustomGroup(tab.url);
    let key;
    let title;
    let closeMode = "domain";
    let priority = 10;

    if (isLandingPage(tab.url)) {
      landingTabs.push(tab);
      continue;
    } else if (customRule) {
      key = customRule.groupKey;
      title = customRule.groupLabel || labelDomain(customRule.groupKey);
      closeMode = "exact";
      priority = customRule.priority ?? 2;
    } else {
      key = tab.host === "localhost" && tab.port ? `localhost:${tab.port}` : tab.host;
      title = labelDomain(key);
    }

    addTabToGroup(groupMap, { key, title, closeMode, priority }, tab, historyStats, overviewByTabId, state);
  }

  if (landingTabs.length) {
    for (const tab of landingTabs) {
      addTabToGroup(
        groupMap,
        { key: "__homepages__", title: "Homepages", closeMode: "exact", priority: 0 },
        tab,
        historyStats,
        overviewByTabId,
        state
      );
    }
  }

  return [...groupMap.values()]
    .map(finalizeGroup)
    .sort((a, b) => a.priority - b.priority || b.tabCount - a.tabCount || b.historyVisitCount - a.historyVisitCount || a.title.localeCompare(b.title));
}

function addTabToGroup(groupMap, groupInfo, tab, historyStats, overviewByTabId, state) {
  if (!groupMap.has(groupInfo.key)) {
    groupMap.set(groupInfo.key, {
      id: groupInfo.key,
      title: groupInfo.title,
      closeMode: groupInfo.closeMode,
      priority: groupInfo.priority,
      hostLabels: new Set(),
      tabs: [],
      historyVisitCount: historyStats.get(groupInfo.key)?.visitCount || historyStats.get(tab.host)?.visitCount || historyStats.get(tab.domainKey)?.visitCount || 0
    });
  }

  const group = groupMap.get(groupInfo.key);
  group.hostLabels.add(tab.host === "localhost" && tab.port ? `localhost:${tab.port}` : labelHost(tab.host));
  group.tabs.push({
    ...tab,
    hostLabel: labelHost(tab.host),
    overview: overviewByTabId.get(tab.tabId) || fallbackOverview(tab),
    selected: Boolean(state.selected[String(tab.tabId)])
  });
}

function finalizeGroup(group) {
  const exactDuplicateMap = new Map();
  const canonicalDuplicateMap = new Map();
  const titleDuplicateMap = new Map();

  for (const tab of group.tabs) {
    addToMapList(exactDuplicateMap, tab.exactSignature, tab);
    addToMapList(canonicalDuplicateMap, tab.canonicalSignature, tab);
    addToMapList(titleDuplicateMap, `${tab.host}:${tab.title.toLowerCase()}`, tab);
  }

  const duplicateTabIds = new Set();
  const duplicateGroups = [];
  collectDuplicateIds(exactDuplicateMap, duplicateTabIds, duplicateGroups, "exact");
  collectDuplicateIds(canonicalDuplicateMap, duplicateTabIds, duplicateGroups, "canonical");
  collectDuplicateIds(titleDuplicateMap, duplicateTabIds, duplicateGroups, "title");

  const duplicateCountByCanonical = new Map();
  for (const tabs of exactDuplicateMap.values()) {
    if (tabs.length > 1) {
      duplicateCountByCanonical.set(tabs[0].canonicalSignature, tabs.length);
    }
  }
  for (const tabs of canonicalDuplicateMap.values()) {
    if (tabs.length > 1 && !duplicateCountByCanonical.has(tabs[0].canonicalSignature)) {
      duplicateCountByCanonical.set(tabs[0].canonicalSignature, tabs.length);
    }
  }

  const seenCanonical = new Set();
  const uniqueTabs = [];
  for (const tab of sortTabs(group.tabs)) {
    if (seenCanonical.has(tab.canonicalSignature)) continue;
    seenCanonical.add(tab.canonicalSignature);
    uniqueTabs.push({
      ...tab,
      duplicateCount: duplicateCountByCanonical.get(tab.canonicalSignature) || 1
    });
  }

  return {
    ...group,
    tabCount: group.tabs.length,
    uniqueCount: uniqueTabs.length,
    visibleTabs: uniqueTabs.slice(0, MAX_VISIBLE_TABS_PER_GROUP),
    hiddenTabs: uniqueTabs.slice(MAX_VISIBLE_TABS_PER_GROUP),
    duplicateCount: duplicateTabIds.size,
    duplicateTabIds: [...duplicateTabIds],
    duplicateGroups,
    hostLabels: [...group.hostLabels].slice(0, 4),
    hasPinned: group.tabs.some((tab) => tab.pinned),
    hasAudible: group.tabs.some((tab) => tab.audible)
  };
}

function addToMapList(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function collectDuplicateIds(map, duplicateIds, duplicateGroups, reason) {
  for (const tabs of map.values()) {
    if (tabs.length <= 1) continue;
    const keep = tabs.find((tab) => tab.active) || tabs[0];
    const extras = tabs.filter((tab) => tab.tabId !== keep.tabId);
    for (const tab of extras) duplicateIds.add(tab.tabId);
    duplicateGroups.push({
      reason,
      keepTabId: keep.tabId,
      tabIds: tabs.map((tab) => tab.tabId),
      extraTabIds: extras.map((tab) => tab.tabId)
    });
  }
}

function sortTabs(tabs) {
  return [...tabs].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.audible !== b.audible) return a.audible ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

function isLandingPage(rawUrl) {
  const url = safeUrlObject(rawUrl);
  if (!url) return false;
  const rules = [...DEFAULT_LANDING_PAGE_RULES, ...localLandingPageRules()];
  return rules.some((rule) => {
    if (rule.host && url.hostname !== rule.host) return false;
    if (rule.hostEndsWith && !url.hostname.endsWith(rule.hostEndsWith)) return false;
    if (typeof rule.test === "function") return rule.test(url, rawUrl);
    if (rule.pathPrefix) return url.pathname.startsWith(rule.pathPrefix);
    if (rule.paths) return rule.paths.includes(url.pathname);
    return url.pathname === "/";
  });
}

function matchCustomGroup(rawUrl) {
  const url = safeUrlObject(rawUrl);
  if (!url) return null;
  return localCustomGroups().find((rule) => {
    if (rule.host && url.hostname !== rule.host) return false;
    if (rule.hostEndsWith && !url.hostname.endsWith(rule.hostEndsWith)) return false;
    if (rule.pathPrefix && !url.pathname.startsWith(rule.pathPrefix)) return false;
    return true;
  }) || null;
}

function localLandingPageRules() {
  return Array.isArray(globalThis.LOCAL_LANDING_PAGE_PATTERNS) ? globalThis.LOCAL_LANDING_PAGE_PATTERNS : [];
}

function localCustomGroups() {
  return Array.isArray(globalThis.LOCAL_CUSTOM_GROUPS) ? globalThis.LOCAL_CUSTOM_GROUPS : [];
}

function safeUrlObject(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function sanitizePath(pathname) {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .filter((part) => !looksSensitive(part))
    .slice(0, 5)
    .map((part) => encodeURIComponent(decodeSafe(part)).replace(/%2F/gi, "/"));
  return `/${parts.join("/")}`;
}

function decodeSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function looksSensitive(value) {
  const decoded = decodeSafe(value).toLowerCase();
  return (
    decoded.length > 80 ||
    /(token|code|secret|password|verify|verification|oauth|callback|session|jwt|id_token|access_token)/i.test(decoded) ||
    /^[a-f0-9]{24,}$/i.test(decoded) ||
    /^[A-Za-z0-9_-]{40,}$/.test(decoded)
  );
}

function stripTitleNoise(title) {
  return String(title || "")
    .replace(/^\(\d+\+?\)\s*/, "")
    .replace(/\(\d+封未读邮件\)/g, "")
    .replace(/\s*\([\d,]+\+?\)\s*/g, " ")
    .replace(/\s*[-‐-―]\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "")
    .replace(/\s+on X:\s*/, ": ")
    .replace(/\s*\/\s*X\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title, host) {
  let cleaned = stripTitleNoise(title);
  if (!cleaned || !host) return cleaned;

  const friendly = labelHost(host).toLowerCase();
  const domain = host.replace(/^www\./, "").toLowerCase();
  for (const sep of [" - ", " | ", " — ", " · ", " – "]) {
    const idx = cleaned.lastIndexOf(sep);
    if (idx === -1) continue;
    const suffix = cleaned.slice(idx + sep.length).trim().toLowerCase();
    if (
      suffix === domain ||
      suffix === friendly ||
      domain.includes(suffix) ||
      friendly.includes(suffix)
    ) {
      const candidate = cleaned.slice(0, idx).trim();
      if (candidate.length >= 3) return candidate;
    }
  }
  return cleaned;
}

function displayTitle(rawTitle, rawUrl, host) {
  const cleaned = cleanTitle(rawTitle, host);
  if (isSensitiveTitle(cleaned)) return `${labelHost(host)} 临时验证页面`;
  return smartTitle(cleaned, rawUrl) || labelHost(host);
}

function smartTitle(title, rawUrl) {
  const url = safeUrlObject(rawUrl);
  if (!url) return title;
  const hostname = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const titleIsUrl = !title || title === rawUrl || title.startsWith(hostname) || title.startsWith("http");

  if ((hostname === "x.com" || hostname === "twitter.com") && parts[1] === "status") {
    return titleIsUrl && parts[0] ? `Post by @${parts[0]}` : title;
  }

  if (hostname === "github.com" && parts.length >= 2) {
    const [owner, repo, kind, id, ...rest] = parts;
    if (kind === "issues" && id) return `${owner}/${repo} Issue #${id}`;
    if (kind === "pull" && id) return `${owner}/${repo} PR #${id}`;
    if (kind === "blob" || kind === "tree") return `${owner}/${repo} - ${rest.join("/") || kind}`;
    if (titleIsUrl) return `${owner}/${repo}`;
  }

  if ((hostname === "youtube.com" || hostname === "www.youtube.com") && url.pathname === "/watch" && titleIsUrl) {
    return "YouTube Video";
  }

  if ((hostname === "reddit.com" || hostname === "old.reddit.com") && parts.includes("comments")) {
    const subIndex = parts.indexOf("r");
    if (titleIsUrl && subIndex !== -1 && parts[subIndex + 1]) return `r/${parts[subIndex + 1]} post`;
  }

  if (hostname === "localhost" && url.port) {
    return `${url.port} ${title || "Local app"}`;
  }

  return title;
}

function isSensitiveTitle(title) {
  return /(temporary .*code|verification .*code|login .*code|otp|password reset|reset password|验证码|临时验证码|密码重置|重置密码|输入密码|检查您的收件箱|收件箱验证码)/i.test(title || "");
}

function sanitizeOverview(raw, tab) {
  if (!raw || typeof raw !== "object") return null;
  const description = summarizeText(raw.description || raw.heading || "");
  return {
    title: displayTitle(raw.title || tab.title, tab.url, tab.host),
    heading: summarizeText(raw.heading || "", 90),
    description: description || fallbackOverview(tab).description
  };
}

function fallbackOverview(tab) {
  return {
    title: tab.title,
    heading: "",
    description: `${tab.host === "localhost" && tab.port ? `localhost:${tab.port}` : labelHost(tab.host)} - ${tab.path === "/" ? "homepage or app entry" : tab.path}`
  };
}

function summarizeText(text, maxLength = 150) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function domainForHost(host) {
  if (host === "local-file" || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const suffix2 = parts.slice(-2).join(".");
  const suffix3 = parts.slice(-3).join(".");
  if (/^(com|net|org|co|ac|gov)\.[a-z]{2}$/i.test(suffix2)) return suffix3;
  return suffix2;
}

function labelDomain(domain) {
  if (domain === "__homepages__") return "Homepages";
  if (domain.startsWith("localhost:")) return domain;
  return labelHost(domain);
}

function labelHost(host) {
  if (!host) return "Page";
  if (FRIENDLY_HOSTS[host]) return FRIENDLY_HOSTS[host];
  if (host.endsWith(".substack.com") && host !== "substack.com") {
    return `${capitalize(host.replace(".substack.com", ""))}'s Substack`;
  }
  if (host.endsWith(".github.io")) {
    return `${capitalize(host.replace(".github.io", ""))} (GitHub Pages)`;
  }
  return host
    .replace(/^www\./, "")
    .replace(/\.(com|org|net|io|co|ai|dev|app|so|me|xyz|info|cn|us|uk)$/, "")
    .split(".")
    .map(capitalize)
    .join(" ");
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function faviconForHost(normalized) {
  if (normalized.protocol !== "http:" && normalized.protocol !== "https:") return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(normalized.host)}&sz=64`;
}

function badgeColor(count) {
  if (count <= 10) return "#16803c";
  if (count <= 20) return "#b7791f";
  return "#c2413c";
}

function withTimeout(promise, timeoutMs, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}
