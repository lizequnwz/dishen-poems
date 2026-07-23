# 谛深禅诗

内容优先、静态生成、渐进增强的谛深禅诗数字策展网站。首页始终呈现按创作日期排序的最新五首，单诗页与时间档案覆盖全部公开作品；程序化水墨场景是可替换的视觉层，不代表作品已完成最终策展。

## 本地运行

```sh
npm install
npm run dev
```

完整验证与生产构建：

```sh
npm run build
```

该命令依次运行 Astro 类型与内容检查、Vitest、PDF 导入规则单元测试和静态构建，产物位于 `dist/`。

## 新增诗歌

每首诗只使用一个 `poems/YYYY-MM-DD-诗题.md` 文件。手工新增诗歌必须从 `status: ingested` 开始，人工确认诗题、正文、标点、特殊用字、创作日期与来源后才可改为 `verified`。唯一自动例外是“已校准 PDF 版式＋高置信抽取”，详见下方导入流程。

```md
---
id: poem-20260721-example
slug: 2026-07-21-example
title: 示例
writtenDate: "2026-07-21"
originalScript: simplified
source:
  kind: manual
  label: 待确认来源
status: ingested
descriptiveTags: []
visualProfile:
  palette: paper
  motifs: [mist, brush]
  composition: open-left
  light: dawn
  intensity: quiet
---
诗文正文
```

`title`、`writtenDate`、`id` 与 `slug` 是结构化权威字段。`writtenDate` 只接受完整、有效、无歧义的公历 `YYYY-MM-DD`。文件名必须与日期和标题一致；URL 一经公开，不随文件名或标题修正而变化。简繁显示由 OpenCC 构建时派生，需要时使用每诗 `scriptOverrides` 保存人工审核例外。

`visualProfile` 的五个字段均可省略；数据层会用月份、正文中的字面视觉信号和稳定作品 ID 确定性补齐。自动识别的雨、雪、山、月、花等只保存在内部解析结果与 PDF 审计报告中，不会自动写入公开 `descriptiveTags`。

## 导入 PDF 旧作

导入器只考虑具有完整公历年月日的分行诗歌，默认只读，不会修改 `poems/`：

```sh
python3 -m pip install -r requirements/pdf-import.txt
python3 scripts/import_pdf_poems.py
python3 scripts/render_pdf_calibration.py
```

报告位于 `tmp/pdf-import/report.json`，每种版式的代表半页图位于 `tmp/pdf-import/calibration/`。每发现一种版式，必须人工核对代表作，并在 `imports/pdf-layout-calibrations.json` 中显式记录 `status: "calibrated"`；实施者和导入器都不得自行批准。

确认版式后重新 dry-run，检查标题、正文、日期、页码、左右区域、内容指纹、坐标／裁剪一致性与重复冲突。只有已校准版式的高置信诗歌才可成为 `verified`。显式写入命令如下，且不会覆盖现有文件：

```sh
python3 scripts/import_pdf_poems.py --apply --publish-year latest
```

导入器会完成全量候选重建，但一次只为指定年份的合格作品生成 `verified` Markdown；其余诗歌在报告中保持隐藏的 `ingested` 候选，不会提前写入内容目录。每个年份完成线上档案、前后导航、随机漫游和静态构建检查后，再以明确年份运行下一批。

## 管理展览

展览清单位于 `exhibitions/`，集中保存有序作品 ID 与 `draft`、`published`、`archived` 状态。正式构建要求恰好一个 `published` 展览，且任何展览都不能引用 `ingested` 作品。展览顺序不再驱动首页或单诗前后导航；首页使用最新五首，单诗导航使用全库日期顺序且不循环。

开发环境中的草稿预览路径为 `/preview/exhibitions/<id>/`；草稿不会进入生产构建。

## 候选音频与批准闸门

候选清单位于 `src/data/audio-assets.json`，本地开发试听页为 `/preview/audio/candidates/`，生产构建既不会生成该路由，也不会复制 `audio/candidates/` 中的试听文件。三个古琴与四个环境声均从 Wikimedia Commons 的 MP3 转码下载，状态保持 `candidate`；只有用户试听确认噪声、响度、循环接缝和整体效果，将文件移入公开音频目录，并补齐 `approvedAt`、`approvedBy` 与 `review.listening: approved` 后，资源才会进入正式播放器和署名页。

正式播放器使用古琴顺序循环与四选一环境层，不自动播放、不提供时间轴，初始 `preload="none"`。ClientRouter 保留播放器节点；主题、语言、分享、随机漫游与揭示动画统一在 `astro:page-load` 初始化。页面进入后台或硬刷新后都保持暂停。

## 设计与决策

- [产品规格](docs/superpowers/specs/2026-07-20-dishen-zen-poetry-website-design.md)
- [实施计划](docs/superpowers/plans/2026-07-21-dishen-poetry-mvp-implementation.md)
- [领域语言](CONTEXT.md)
- [架构决策](docs/adr/)

当前没有分析 SDK、Cookie 或外部策展图片。音频只保存必要的本地偏好，不设置服务端 Cookie。
