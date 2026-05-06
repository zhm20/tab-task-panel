# Tab Task Panel

本地 Chrome Manifest V3 扩展：整理当前打开的标签页，按域名/自定义规则聚类，显示 favicon、标题、页面概览、重复标记，并提供关闭单个、关闭整组、关闭重复、勾选批量关闭、保存稍后再看和 Archive。

## 安装

1. 打开 Chrome：`chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目目录
5. 打开新标签页查看面板

## 能力

- 只展示当前打开的真实网页标签，不展示已关闭历史页面。
- `Homepages` 特殊分组：Gmail inbox、X home、LinkedIn root、GitHub root、ChatGPT root、YouTube root。
- 重复检测：exact URL、去 query/hash 后同路径、同域同标题。
- 每组默认展示前 8 个唯一页面，超出用 `+N more` 展开。
- 点击标题切换到现有标签和窗口，不新开页面。
- 保存单个标签到稍后再看后会关闭该标签。
- Saved for later 支持 checklist、Archive、Archive 搜索、dismiss。
- 主题支持跟随系统、手动浅色、手动深色，设置保存在 `chrome.storage.local`。
- toolbar badge 显示真实网页 tab 数，并按负载变色。
- 支持 Chrome Manifest V3 的桌面 Chrome，包括 macOS、Windows、Linux。

## 隐私边界

- 不调用外部 API。
- 不上传历史记录或标签页内容。
- `history` 只用于本地熟悉度统计，不参与生成主列表。
- UI 默认不展示 query、hash、token、验证码等敏感 URL 片段。
- 关闭动作只由用户点击触发。

## 本地配置

复制 `config.example.js` 为 `config.local.js` 后，可配置个人 landing page 或自定义分组规则。`config.local.js` 已加入 `.gitignore`，扩展无需 Node.js、npm、服务器或构建步骤即可运行。
