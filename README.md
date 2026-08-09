# 习惯工作台

一个面向手机的单页习惯工作台。习惯数据保存在当前设备的浏览器本地存储中。

## 文件

- `index.html`：页面结构
- `styles.css`：界面样式
- `app.js`：习惯、专注周期、打卡和拖动排序逻辑
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自动部署

## 自动发布

项目连接到 GitHub 后，每次向 `main` 分支推送代码，GitHub Actions 会自动发布最新版本到 GitHub Pages。

首次发布前，需要在仓库的 **Settings → Pages → Build and deployment** 中将 Source 设为 **GitHub Actions**。

## 数据说明

习惯记录使用 `localStorage` 保存，因此：

- 数据不会上传到 GitHub；
- 每台设备的数据相互独立；
- 清除浏览器网站数据会删除本机习惯记录。
