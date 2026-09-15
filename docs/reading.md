# Reading v1 发布与维护

## 当前边界

Reading 的 Library、Map、Threads 以及页面使用的四份 JSON 是公开内容，可由匿名访客访问和被搜索引擎索引。GitHub 仓库连接 Cloudflare Pages，`main` 分支执行 `npm run build` 并发布 `out/`；JSON 由 Pages Function 从 R2 读取，不写入公开仓库或静态构建产物。

以下内容仍保持私有：原始交接目录、原始 seed、校验报告、来源文献和 `thesis_reference_lookup.json`。公开授权只覆盖 Reading 页面实际展示的结构化数据，不代表可以发布这些上游材料。

`/reading/weekly/` 是独立的私有“课题宇宙”。页面 HTML 和 `topics.json` 位于同一个 Basic Auth 边界内，使用专用 secret `READING_WEEKLY_BASIC_AUTH_SHA256`。Next.js 的共享静态 chunk 仍是公开的，因此其中只允许包含通用 UI、三语标签和数据契约，不能包含真实课题内容。weekly 不复用历史 Reading 凭据，也不改变 Library、Map、Threads 的匿名公开属性。真实 canonical 必须留在仓库外，不得进入 Git、`public/`、`out/` 或搜索索引。

## 架构

- `src/app/reading/page.tsx`：公开元数据与 Reading 页面入口。
- `src/components/reading/`：Library、Map、Threads 及加载/错误状态；不内嵌生产数据。
- `src/lib/reading/`：数据类型、运行时校验、同源加载与安全外链构造。
- `functions/reading/_security.ts`：公开缓存策略、CSP、frame、nosniff 和同源响应头。
- `functions/reading/_middleware.ts`：限制为 `GET/HEAD`，将 `/reading` 规范化为 `/reading/`，并保护下游响应头。
- `functions/reading/data/[filename].ts`：从 R2 binding `READING_DATA` 读取版本化 JSON；binding 或 prefix 异常时返回 503。
- `src/app/reading/weekly/`、`src/components/reading/WeeklyUniverse.tsx`：私有课题宇宙页面和三语交互，不内嵌课题内容。
- `functions/reading/weekly/_auth.ts`：weekly 专用认证及 `private, no-store` 安全响应头。
- `functions/reading/weekly/data/[filename].ts`：只允许读取 `READING_WEEKLY_DATA_PREFIX/topics.json`，解析、严格校验后重新序列化。
- `public/_routes.json`：让 `/reading` 与 `/reading/*` 经过 Pages Functions。
- `scripts/serve-reading.mjs`：使用仓库外 JSON 的回环地址测试服务器。
- `scripts/build-reading-public-release.mjs`：将私有 canonical JSON 按字段白名单投影为公开 DTO。
- `tests/fixtures/reading/`：虚构的私有 canonical 测试数据；本地服务器只在内存中生成公开 DTO。
- `tests/fixtures/reading-weekly/`：只含虚构课题，用于浏览器、Function 和部署前验证。

页面只公开读取：

```text
/reading/data/library.json
/reading/data/relations.json
/reading/data/threads.json
/reading/data/view_config.json
```

公开 handler 使用固定 allowlist，其他文件名一律 404。`thesis_reference_lookup.json` 和 `export.json` 不得上传或开放。weekly 只有以下受认证端点：

```text
/reading/weekly/
/reading/weekly/data/topics.json
```

R2 bucket 本身不得启用 `r2.dev` 或公开自定义域名；所有读取必须经过 Pages Function。

Pages Function 不会原样透传 R2 对象。它会解析 JSON，按同一套公开字段白名单严格验证并重新序列化；对象包含私有字段、未知字段、错误类型或非公开 `visibility` 时返回 503。

公开 DTO 只允许以下结构：

- 四份文件的根级字段均包含 `schema_version` 和 `visibility: public`，记录层不包含 `visibility`。
- `library.json` 根级仅有 `schema_version`、`visibility`、`papers`；不包含 `source_document`、`generated_on` 或 `curation_notice`。
- `relations.json` 根级仅有 `schema_version`、`visibility`、`edges`；thesis evidence 不包含 `document_id`。
- `threads.json` 根级仅有 `schema_version`、`visibility`、`threads`；thread 不包含 `question_status`。
- `view_config.json` 根级仅有 `schema_version`、`visibility`、`default_view`、`graph`；公开 graph 不包含 `initial_node_limit` 或 `hypothesis_layer_default`，根级也不包含 weekly、export 或网页编辑 feature flags。

公开 Reading 页面响应使用 `public, max-age=0, must-revalidate`，公开数据允许短期公共缓存，错误响应使用 `no-store`。weekly 的成功、失败与认证 challenge 均使用 `private, no-store`、`CDN-Cache-Control: no-store`、`Vary: Authorization`、`X-Robots-Tag: noindex, nofollow, noarchive`、same-origin resource policy、CSP、no-referrer、nosniff 与 frame denial。

## 本地运行

先构建站点，再挂载 fixture：

```bash
npm run build
READING_DATA_DIR="tests/fixtures/reading" \
READING_WEEKLY_DATA_DIR="tests/fixtures/reading-weekly" \
READING_WEEKLY_BASIC_AUTH_SHA256="<test-only-username:password 的小写 SHA-256>" \
npm run serve:reading
```

默认公开地址是 `http://127.0.0.1:4173/reading/`，weekly 地址是 `http://127.0.0.1:4173/reading/weekly/`。服务器只接受 `127.0.0.1`、`localhost` 或 `::1`，不应改成局域网或公网监听。需要用仓库外数据验证时，只通过环境变量挂载；不要复制到 `public/` 或 `out/`。

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
   npm run test:reading:weekly:functions
   npm run test:reading:weekly:validator
   npm run test:reading:weekly:browser
   npm run test:reading:weekly:leaks
   npm run test:i18n:locale
   npm run test:reading:public-release
   npm run test:reading:security
   READING_PRIVATE_DATA_DIR="/absolute/private/source/path" npm run check:reading:leaks
   READING_WEEKLY_PRIVATE_DATA_FILE="/absolute/private/weekly/topics.json" npm run check:reading:leaks
   ```

5. 将四份发布 JSON 上传到新的不可变 R2 `releases/<release-id>` 前缀，逐文件回读校验后再切换 `READING_DATA_PREFIX`。不得覆盖现有 release。
6. 数据端点有短期 CDN 缓存。切换 prefix 后应清除四个公开 JSON URL 的缓存，或等待缓存窗口结束，再执行线上验收。

### Weekly 数据更新门禁

1. 在仓库外编辑 `topics.json`，权限保持 `0600`；三种 locale、核心词长度、四步计划、当前课题唯一性和文献引用都必须通过 validator 与 Function contract。
2. Preview 只上传 synthetic fixture 到新的 `weekly/releases/<preview-release-id>`，设置 Preview 专用 prefix 和测试 secret。
3. 验证匿名、错误凭据、正确凭据、`GET/HEAD`、别名路径、缓存预热后匿名仍为 401，以及公开 `/reading/` 不被认证影响。
4. 只有 Preview 的服务器认证全部通过，才允许把真实 `topics.json` 上传到 Production 的新不可变 prefix。不得覆盖现有对象，也不得先把真实数据上传到 Preview。
5. 对真实文件运行 `READING_WEEKLY_PRIVATE_DATA_FILE=... npm run check:reading:leaks`；扫描器检查当前工作树、`out/`、搜索/RSC/JS 文件及全部可达 Git 文本历史，并且不会打印私有值。

## Cloudflare 配置

Production 与 Preview 均需要：

1. 私有 R2 bucket，以及变量名为 `READING_DATA` 的 Pages R2 binding。
2. 格式为 `releases/<release-id>` 的 `READING_DATA_PREFIX`。
3. 格式为 `weekly/releases/<immutable-release-id>` 的 `READING_WEEKLY_DATA_PREFIX`。
4. 仅作为 secret 保存的 `READING_WEEKLY_BASIC_AUTH_SHA256`；值是 UTF-8 `username:password` 的小写 SHA-256。Production 与 Preview 使用不同凭据，secret 不写入 TOML、Git、命令参数或日志。
5. `out/_routes.json` 中包含 `/reading` 与 `/reading/*`，且没有相应 exclude。
6. Pages Runtime 保持 Fail closed，避免 Function 故障时绕过 allowlist 和安全响应头。建议再为 weekly 的连续 401 配置 Cloudflare 限速规则。

公开 Reading 不读取 Basic Auth secret。新版代码完成部署并通过匿名访问验收后，应从 Production 和 Preview 删除历史 `READING_BASIC_AUTH_SHA256`；不要删除 weekly 的独立 secret。

## 线上验收

对自定义域名、默认 Pages 域名以及本次不可变 deployment URL 分别运行：

```bash
node scripts/test-reading-deployment.mjs \
  https://example.org \
  https://example.pages.dev \
  https://deployment.example.pages.dev
```

weekly 验收必须按环境分别运行，因为 Preview 与 Production 的凭据不同。凭据通过标准输入提供，不能放入 URL、shell 历史或进程参数：

```bash
node scripts/test-reading-weekly-deployment.mjs https://preview.example.pages.dev
node scripts/test-reading-weekly-deployment.mjs https://kkshao.org.cn
```

线上验收固定要求严格公开 DTO：只有四份文件根级允许出现 `visibility`，且其值必须为 `public`。部署测试不提供私有 schema 兼容模式。

验收必须确认：

- 匿名 `GET/HEAD /reading` 返回无正文 308，并跳到同源 `/reading/`。
- 匿名 `GET/HEAD /reading/` 和四个 JSON 均成功，不出现认证 challenge。
- `/reading/data/export.json` 与 lookup 404；weekly 页面、静态别名和 `topics.json` 在匿名或错误凭据下均为 401。
- 正确 weekly 凭据可以读取页面和严格校验后的 `topics.json`；weekly secret 缺失、binding 或 prefix 无效时 fail closed。
- Preview 凭据不能访问 Production，Production 凭据也不能访问 Preview。
- Reading 的非 `GET/HEAD` 请求返回 405，R2 binding/prefix 不可用时数据端点返回 503。
- 成功响应可公开缓存且没有 `X-Robots-Tag: noindex`；CSP、same-origin、nosniff 和 frame protections 保持有效。
- 四份 JSON 逐层只包含公开 DTO 白名单字段；`view_config.json` 不包含 weekly、export、网页编辑开关或两个私有 graph 字段。
- 公共 HTML、RSC、`search-index.json`、`/_next/static/**` 和 source map 不包含上游私有材料或 lookup 内容。
- 首页、Publications、Theory Notes 与 Reading 导航均可匿名使用。

## 回滚

公开数据回滚时将 `READING_DATA_PREFIX` 指回上一个已验证 release，清除四个 JSON URL 的缓存，再复跑线上验收。weekly 数据回滚只切换 `READING_WEEKLY_DATA_PREFIX` 到上一个已验证的不可变 release；保留认证 secret 并再次验证匿名 401、正确凭据 200 与 `no-store`。代码回滚使用正常 Git revert 或 Cloudflare Pages 的先前 deployment。不得把 R2 数据复制到 `public/` 或 `out/` 作为临时恢复方式；binding、prefix 或 secret 异常应继续 fail closed。
