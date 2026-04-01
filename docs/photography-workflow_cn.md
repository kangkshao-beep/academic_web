# 摄影维护流程

当前仓库采用的是一套**精选摄影页维护流程**。

现在的摄影页面是“精选展示”，不是自动归档系统。原始照片与网站发布资源是分开的，这一点是刻意设计的。

## 目录职责

- `PHOTO/`
  - 本地原始图库
  - 不受 Git 管理
  - 不直接部署到网站
- `public/photography/full/`
  - 网站使用的大图
  - 受 Git 管理
  - 会被部署
- `public/photography/thumbs/`
  - 网站使用的缩略图
  - 受 Git 管理
  - 会被部署
- `content/photography.toml`
  - 英文摄影索引与元数据
- `content_zh/photography.toml`
  - 中文摄影索引与元数据

## 为什么往 `PHOTO/` 里加图后 `git status` 没反应

因为 `PHOTO/` 在 `.gitignore` 中被明确忽略了。

这属于预期行为，不是异常。往 `PHOTO/` 里加新图，只代表你更新了本地原始图库，并不代表这张图片已经进入网站。

## 新照片发布流程

当前固定流程如下：

1. 先把原图放进 `PHOTO/`
2. 决定哪些文件需要公开上站
3. 生成两类网站资源：
   - 一张网页大图放进 `public/photography/full/`
   - 一张缩略图放进 `public/photography/thumbs/`
4. 在以下两个文件里补对应条目：
   - `content/photography.toml`
   - `content_zh/photography.toml`
5. 用 `npm run build` 或 `npm run dev` 本地检查
6. 提交并推送生成后的图片资源和索引变更

## 元数据要求

每张公开发布的照片，尽量补齐以下已确认信息：

- 标题
- 日期
- 地点
- 机身
- 镜头
- alt 文本
- 简短说明

如果原图没有保留完整 EXIF，就不要猜测缺失字段。只能写能够确认的信息。

## 你和 Codex 的协作方式

后续的固定协作流程是：

1. 你把原图放进 `PHOTO/`
2. 你明确告诉 Codex 哪些文件要上站
3. Codex 负责生成网站资源并更新摄影索引文件

这样可以在保持摄影页轻量的同时，把更大的原始图库留在本地，不直接耦合到部署目录。
