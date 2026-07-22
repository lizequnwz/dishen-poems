# 谛深禅诗

内容优先、静态生成、渐进增强的谛深禅诗数字策展网站。当前 MVP 使用 Astro 构建五首已校勘作品的长卷、单诗页与时间档案；程序化水墨场景是可替换的暂代视觉，不代表作品已完成最终策展。

## 本地运行

```sh
npm install
npm run dev
```

完整验证与生产构建：

```sh
npm run build
```

该命令依次运行 Astro 类型与内容检查、Vitest 测试和静态构建，产物位于 `dist/`。

## 新增诗歌

每首诗只使用一个 `poems/YYYY-MM-DD-诗题.md` 文件。新诗必须从 `status: ingested` 开始，人工确认诗题、正文、标点、特殊用字、创作日期与来源后才可改为 `verified`。

文件结构示例：

```md
---
id: poem-20260721-example
slug: 2026-07-21-example
title: 示例
writtenDate: "2026-07-21"
originalScript: simplified
source: 待确认来源
status: ingested
descriptiveTags: []
visualKey: spring-rest
---
诗文正文
```

`title`、`writtenDate`、`id` 与 `slug` 是结构化权威字段。文件名必须与日期和标题一致；URL 一经公开，不随文件名或标题修正而变化。简繁显示由 OpenCC 构建时派生，需要时使用每诗 `scriptOverrides` 保存人工审核例外。

## 管理展览

展览清单位于 `exhibitions/`，集中保存有序作品 ID 与 `draft`、`published`、`archived` 状态。作品文件不保存 `featured` 或 `exhibitionOrder`。正式构建要求恰好一个 `published` 展览，且任何展览都不能引用 `ingested` 作品。

开发环境中的草稿预览路径为 `/preview/exhibitions/<id>/`；草稿不会进入生产构建。

## 设计与决策

- [产品规格](docs/superpowers/specs/2026-07-20-dishen-zen-poetry-website-design.md)
- [实施计划](docs/superpowers/plans/2026-07-21-dishen-poetry-mvp-implementation.md)
- [领域语言](CONTEXT.md)
- [架构决策](docs/adr/)

当前没有分析 SDK、Cookie、音频或外部策展图片。后续工作以系统临时目录中的 handoff 为准。
