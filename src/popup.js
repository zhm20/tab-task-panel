import { buildDashboard, setBadgeCount } from "./taskEngine.js";
import { initThemeControl } from "./theme.js";

const metrics = document.querySelector("#metrics");
const activePreview = document.querySelector("#activePreview");
const refreshButton = document.querySelector("#refreshButton");
const themeSelect = document.querySelector("#themeSelect");

refreshButton.addEventListener("click", () => loadPopup());

initThemeControl(themeSelect);
loadPopup();

async function loadPopup() {
  refreshButton.disabled = true;
  try {
    const dashboard = await buildDashboard({ includeOverviews: false });
    await setBadgeCount(dashboard.summary.openTabCount, dashboard.summary.badgeColor);
    renderMetrics(dashboard.summary);
    renderPreview(dashboard.groups);
  } catch (error) {
    console.error(error);
    activePreview.textContent = "读取失败，请检查扩展权限。";
  } finally {
    refreshButton.disabled = false;
  }
}

function renderMetrics(summary) {
  metrics.replaceChildren(
    metric("标签", summary.openTabCount),
    metric("域名", summary.domainCount),
    metric("重复", summary.duplicateCount)
  );
}

function renderPreview(groups) {
  activePreview.replaceChildren();

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "没有可整理的标签";
    activePreview.append(empty);
    return;
  }

  for (const group of groups.slice(0, 5)) {
    const row = document.createElement("a");
    row.href = "newtab.html";
    row.target = "_blank";
    row.className = "preview-row";

    const title = document.createElement("strong");
    title.textContent = group.title;

    const meta = document.createElement("span");
    meta.textContent = `${group.tabCount} tabs · ${group.duplicateCount} duplicates`;

    row.append(title, meta);
    activePreview.append(row);
  }
}

function metric(label, value) {
  const item = document.createElement("article");
  const strong = document.createElement("strong");
  const span = document.createElement("span");

  strong.textContent = String(value);
  span.textContent = label;
  item.append(strong, span);
  return item;
}
