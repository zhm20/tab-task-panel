import {
  buildDashboard,
  checkSavedItem,
  clearSelection,
  closeTabs,
  dismissClosedItem,
  dismissSavedItem,
  focusTab,
  restoreClosedItem,
  saveTabForLaterAndClose,
  setBadgeCount,
  toggleTabSelected
} from "./taskEngine.js";
import { initThemeControl } from "./theme.js";

const stats = document.querySelector("#stats");
const dateLabel = document.querySelector("#dateLabel");
const domainCount = document.querySelector("#domainCount");
const savedCount = document.querySelector("#savedCount");
const domainGroups = document.querySelector("#domainGroups");
const savedItems = document.querySelector("#savedItems");
const archivePanel = document.querySelector("#archivePanel");
const archiveToggle = document.querySelector("#archiveToggle");
const archiveBody = document.querySelector("#archiveBody");
const archiveCount = document.querySelector("#archiveCount");
const archiveSearch = document.querySelector("#archiveSearch");
const archiveItems = document.querySelector("#archiveItems");
const closedCount = document.querySelector("#closedCount");
const closedToggle = document.querySelector("#closedToggle");
const closedBody = document.querySelector("#closedBody");
const closedItems = document.querySelector("#closedItems");
const closedMoreButton = document.querySelector("#closedMoreButton");
const refreshButton = document.querySelector("#refreshButton");
const closeAllButton = document.querySelector("#closeAllButton");
const closeSelectedButton = document.querySelector("#closeSelectedButton");
const themeSelect = document.querySelector("#themeSelect");
const panelDupeBanner = document.querySelector("#panelDupeBanner");
const panelDupeText = document.querySelector("#panelDupeText");
const closePanelDupesButton = document.querySelector("#closePanelDupesButton");
const toast = document.querySelector("#toast");
const groupTemplate = document.querySelector("#groupTemplate");
const tabTemplate = document.querySelector("#tabTemplate");
const savedTemplate = document.querySelector("#savedTemplate");
const archiveTemplate = document.querySelector("#archiveTemplate");
const closedTemplate = document.querySelector("#closedTemplate");

let dashboard = null;
const expandedGroups = new Set();
let closedExpanded = false;
let resizeTimer = 0;

refreshButton.addEventListener("click", () => loadDashboard());

closeAllButton.addEventListener("click", async () => {
  if (!dashboard) return;
  const tabs = dashboard.groups.flatMap((group) => group.tabs);
  await closeTabsWithGuard(tabs, "已关闭全部可关闭标签", "all");
});

closeSelectedButton.addEventListener("click", async () => {
  if (!dashboard) return;
  const selectedTabs = dashboard.groups.flatMap((group) => group.tabs.filter((tab) => tab.selected));
  await closeTabsWithGuard(selectedTabs, "已关闭所选标签", "selected");
  await clearSelection();
});

closePanelDupesButton.addEventListener("click", async () => {
  if (!dashboard) return;
  await closeAndRefresh(dashboard.summary.panelDuplicateTabIds, "已关闭额外面板标签");
});

archiveToggle.addEventListener("click", () => {
  archiveBody.hidden = !archiveBody.hidden;
  archiveToggle.classList.toggle("is-open", !archiveBody.hidden);
});

archiveSearch.addEventListener("input", () => renderArchive(dashboard?.archivedItems || [], archiveSearch.value));

closedToggle.addEventListener("click", () => {
  closedBody.hidden = !closedBody.hidden;
  closedToggle.classList.toggle("is-open", !closedBody.hidden);
});

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (dashboard) renderDomainGroups(dashboard.groups);
  }, 120);
});

document.addEventListener("change", async (event) => {
  const checkbox = event.target.closest('input[type="checkbox"][data-tab-id]');
  if (!checkbox) return;
  await toggleTabSelected(checkbox.dataset.tabId, checkbox.checked);
  await loadDashboard();
});

document.addEventListener("click", async (event) => {
  const titleLink = event.target.closest(".tab-title");
  if (titleLink) {
    event.preventDefault();
    const tab = findTab(titleLink.closest(".tab-row")?.dataset.tabId);
    if (tab) await focusTab(tab.tabId, tab.windowId);
    return;
  }

  const button = event.target.closest("button[data-action], input[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  button.disabled = true;

  if (action === "expand-group") {
    const groupId = button.closest(".domain-card")?.dataset.groupId;
    if (groupId) expandedGroups.add(groupId);
    renderDashboard(dashboard);
    return;
  }

  if (action === "toggle-closed-more") {
    closedExpanded = !closedExpanded;
    renderClosed(dashboard?.closedItems || []);
    button.disabled = false;
    return;
  }

  if (action === "close-group") {
    const group = findGroup(button.closest(".domain-card")?.dataset.groupId);
    await closeTabsWithGuard(group?.tabs || [], "已关闭分组标签", "group");
  } else if (action === "close-duplicates") {
    const group = findGroup(button.closest(".domain-card")?.dataset.groupId);
    const duplicateTabs = (group?.tabs || []).filter((tab) => group?.duplicateTabIds.includes(tab.tabId));
    await closeTabsWithGuard(duplicateTabs, "已关闭重复标签", "duplicates");
  } else if (action === "close-tab") {
    const tab = findTab(button.closest(".tab-row")?.dataset.tabId);
    await closeTabsWithGuard(tab ? [tab] : [], "标签已关闭", "single");
  } else if (action === "save-tab") {
    const tab = findTab(button.closest(".tab-row")?.dataset.tabId);
    if (tab) {
      await saveTabForLaterAndClose(tab);
      showToast("已保存到稍后再看并关闭标签");
      await loadDashboard();
    }
  } else if (action === "check-saved") {
    const row = button.closest(".saved-row");
    row?.classList.add("is-completing");
    await checkSavedItem(row?.dataset.savedId || "");
    showToast("已移入 Archive");
    await loadDashboard();
  } else if (action === "dismiss-saved") {
    await dismissSavedItem(button.closest(".saved-row")?.dataset.savedId || "");
    showToast("已移除保存项");
    await loadDashboard();
  } else if (action === "restore-closed") {
    const item = findClosedItem(button.closest(".closed-row")?.dataset.closedId);
    if (item) {
      await restoreClosedItem(item.id);
      showToast(item.kind === "window" ? "窗口已恢复" : "标签已恢复");
      await loadDashboard();
    }
  } else if (action === "dismiss-closed") {
    await dismissClosedItem(button.closest(".closed-row")?.dataset.closedId || "");
    showToast("已隐藏关闭记录");
    await loadDashboard();
  }
});

initThemeControl(themeSelect);
loadDashboard();

async function loadDashboard() {
  setLoading(true);
  try {
    dashboard = await buildDashboard();
    await setBadgeCount(dashboard.summary.openTabCount, dashboard.summary.badgeColor);
    renderDashboard(dashboard);
  } catch (error) {
    console.error(error);
    showToast("读取失败，请确认扩展已获得 tabs、history、scripting、storage 权限。");
  } finally {
    setLoading(false);
  }
}

function renderDashboard(nextDashboard) {
  if (!nextDashboard) return;
  const { groups, savedItems: saved, archivedItems, closedItems: closed, summary } = nextDashboard;
  dateLabel.textContent = dateText();
  domainCount.textContent = `${summary.domainCount} groups`;
  savedCount.textContent = `${summary.savedCount} active`;
  closedCount.textContent = summary.closedCount ? `(${summary.closedCount})` : "";
  closeSelectedButton.disabled = summary.selectedCount === 0;
  closeSelectedButton.textContent = summary.selectedCount ? `关闭所选 ${summary.selectedCount}` : "关闭所选";
  closeAllButton.disabled = summary.openTabCount === 0;
  closeAllButton.textContent = summary.openTabCount ? `关闭全部 ${summary.openTabCount}` : "关闭全部";

  panelDupeBanner.hidden = summary.panelDuplicateCount === 0;
  panelDupeText.textContent = summary.panelDuplicateCount ? `还有 ${summary.panelDuplicateCount} 个额外面板页，可以保留当前这个。` : "";

  stats.replaceChildren(
    statCard("Open tabs", summary.openTabCount),
    statCard("Groups", summary.domainCount),
    statCard("Duplicates", summary.duplicateCount),
    statCard("Saved", summary.savedCount + summary.archivedCount),
    statCard("Closed", summary.closedCount)
  );

  renderDomainGroups(groups);

  renderSaved(saved);
  renderArchive(archivedItems, archiveSearch.value);
  renderClosed(closed);
}

function renderDomainGroups(groups) {
  domainGroups.replaceChildren();
  if (!groups.length) {
    domainGroups.append(emptyState("没有可整理的普通网页标签。"));
    return;
  }

  const columnCount = domainColumnCount();
  const columns = Array.from({ length: columnCount }, () => {
    const column = document.createElement("div");
    column.className = "domain-column";
    return column;
  });
  const columnHeights = Array(columnCount).fill(0);

  for (const group of groups) {
    const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
    columns[shortestColumn].append(renderGroup(group));
    columnHeights[shortestColumn] += estimateGroupHeight(group);
  }

  domainGroups.append(...columns);
}

function domainColumnCount() {
  const width = domainGroups.clientWidth || domainGroups.getBoundingClientRect().width || window.innerWidth;
  if (width < 760) return 1;
  if (width < 1160) return 2;
  return Math.max(2, Math.floor((width + 12) / 372));
}

function estimateGroupHeight(group) {
  const isExpanded = expandedGroups.has(group.id);
  const visibleCount = isExpanded ? group.visibleTabs.length + group.hiddenTabs.length : group.visibleTabs.length;
  const hiddenHint = !isExpanded && group.hiddenTabs.length ? 38 : 0;
  return 112 + visibleCount * 82 + hiddenHint;
}

function renderGroup(group) {
  const node = groupTemplate.content.firstElementChild.cloneNode(true);
  const isExpanded = expandedGroups.has(group.id);
  const tabsToShow = isExpanded ? [...group.visibleTabs, ...group.hiddenTabs] : group.visibleTabs;
  node.dataset.groupId = group.id;
  node.classList.toggle("has-duplicates", group.duplicateCount > 0);
  node.classList.toggle("is-homepages", group.id === "__homepages__");

  node.querySelector("h3").textContent = group.title;
  node.querySelector(".domain-meta").textContent = [
    group.hostLabels.join(" / "),
    group.historyVisitCount ? `近 30 天 ${group.historyVisitCount} 次访问` : "近期较少访问",
    group.closeMode === "exact" ? "exact close" : "domain group"
  ].filter(Boolean).join(" · ");

  const badges = node.querySelector(".badges");
  badges.replaceChildren(...[
    badge(`${group.tabCount} tabs`, "blue"),
    group.duplicateCount ? badge(`${group.duplicateCount} duplicates`, "amber") : null,
    group.hasPinned ? badge("pinned", "cyan") : null,
    group.hasAudible ? badge("audio", "red") : null
  ].filter(Boolean));

  const tabList = node.querySelector(".tab-list");
  tabList.replaceChildren(...tabsToShow.map(renderTab));

  const expandButton = node.querySelector(".expand-button");
  expandButton.hidden = group.hiddenTabs.length === 0 || isExpanded;
  expandButton.textContent = `+${group.hiddenTabs.length} more`;

  const duplicateButton = node.querySelector('[data-action="close-duplicates"]');
  duplicateButton.disabled = group.duplicateCount === 0;
  duplicateButton.textContent = group.duplicateCount ? `关闭 ${group.duplicateCount} 个重复` : "无重复";

  const closeButton = node.querySelector('[data-action="close-group"]');
  const closableCount = closableTabs(group.tabs).length;
  closeButton.textContent = group.hasPinned ? `关闭可关 ${closableCount}` : `关闭全部 ${group.tabCount}`;
  closeButton.disabled = closableCount === 0;

  return node;
}

function renderTab(tab) {
  const node = tabTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.tabId = String(tab.tabId);
  node.classList.toggle("is-active", tab.active);
  node.classList.toggle("is-pinned", tab.pinned);
  node.classList.toggle("is-audible", tab.audible);

  const checkbox = node.querySelector('input[type="checkbox"]');
  checkbox.dataset.tabId = String(tab.tabId);
  checkbox.checked = tab.selected;

  const favicon = node.querySelector(".favicon");
  favicon.src = tab.faviconUrl || "";
  favicon.hidden = !tab.faviconUrl;

  const title = node.querySelector(".tab-title");
  title.textContent = tab.title;

  const dupeChip = node.querySelector(".dupe-chip");
  dupeChip.hidden = tab.duplicateCount <= 1;
  dupeChip.textContent = `(${tab.duplicateCount}x)`;

  node.querySelector(".tab-overview").textContent = tab.overview?.description || `${tab.hostLabel} · ${tab.path}`;

  const flags = node.querySelector(".tab-flags");
  flags.replaceChildren(...[
    tab.active ? smallFlag("active") : null,
    tab.pinned ? smallFlag("pinned") : null,
    tab.audible ? smallFlag("audio") : null,
    tab.host === "localhost" && tab.port ? smallFlag(`:${tab.port}`) : null
  ].filter(Boolean));

  return node;
}

function renderSaved(items) {
  savedItems.replaceChildren();
  if (!items.length) {
    savedItems.append(emptyState("还没有稍后再看的页面。"));
    return;
  }

  for (const item of items) {
    const node = savedTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.savedId = item.id;
    const favicon = node.querySelector(".favicon");
    favicon.src = item.faviconUrl || "";
    favicon.hidden = !item.faviconUrl;
    const title = node.querySelector(".saved-title");
    title.href = item.url || item.safeUrl;
    title.textContent = item.title;
    node.querySelector(".saved-meta").textContent = `${item.hostLabel || item.host || "page"} · ${relativeTime(item.savedAt)}`;
    savedItems.append(node);
  }
}

function renderArchive(items, query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  archivePanel.hidden = items.length === 0;
  archiveCount.textContent = items.length ? `(${items.length})` : "";
  archiveItems.replaceChildren();

  const filtered = normalizedQuery.length < 2
    ? items
    : items.filter((item) => `${item.title} ${item.url || item.safeUrl}`.toLowerCase().includes(normalizedQuery));

  if (!filtered.length) {
    archiveItems.append(emptyState(normalizedQuery ? "Archive 中没有匹配项。" : "Archive 为空。"));
    return;
  }

  for (const item of filtered) {
    const node = archiveTemplate.content.firstElementChild.cloneNode(true);
    const title = node.querySelector(".archive-title");
    title.href = item.url || item.safeUrl;
    title.textContent = item.title;
    node.querySelector(".archive-date").textContent = relativeTime(item.completedAt || item.savedAt);
    archiveItems.append(node);
  }
}

function renderClosed(items) {
  closedItems.replaceChildren();
  closedMoreButton.hidden = true;

  if (!items.length) {
    closedItems.append(emptyState("还没有关闭历史。"));
    return;
  }

  const visible = closedExpanded ? items : items.slice(0, 5);
  for (const item of visible) {
    const node = closedTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.closedId = item.id;

    const favicon = node.querySelector(".favicon");
    favicon.src = item.faviconUrl || "";
    favicon.hidden = !item.faviconUrl;

    const title = node.querySelector(".closed-title");
    title.textContent = item.title;
    title.href = item.safeUrl || "#";

    node.querySelector(".closed-meta").textContent = [
      item.hostLabel || item.host || "page",
      relativeTime(item.closedAt),
      item.kind === "window" ? "window" : item.reason || "closed"
    ].filter(Boolean).join(" · ");

    node.querySelector(".closed-source").textContent = item.source;
    node.querySelector('[data-action="restore-closed"]').disabled = !item.restorable;
    closedItems.append(node);
  }

  if (items.length > 5) {
    closedMoreButton.hidden = false;
    closedMoreButton.textContent = closedExpanded ? "Show fewer" : `Show ${items.length - 5} more`;
  }
}

async function closeAndRefresh(tabIds, message, options = {}) {
  if (!tabIds.length) {
    showToast("没有可关闭的标签");
    return;
  }
  await closeTabs(tabIds, options);
  showToast(`${message} (${tabIds.length})`);
  await loadDashboard();
}

async function closeTabsWithGuard(tabs, message, reason = "closed") {
  const candidates = closableTabs(tabs);
  if (candidates.length !== tabs.length) {
    showToast("已跳过 pinned 标签");
  }
  if (candidates.some((tab) => tab.audible)) {
    const ok = window.confirm("所选范围里有正在播放声音的标签，确认关闭吗？");
    if (!ok) return;
  }
  await closeAndRefresh(candidates.map((tab) => tab.tabId), message, { tabs: candidates, reason });
}

function closableTabs(tabs) {
  return tabs.filter((tab) => !tab.pinned);
}

function statCard(label, value) {
  const card = document.createElement("article");
  card.className = "stat-card";
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const span = document.createElement("span");
  span.textContent = label;
  card.append(strong, span);
  return card;
}

function badge(text, tone) {
  const node = document.createElement("span");
  node.className = `badge badge-${tone}`;
  node.textContent = text;
  return node;
}

function smallFlag(text) {
  const node = document.createElement("span");
  node.className = "small-flag";
  node.textContent = text;
  return node;
}

function emptyState(text) {
  const node = document.createElement("p");
  node.className = "empty";
  node.textContent = text;
  return node;
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.classList.toggle("is-loading", isLoading);
}

function findGroup(groupId) {
  return dashboard?.groups.find((group) => group.id === groupId);
}

function findTab(tabId) {
  return dashboard?.groups.flatMap((group) => group.tabs).find((tab) => String(tab.tabId) === String(tabId));
}

function findClosedItem(id) {
  return dashboard?.closedItems.find((item) => item.id === id);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function dateText() {
  return new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function relativeTime(value) {
  const then = new Date(value).getTime();
  if (!then) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
