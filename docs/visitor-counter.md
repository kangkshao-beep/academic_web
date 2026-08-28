# Site Traffic Counter

The “Views in last 7 days” and “Total views” summary beside “Built with PRISM” in the footer is backed by a Cloudflare Pages Function and a D1 database.

It records **page views**: opening a page and navigating to another page inside the site each add one view. Totals begin when the feature is enabled and cannot recreate historical traffic from before that date.

The database stores only a daily aggregate date and view count in China Standard Time (UTC+8). It does not store IP addresses, cookies, user agents, referrers, or page paths.

## One-time setup

1. In the Cloudflare dashboard, open **Workers & Pages -> D1 SQL Database** and create a database, for example `kkshao-traffic`.
2. Open its SQL Console and run the schema in [`database/visitor-counter.sql`](../database/visitor-counter.sql).
3. The repository's [`wrangler.toml`](../wrangler.toml) already declares the Production-only `TRAFFIC_DB` binding and `TRAFFIC_ENABLED=true`. Keep its database name and ID intact. Cloudflare Pages reads this configuration on `main` deployments; Preview deployments do not write to the production counter.
4. Redeploy the `main` branch. Visits begin to count after the deployment completes.

Without the D1 binding or environment variable, the widget hides itself rather than showing an incorrect zero.

## Maintenance and checks

- The weekly figure covers the most recent seven China Standard Time calendar days.
- Run `SELECT day, views FROM traffic_daily ORDER BY day DESC;` in the D1 SQL Console to inspect daily aggregates.
- `functions/api/traffic.ts` accepts only same-origin JSON `POST` requests and disables response caching. It skips common crawler signatures but is not an anti-fraud system.
- To pause the public display, remove `TRAFFIC_ENABLED` or the D1 binding. Existing aggregate data stays in D1.
