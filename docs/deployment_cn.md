# 部署指南

这个项目的正式部署方式固定为 **Cloudflare Pages**。

当前仓库是一个 Next.js 静态导出站点：

- 构建命令：`npm run build`
- 输出目录：`out`
- Node.js 版本：`22`

GitHub 只负责保存代码，不负责正式托管网站。  
不要继续使用 GitHub Pages 发布这个项目。

## 推荐的正式部署结构

- 代码仓库：GitHub
- 托管平台：Cloudflare Pages
- 生产分支：`main`
- 正式域名：`kkshao.org.cn`

## 为什么不使用 GitHub Pages

这个仓库不会在仓库根目录或 `docs/` 中直接提供可发布的 `index.html`。  
网站只有在执行下面的构建命令之后，才会生成静态文件：

```bash
npm run build
```

构建结果会输出到 `out/`，而 Cloudflare Pages 可以通过 Git 集成直接部署这个目录。  
如果 GitHub Pages 仍然启用，并且域名曾经绑定到 GitHub Pages，那么访问根域名时就很容易落到 GitHub 默认的 `404 File not found` 页面。

## 一次性配置步骤

### 1. 将仓库推送到 GitHub

正常使用 Git 即可：

```bash
git add .
git commit -m "Update site"
git push
```

### 2. 在 Cloudflare Pages 中创建项目

在 Cloudflare 控制台中：

1. 进入 **Workers & Pages**
2. 点击 **Create application**
3. 选择 **Pages**
4. 选择 **Connect to Git**
5. 选择当前仓库

构建参数固定如下：

- Production branch：`main`
- Build command：`npm run build`
- Build output directory：`out`
- Root directory：留空
- Environment variable：`NODE_VERSION=22`

### 3. 关闭 GitHub Pages

在 GitHub 仓库中：

1. 进入 **Settings -> Pages**
2. 删除已有的自定义域名，例如 `kkshao.org.cn`
3. 停用 GitHub Pages，或将发布源设为 `None`

如果这个域名以前绑定过 GitHub Pages，这一步是必须的。

### 4. 在 Cloudflare Pages 中绑定正式域名

在 Cloudflare Pages 项目中：

1. 打开 **Custom domains**
2. 添加 `kkshao.org.cn`
3. 等待状态变为激活

### 5. 删除旧的 GitHub Pages DNS 记录

在 Cloudflare DNS 中，删除所有仍指向 GitHub Pages 的记录，包括：

- 指向 `185.199.108.153` 到 `185.199.111.153` 的 `A` 记录
- 指向 `*.github.io` 的 `CNAME` 记录

切换到 Cloudflare Pages 后，不要重新创建 GitHub Pages 的 DNS 记录。

## 验证清单

域名绑定完成并清理 DNS 之后，检查：

- `https://kkshao.org.cn/`
- `https://kkshao.org.cn/research/`
- `https://kkshao.org.cn/publications/`
- `https://kkshao.org.cn/photography/`
- `https://kkshao.org.cn/cv/`

同时确认：

- Cloudflare Pages 中显示最近一次成功部署
- HTTPS 已经生效
- 根域名不再返回 GitHub 默认 404

## 后续更新方式

配置完成后，后续更新就是自动的。

你的日常流程只有：

```bash
git add .
git commit -m "Update site"
git push
```

Cloudflare Pages 会自动：

1. 拉取 `main`
2. 执行 `npm run build`
3. 自动发布新版本

不需要手动上传 `out/`。
