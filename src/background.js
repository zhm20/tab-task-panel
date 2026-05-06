import { buildBadgeSummary, setBadgeCount } from "./taskEngine.js";

async function refreshBadge() {
  try {
    const summary = await buildBadgeSummary();
    await setBadgeCount(summary.openTabCount, summary.badgeColor);
  } catch (error) {
    console.warn("Tab Task Panel badge refresh failed", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  refreshBadge();
});

chrome.runtime.onStartup.addListener(() => {
  refreshBadge();
});

chrome.tabs.onCreated.addListener(() => {
  refreshBadge();
});

chrome.tabs.onRemoved.addListener(() => {
  refreshBadge();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url || changeInfo.title) {
    refreshBadge();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.tabTaskPanelState) {
    refreshBadge();
  }
});
