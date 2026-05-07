# Tab Task Panel

English | [简体中文](README.zh-CN.md)

A local Chrome Manifest V3 extension for organizing currently open tabs. It groups tabs by domain or custom local rules, shows favicons, cleaned titles, page summaries, duplicate markers, and provides controls to close a single tab, close a whole group, close duplicates, bulk-close selected tabs, save tabs for later, archive completed saved items, and review recently closed tabs.

## Installation

This is an unpacked Chrome Manifest V3 extension. It does not require Node.js, npm, a backend service, or a build step.

### Download from GitHub

1. Open the repository: [zhm20/tab-task-panel](https://github.com/zhm20/tab-task-panel)
2. Click the green `Code` button and choose `Download ZIP`
3. Unzip the downloaded file. You should get a `tab-task-panel-main` folder
4. Open Chrome and go to `chrome://extensions/`
5. Enable `Developer mode` in the top-right corner
6. Click `Load unpacked`
7. Select the extracted `tab-task-panel-main` folder
8. Open a new tab. Chrome should show Tab Task Panel

### Install with git clone

```bash
git clone git@github.com:zhm20/tab-task-panel.git
```

Then open `chrome://extensions/` and select the cloned `tab-task-panel` directory with `Load unpacked`.

If you do not have GitHub SSH configured, use HTTPS instead:

```bash
git clone https://github.com/zhm20/tab-task-panel.git
```

### Update

- ZIP install: download the latest ZIP again, replace the old folder, then click the reload button on the extension card in `chrome://extensions/`.
- git install: run `git pull` in the project directory, then click the reload button on the extension card in `chrome://extensions/`.

### Permissions

Chrome will ask for access to history, tabs, recently closed sessions, and page content. The extension uses those permissions for:

- `tabs`: read currently open tabs, switch to existing tabs, and close tabs after user action.
- `history`: compute local familiarity statistics only. Closed history pages are not shown in the main list.
- `sessions`: read Chrome's recently closed tabs/windows and restore them after user action.
- `scripting`: read titles, descriptions, and page text snippets from currently open pages to build summaries.
- `storage`: save theme preference, selected tabs, Saved for later, Archive state, and local panel-close history.

All analysis runs locally in your browser. The extension does not call external APIs.

## Features

- Shows only currently open real web tabs. Closed history pages are not listed.
- `Homepages` special group: Gmail inbox, X home, LinkedIn root, GitHub root, ChatGPT root, and YouTube root.
- Duplicate detection: exact URL, same path after removing query/hash, and same title under the same domain.
- Shows the first 8 unique pages per group by default, with `+N more` expansion.
- Clicking a tab title switches to the existing tab and window instead of opening a new page.
- Saving a tab for later stores it locally and closes that tab.
- Saved for later supports checklist completion, Archive, Archive search, and dismiss.
- Recently closed combines Chrome's recent session list with tabs closed from this panel.
- Recently closed can restore Chrome session items in place, or reopen panel-logged items with their safe URL.
- Theme supports system mode, manual light mode, and manual dark mode, stored in `chrome.storage.local`.
- Toolbar badge shows the real web tab count and changes color by load.
- Supports desktop Chrome with Manifest V3 on macOS, Windows, and Linux.

## Privacy

- No external API calls.
- No upload of history records or tab content.
- `history` is used only for local familiarity statistics and does not feed the main list.
- `sessions` is used only to show and restore Chrome's recently closed tabs/windows. Chrome limits how many session entries are available.
- Panel-close history keeps only safe local fields for up to 30 days or 200 items.
- Query strings, hashes, tokens, verification codes, and other sensitive URL fragments are hidden from the UI by default.
- Close actions only run after user clicks.

## Local Configuration

Copy `config.example.js` to `config.local.js` if you want personal landing page rules or custom grouping rules. `config.local.js` is ignored by git. The extension runs directly without Node.js, npm, a server, or a build step.
