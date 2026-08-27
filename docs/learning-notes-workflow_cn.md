# 学习笔记更新流程

“基础理论物理学习”栏目只发布确认要公开的 PDF 笔记。课程讲义、参考资料或未经确认的文件不会自动上传。

## 文件位置

将每个对外发布的 PDF 放入对应课程目录：

```text
public/notes/<course-id>/<YYYY.MMDD>.pdf
```

例如：

```text
public/notes/quantum-field-theory/2026.0809.pdf
```

当前课程 ID：

- `quantum-field-theory`
- `gauge-field-theory`
- `particle-physics`
- `group-theory-lie-groups-and-algebras`
- `field-theory-frontiers`

## 内容记录

在 `content/learning.toml`、`content_zh/learning.toml` 和 `content_zh-hk/learning.toml` 中找到对应课程，并更新当前版本与 PDF 路径：

```toml
[[courses]]
id = "quantum-field-theory"
title = "量子场论"
version = "2026.0809"
pdf = "/notes/quantum-field-theory/2026.0809.pdf"

[[courses.updates]]
date = "2026-08-09"
content = "这里填写本次更新的简讯。"
```

`version` 使用 `YYYY.MMDD` 格式。每次发布新 PDF 时，替换当前的 `version` 与 `pdf`，并新增一条 `courses.updates` 记录。页面会自动按日期从新到旧显示时间线。

英文、简体中文与香港繁体中文 TOML 保持相同的课程 ID、版本和 PDF 路径；只翻译课程名和更新简讯。

## 搜索索引

`public/` 下已发布的 PDF 会在运行 `npm run dev` 和 `npm run build` 时被扫描。生成的 `public/search-index.json` 不提交到 Git，而是在每次部署构建时重新生成。

若希望笔记能够被搜索，PDF 必须能在普通阅读器中选中并复制文字。索引按页记录 PDF 文本，并在文件存在书签时以书签作为章节标签。扫描件或无法提取文字的 PDF 会输出构建警告并被跳过，不会阻塞发布。

## 发布

确认 PDF 和简讯无误后，运行构建并推送 `main`。Cloudflare Pages 会自动发布新版本。
