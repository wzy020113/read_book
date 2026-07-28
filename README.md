# 拾页 · 免费小说阅读器

一个面向手机阅读的静态小说阅读器，可直接部署到 GitHub Pages。

## 已实现

- 同时搜索 Project Gutenberg、Open Library / Internet Archive 与中文维基文库的公共领域 / 自由授权内容
- 搜索结果直接进入阅读器，读取失败时保留原始书源链接
- 收藏书架、最近阅读、阅读进度和正文离线缓存
- 左右翻页与上下滚动两种模式，支持触摸滑动和方向键
- 纸张、明亮、夜间主题，字号、行距和字体调节
- 导入 UTF-8 / GB18030 编码的本地 TXT，最大 20MB
- 移动端底部导航、全面屏安全区与 PWA 主屏安装
- GitHub Actions 自动部署 GitHub Pages
- 内置《红楼梦》《西游记》《水浒传》《三国志演义》四部公共领域中文全文
- 搜索不到开放全文时，提供起点中文网、番茄小说、七猫小说的官方站内搜索入口
- 独立的“官方书城”视图：用拾页自己的卡片和搜索栏组织官方入口

## 本地运行

不要直接双击 `index.html` 测试在线书源，浏览器对 `file://` 的跨域限制可能导致请求失败。在项目目录启动任意静态服务器：

```powershell
python -m http.server 4173
```

然后访问 `http://localhost:4173`。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个空仓库，例如 `shiye-reader`。
2. 把本目录全部内容推送到仓库的 `main` 分支。
3. 打开仓库的 `Settings > Pages`。
4. 在 `Build and deployment` 中把 Source 设为 `GitHub Actions`。
5. 等待 `Deploy Shiye Reader to GitHub Pages` 工作流完成，Pages 页面会显示访问地址。

仓库推送示例：

```powershell
git init
git add .
git commit -m "Build Shiye novel reader"
git branch -M main
git remote add origin https://github.com/你的用户名/shiye-reader.git
git push -u origin main
```

## 书源与版权边界

本项目不抓取盗版小说站，也不绕过付费或版权限制。在线全文来自：

- [Project Gutenberg](https://www.gutenberg.org/)：公共领域电子书
- [Open Library](https://openlibrary.org/) / [Internet Archive](https://archive.org/)：标记为公共扫描并提供全文 OCR 的版本
- [中文维基文库](https://zh.wikisource.org/)：公共领域或自由授权文本

不同国家和地区的公共领域期限可能不同，使用者仍需遵守所在地法律与原始书源条款。搜索不到通常表示开放书库未收录、作品仍受版权保护，或作品使用了不同译名。你也可以导入自己合法获得的 TXT。

对于仍受版权保护的作品，搜索结果页只提供官方平台入口，不抓取官方站点正文，也不会绕过登录、订阅或付费限制。

## 数据说明

- 书架、设置和进度保存在浏览器 `localStorage`。
- 已读取正文和本地 TXT 保存在浏览器 `IndexedDB`。
- 应用不上传阅读记录或本地文件。
- 清理站点数据会同时清除书架、进度和缓存。

## 后续扩展

在线书源封装在 `app.js` 的 `searchGutenberg`、`searchOpenLibrary`、`searchWikisource` 与对应正文加载函数中。新增合法授权书源时，保持统一的书籍字段并增加对应正文加载器即可。
