# Reading v1 发布与维护

## 当前边界

Reading 的 Library、Map、Threads 以及页面使用的四份 JSON 是公开内容，可由匿名访客访问和被搜索引擎索引。GitHub 仓库连接 Cloudflare Pages，`main` 分支执行 `npm run build` 并发布 `out/`；JSON 由 Pages Function 从 R2 读取，不写入公开仓库或静态构建产物。

以下内容仍保持私有：原始交接目录、原始 seed、校验报告、来源文献和 `thesis_reference_lookup.json`。公开授权只覆盖 Reading 页面实际展示的结构化数据，不代表可以发布这些上游材料。

“每周话题”当前没有页面、数据对象或 API；weekly 页面和数据路径必须显式返回 404。私有 canonical 数据中的 `weekly_agent_enabled` 必须保持 `false`，该字段不会进入公开 DTO。未来实现时须使用独立的认证边界，不能依赖当前公开的 `/reading/**` middleware。

## 架构

- `src/app/reading/page.tsx`：公开元数据与 Reading 页面入口。
- `src/components/reading/`：Library、Map、Threads 及加载/错误状态；不内嵌生产数据。
- `src/lib/reading/`：数据类型、运行时校验、同源加载与安全外链构造。
- `functions/reading/_security.ts`：公开缓存策略、CSP、frame、nosniff 和同源响应头。
- `functions/reading/_middleware.ts`：限制为 `GET/HEAD`，将 `/reading` 规范化为 `/reading/`，并保护下游响应头。
- `functions/reading/data/[filename].ts`：从 R2 binding `READING_DATA` 读取版本化 JSON；binding 或 prefix 异常时返回 503。
- `public/_routes.json`：让 `/reading` 与 `/reading/*` 经过 Pages Functions。
- `scripts/serve-reading.mjs`：使用仓库外 JSON 的回环地址测试服务器。
- `scripts/build-reading-public-release.mjs`：将私有 canonical JSON 按字段白名单投影为公开 DTO。
- `tests/fixtures/reading/`：虚构的私有 canonical 测试数据；本地服务器只在内存中生成公开 DTO。

页面只公开读取：

```text
/reading/data/library.json
/reading/data/relations.json
/reading/data/threads.json
/reading/data/view_config.json
```

handler 使用固定 allowlist，其他文件名一律 404。`thesis_reference_lookup.json`、`export.json` 和 weekly 路径不得上传或开放。R2 bucket 本身不得启用 `r2.dev` 或公开自定义域名；公开读取只经过上述四个 Pages Function 端点。

Pages Function 不会原样透传 R2 对象。它会解析 JSON，按同一套公开字段白名单严格验证并重新序列化；对象包含私有字段、未知字段、错误类型或非公开 `visibility` 时返回 503。

公开 DTO 只允许以下结构：

- 四份文件的根级字段均包含 `schema_version` 和 `visibility: public`，记录层不包含 `visibility`。
- `library.json` 根级仅有 `schema_version`、`visibility`、`papers`；不包含 `source_document`、`generated_on` 或 `curation_notice`。
- `relations.json` 根级仅有 `schema_version`、`visibility`、`edges`；thesis evidence 不包含 `document_id`。
- `threads.json` 根级仅有 `schema_version`、`visibility`、`threads`；thread 不包含 `question_status`。
- `view_config.json` 根级仅有 `schema_version`、`visibility`、`default_view`、`graph`；公开 graph 不包含 `initial_node_limit` 或 `hypothesis_layer_default`，根级也不包含 weekly、export 或网页编辑 feature flags。

成功的页面响应使用 `public, max-age=0, must-revalidate`。成功的数据响应允许短期公共缓存；错误响应使用 `no-store`。Reading 响应会移除 CORS、`WWW-Authenticate` 和 `X-Robots-Tag`，并统一添加 CSP、`Referrer-Policy: no-referrer`、`nosniff` 与 frame denial。

## 本地运行

先构建站点，再挂载 fixture：

```bash
npm run build
READING_DATA_DIR="tests/fixtures/reading" npm run serve:reading
```

默认地址是 `http://127.0.0.1:4173/reading/`。服务器只接受 `127.0.0.1`、`localhost` 或 `::1`，不应改成局域网或公网监听。需要用仓库外数据验证时，将 `READING_DATA_DIR` 指向其目录；不要复制到 `public/` 或 `out/`。

## 数据更新

1. 在私有工作目录中编辑并校验 canonical JSON，不改原始交接包。
2. 使用仓库提供的白名单投影脚本生成独立发布目录。输出目录必须尚不存在，并位于网站仓库及输入目录之外：

   ```bash
   npm run build:reading:public-release -- \
     --input-dir "/absolute/private/canonical" \
     --output-dir "/absolute/private/public-release"
   ```

   该脚本逐字段构造四份公开 JSON，同时执行字段类型和跨文件引用检查，并将文件权限设为 `0600`。它不会修改输入文件。

3. **禁止**通过搜索替换或手工脚本仅翻转 `visibility` 来制作发布数据。公开副本必须删除所有记录级 `visibility` 以及上节列出的私有字段；也不得用“复制后删除几个已知字段”的方式代替白名单投影。只使用上述脚本的四份输出作为待上传对象。
4. 在网站仓库运行以下回归检查。日志不得打印题名、注释、URL、完整 JSON、私有字段值或私有路径：

   ```bash
   npm run typecheck
   npm run lint
   npm run build
   npm run test:reading:validator
   npm run test:reading:links
   npm run test:reading:leaks
   npm run test:reading:browser-security
   npm run test:reading:browser
   npm run test:reading:functions
   npm run test:reading:public-release
   npm run test:reading:security
   READING_PRIVATE_DATA_DIR="/absolute/private/source/path" npm run check:reading:leaks
   ```

5. 将四份发布 JSON 上传到新的不可变 R2 `releases/<release-id>` 前缀，逐文件回读校验后再切换 `READING_DATA_PREFIX`。不得覆盖现有 release。
6. 数据端点有短期 CDN 缓存。切换 prefix 后应清除四个公开 JSON URL 的缓存，或等待缓存窗口结束，再执行线上验收。

## Cloudflare 配置

Production 与 Preview 均需要：

1. 私有 R2 bucket，以及变量名为 `READING_DATA` 的 Pages R2 binding。
2. 格式为 `releases/<release-id>` 的 `READING_DATA_PREFIX`。
3. `out/_routes.json` 中包含 `/reading` 与 `/reading/*`，且没有相应 exclude。
4. Pages Runtime 保持 Fail closed，避免 Function 故障时绕过 allowlist 和安全响应头。

Reading 不再读取 Basic Auth secret。新版代码完成部署并通过匿名访问验收后，应从 Production 和 Preview 删除历史 Reading Basic Auth secret，避免留下失效凭据。

## 线上验收

对自定义域名、默认 Pages 域名以及本次不可变 deployment URL 分别运行：

```bash
node scripts/test-reading-deployment.mjs \
  https://example.org \
  https://example.pages.dev \
  https://deployment.example.pages.dev
```

线上验收固定要求严格公开 DTO：只有四份文件根级允许出现 `visibility`，且其值必须为 `public`。部署测试不提供私有 schema 兼容模式。

验收必须确认：

- 匿名 `GET/HEAD /reading` 返回无正文 308，并跳到同源 `/reading/`。
- 匿名 `GET/HEAD /reading/` 和四个 JSON 均成功，不出现认证 challenge。
- `/reading/data/export.json`、lookup、weekly 数据和 weekly 页面全部 404。
- Reading 的非 `GET/HEAD` 请求返回 405，R2 binding/prefix 不可用时数据端点返回 503。
- 成功响应可公开缓存且没有 `X-Robots-Tag: noindex`；CSP、same-origin、nosniff 和 frame protections 保持有效。
- 四份 JSON 逐层只包含公开 DTO 白名单字段；`view_config.json` 不包含 weekly、export、网页编辑开关或两个私有 graph 字段。
- 公共 HTML、RSC、`search-index.json`、`/_next/static/**` 和 source map 不包含上游私有材料或 lookup 内容。
- 首页、Publications、Theory Notes 与 Reading 导航均可匿名使用。

## 回滚

数据回滚时将 `READING_DATA_PREFIX` 指回上一个已验证的公开 release，清除四个 JSON URL 的缓存，再复跑线上验收。代码回滚使用正常 Git revert 或 Cloudflare Pages 的先前 deployment。不得把 R2 数据复制到 `public/` 或 `out/` 作为临时恢复方式；binding 或 prefix 异常应继续 503 fail-closed。
