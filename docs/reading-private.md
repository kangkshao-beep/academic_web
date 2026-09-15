# Reading v1 私有部署与维护

## 当前状态

Reading v1 已实现为通用静态页面壳与受保护的运行时数据接口。当前仓库的生产方式是 GitHub 公开仓库连接 Cloudflare Pages，`main` 分支执行 `npm run build` 并发布 `out/`。

截至 2026-09-15：

- 通用 Reading 代码已部署；真实数据仍未复制进本仓库或 `out/`。
- 最终 Production 凭据下的合成数据认证矩阵已在 `kkshao.org.cn`、`academic-web.pages.dev` 和不可变 deployment URL 通过。
- 四份真实 canonical JSON 已在离线校验后上传到私有 Production R2 前缀 `releases/production-20260915-decb7a8-v1`，且逐文件回读比对一致。
- `thesis_reference_lookup.json` 未上传；本配置选择上述真实 release。每次新 deployment 仍须完成下述部署后认证与泄漏复验。

## 架构

- `src/app/reading/page.tsx`：只含通用元数据与 Reading 页面入口。
- `src/components/reading/`：Library、Map、Threads 及加载/错误状态；不导入真实数据。
- `src/lib/reading/`：数据类型、运行时校验、同源加载与安全外链构造。
- `functions/reading/_auth.ts`：共享的 fail-closed HTTP Basic Auth 与私有响应头。
- `functions/reading/_middleware.ts`：先将精确 `/reading` 规范化到 `/reading/`，再保护整个 Reading 页面与静态资源。
- `functions/reading/data/[filename].ts`：再次独立校验认证后，从私有 R2 binding `READING_DATA` 读取版本化 JSON。
- `public/_routes.json`：让 `/reading` 与 `/reading/*` 全部经过 Functions，包括 `index.html`、`index.txt` 和数据路径。
- `scripts/serve-private-reading.mjs`：使用仓库外 JSON 的本地认证静态服务器。
- `tests/fixtures/reading/`：明确虚构的公开测试数据，不是私有 collection 的替代品。

页面只请求以下四个对象：

```text
/reading/data/library.json
/reading/data/relations.json
/reading/data/threads.json
/reading/data/view_config.json
```

`thesis_reference_lookup.json` 只用于私下追溯，不上传。公共导航、Publications、Theory Notes 和公共 `search-index.json` 均不读取 Reading 数据。Reading 路径也不会调用现有访问计数接口。

## 数据更新

将 canonical JSON 保持在公开 Git 工作树之外，并把其目录设为 `READING_PRIVATE_DATA_DIR`。更新顺序固定为：

1. 在私有目录编辑 canonical JSON；不要编辑 R2 中的部署副本。
2. 在交接包目录运行离线 schema 与跨文件校验：

   ```bash
   python validate_seed.py \
     --data-dir "$READING_PRIVATE_DATA_DIR" \
     --report /tmp/reading-validation-report.json
   ```

3. 在网站仓库运行构建、类型、lint、Functions、安全和泄漏检查：

   ```bash
   npm run typecheck
   npm run lint
   npm run build
   npm run test:reading:validator
   npm run test:reading:links
   npm run test:reading:leaks
   npm run test:reading:browser
   npm run test:reading:functions
   npm run test:reading:security
   READING_PRIVATE_DATA_DIR="$READING_PRIVATE_DATA_DIR" npm run check:reading:leaks
   ```

4. 先上传到新的 R2 release prefix；验证后只切换 `READING_DATA_PREFIX`。不要覆盖当前 release。

数据校验或发布日志不得打印题名、注释、凭据、Authorization header 或 JSON 正文。交接校验器在失败时可能打印稳定 ID，因此只在私有机器运行，不直接接入公开 CI 日志。

## 本地运行

先构建通用页面壳：

```bash
npm run build
```

为本地 Basic Auth 生成 `username:password` 的 SHA-256。凭据应足够强，不要把明文放进命令历史、`.env` 或仓库：

```bash
read -r -s 'READING_CREDENTIAL_PAIR?Reading username:password: '
printf '\n'
export READING_BASIC_AUTH_SHA256="$(printf '%s' "$READING_CREDENTIAL_PAIR" | shasum -a 256 | awk '{print $1}')"
unset READING_CREDENTIAL_PAIR
```

挂载仓库外真实数据进行仅本机测试：

```bash
READING_PRIVATE_DATA_DIR="/absolute/private/data/path" \
READING_BASIC_AUTH_SHA256="$READING_BASIC_AUTH_SHA256" \
npm run serve:reading:private
```

默认地址为 `http://127.0.0.1:4173/reading/`。服务只监听回环地址；不要改为 `0.0.0.0` 后暴露真实数据。也可以把 `READING_PRIVATE_DATA_DIR` 指向 `tests/fixtures/reading` 做不含真实数据的界面测试。精确 `/reading` 会在认证前以 308 跳到 `/reading/`，避免浏览器把从无尾斜杠路径取得的 Basic Auth 凭据扩展到站点根路径。

本地服务器会拒绝非回环的 `READING_HOST`（只接受 `127.0.0.1`、`localhost` 或 `::1`）。它使用明文 HTTP，仅适合本机测试；生产或任何共享网络环境必须使用 HTTPS 与受认证的实际服务器/边缘配置。

## Cloudflare 配置

以下配置先使用合成 fixture 验证。不要先上传真实 JSON 来测试认证。

1. 创建不公开的网站专用 R2 bucket。不得开启 `r2.dev` 公共访问或绑定公开自定义域名。
2. 在 Cloudflare Pages 项目中添加 R2 binding，变量名必须为 `READING_DATA`。
3. 添加加密环境变量 `READING_BASIC_AUTH_SHA256`，值为 UTF-8 `username:password` 的小写 SHA-256 hex。不要把它写入 `wrangler.toml`。
4. 添加普通路径变量 `READING_DATA_PREFIX`，格式为 `releases/<release-id>`。新 Preview 若未配置 secret/binding 会返回 503，不会公开回退。
5. 在 Pages 项目的 **Settings -> Runtime -> Fail open / closed** 中选择 **Fail closed**。Cloudflare 官方说明：若认证 Function 在免费额度耗尽时采用 Fail open，Pages 会绕过 Function 继续提供静态资产；这会直接绕过 `/reading/` 的认证边界。生产和所有启用的 Preview 配置都必须核对。
6. 构建后检查 `out/_routes.json`，确认 `/reading` 与 `/reading/*` 在 `include` 中且没有被 `exclude` 覆盖。`_routes.json` 只负责触发 Function，不可代替认证 middleware 或 Runtime 的 Fail closed 设置。
7. 先将四份合成 JSON 上传到一个测试 release prefix。可通过 Cloudflare Dashboard 完成，也可在明确授权后用 Wrangler 的 `r2 object put` 上传；命令参数中的 bucket、prefix 和本地路径必须在执行前核对。
8. Production 必须在仍指向合成 prefix 时配置最终强凭据。Production 凭据不得沿用 Preview/演示凭据；只把 `username:password` 的 SHA-256 写入 Production secret，明文凭据存入本机密码管理器或 macOS 钥匙串，不写入仓库、环境文件或命令日志。
9. 使用最终 Production 凭据部署代码，并对自定义域名、默认 Pages 域名和该次不可变 deployment URL 完成下方认证矩阵。凭据、binding、prefix、Fail closed 或 Functions 代码有任何变化，都必须重新部署并从头复验；之前使用临时凭据或旧 deployment 的结果不能沿用。
10. 只有最终凭据下的合成数据矩阵全部通过，才上传真实四份 canonical JSON 到一个新的 Production release prefix。`thesis_reference_lookup.json` 永不上传。
11. 切换 Production 的 `READING_DATA_PREFIX` 并重新部署，再用最终凭据复跑完整矩阵和泄漏检查。验证失败时立即把 prefix 恢复到已验证的合成 release；不得用关闭认证或复制数据到 `public/` 的方式排障。

HTTP Basic Auth 只应运行在 HTTPS 上。使用带尾斜杠的 `/reading/` 作为书签入口；精确 `/reading` 必须在下发 challenge 前跳转，确保浏览器的 Basic Auth protection space 保持在 `/reading/` 下，而不是扩展到整个站点。浏览器仍可能缓存该范围内的 Basic 凭据，本页面不会把关闭标签页或应用内按钮误称为可靠退出。需要更强的会话管理时，可在此 fail-closed Function 之外叠加 Cloudflare Access，但仍须覆盖默认 Pages 域名和全部预览别名。

## 认证验收

对自定义域名、`academic-web.pages.dev`、每个启用的 Preview/branch alias 和可达 direct origin 分别执行：

- 未认证 `GET` 与 `HEAD`：精确 `/reading` 必须以不含 `WWW-Authenticate` 和正文的 308 跳到 `/reading/`；`/reading/`、`/reading/index.html`、`/reading/index.txt`、四个 `/reading/data/*.json` 必须 challenge 且均不得返回页面或数据正文。
- 在浏览器完成 `/reading/` 认证后，请求 `/`、公开页面、favicon、`search-index.json` 与 `/api/traffic` 不得携带 Reading 的 `Authorization` 头；只有 `/reading/**` 属于该 Basic Auth protection space。
- 错误凭据必须失败；有效凭据才可读取页面与四个 JSON。
- `/reading/data/export.json`、lookup 文件及其他未列出的数据路径必须不存在。
- 有效凭据访问后，再无凭据请求同一路径，不能命中共享缓存。
- 所有 Reading 响应必须含 `Cache-Control: private, no-store`、`X-Robots-Tag`、`Referrer-Policy: no-referrer` 与 `nosniff`。
- Pages Runtime 必须保持 Fail closed；不得以耗尽 Functions 额度后回退公开静态资产的方式降级。
- 公共 `search-index.json`、HTML/RSC、`/_next/static/**` 与 source map 不得包含真实数据或合成 canary。
- 首页、`/publications/` 与 `/learning/` 仍公开可读且行为不变。

本地测试通过不能替代上述线上验证。

## 回滚

数据回滚不覆盖文件：将 Pages 的 `READING_DATA_PREFIX` 恢复到上一个已验证的 R2 release，然后复跑认证与 schema 检查。确认回滚完成后再按私有保留策略清理失败 release。

代码回滚使用正常 Git revert/先前 Cloudflare Pages deployment。即使代码回滚，也不要把 R2 数据复制到 `public/` 或 `out/` 作为临时恢复方案。认证配置异常时应保持 503 fail closed。
