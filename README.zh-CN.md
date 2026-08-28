# MeiDay 思源插件

[English](./README.md)

一个把 [MeiDay](https://task.congsec.cn) 任务管理嵌入思源笔记的插件：点击顶栏图标，弹出窗口内就是完整的 MeiDay 界面，数据通过远程 FastAPI 后端 `https://task.congsec.cn` 读写。

> 本插件是 MeiDay 前端（Vue 3 + Vite）的思源封装，后端并未打包进插件，而是连接公网后端 `https://task.congsec.cn`。

## 功能

- 顶栏图标一键打开 MeiDay 任务管理
- 前端以单文件构建打包进插件，在隔离的 iframe 中渲染
- 登录态保存在 iframe 的 localStorage（与思源同源），重启思源后保持登录
- 按集市规范制作：`plugin.json`、`icon.png`、`preview.png`、README、`package.zip`

## 环境要求

- 思源桌面端 v3.0.0 及以上（可使用集市的版本）
- 后端 `https://task.congsec.cn` 可访问
- （仅开发）Node.js 24+

## 安装

1. 从最新 [release](../../releases) 下载 `package.zip`。
2. 思源内进入 **设置 → 集市 → 插件**，选择"导入"并选中 `package.zip`；或把解压后的插件目录放到 `{工作空间}/data/plugins/meiday-siyuan-plugin`。
3. 重启思源，在插件列表启用 **MeiDay**。
4. 点击顶栏的 MeiDay 图标即可打开。

## 后端 CORS（必须配置）

内置前端运行在思源的页面源上，却要请求 `https://task.congsec.cn` 的后端。浏览器会拦截请求，除非后端通过 CORS 放行思源来源。

在服务器上把思源来源追加到 `FRONTEND_ORIGINS` 环境变量（逗号分隔）后重启后端：

```
FRONTEND_ORIGINS=http://localhost,https://localhost,http://127.0.0.1:6806
```

`http://127.0.0.1:6806` 是思源默认的内核 HTTP 来源。若你的思源使用了其它端口（见 **设置 → 关于 → 内核 HTTP 端口**），请改成实际端口。

## 从源码构建

```powershell
# 1. 在 EasyTask 的 frontend 目录里构建单文件前端
$env:VITE_API_BASE_URL="https://task.congsec.cn"
npm run build:plugin            # 产出 frontend/dist-plugin/index.html

# 2. 复制到本仓库
Copy-Item ../EasyTask/frontend/dist-plugin/index.html src/assets/app.html

# 3. 安装依赖并构建插件
npm install
npm run build                   # 产出 dist/ 与 package.zip
```

## 上架社区集市

1. 推送到 `https://github.com/congsec/meiday-siyuan-plugin`。
2. 创建 GitHub **release**，Tag 版本 `v0.1.0`，附件上传 `package.zip`。
3. 向 [siyuan-note/bazaar](https://github.com/siyuan-note/bazaar) 提 PR，在 `plugins.txt` 增加一行：
   ```
   congsec/meiday-siyuan-plugin
   ```
4. 等待 PR 校验通过并合并，集市索引会自动更新。

## License

MIT
