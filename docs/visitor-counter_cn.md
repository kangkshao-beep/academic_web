# 网站浏览量计数器

网站右下角的“最近一周浏览量”和“累计浏览量”由 Cloudflare Pages Function 与 D1 数据库提供。

它统计的是**页面浏览量**：首次打开页面和站内切换到另一页都会各计一次。累计值从功能启用之日开始统计，不能回溯补齐此前的历史访问量。

数据库只保存按中国标准时间（UTC+8）汇总的日期和浏览量；不会保存 IP 地址、Cookie、用户代理、来源页面或访问路径。

## 一次性启用

1. 在 Cloudflare 控制台进入 **Workers & Pages -> D1 SQL Database**，新建一个数据库，例如 `kkshao-traffic`。
2. 打开该数据库的 SQL Console，执行 [`database/visitor-counter.sql`](../database/visitor-counter.sql) 中的建表语句。
3. 本仓库的 [`wrangler.toml`](../wrangler.toml) 已声明 Production 环境的 `TRAFFIC_DB` 绑定及 `TRAFFIC_ENABLED=true`；请保留该文件中的数据库名称和 ID。Cloudflare Pages 会随 `main` 分支部署读取此配置，Preview 部署不会写入正式统计。
4. 重新部署 `main` 分支。部署完成后，访问网站即可开始计数。

未设置 D1 绑定或环境变量时，右下角组件会自动隐藏，不会展示错误的零值。

## 维护与核对

- 数据按北京时间的最近七个日历日汇总。
- 可以在 D1 SQL Console 中执行 `SELECT day, views FROM traffic_daily ORDER BY day DESC;` 查看每天的原始汇总。
- `functions/api/traffic.ts` 仅接受同源 JSON `POST` 请求，响应禁止缓存；它会跳过常见爬虫标识，但这不是反作弊系统。
- 若要暂停公开显示，可移除 `TRAFFIC_ENABLED` 或 D1 绑定；已有聚合数据会保留在 D1 中。
