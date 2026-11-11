#!/usr/bin/env node
/**
 * scripts/draft-status.mjs
 *
 * 初稿提示前ステータス自動集計・生成ツール。
 * <project>_sample/ を静的解析し、セクション一覧、赤入れポイント、初稿規約順守状況（差分タグ・緑ボックス混入なし）、
 * noindex設定、仮連絡先安全性を自動チェックした上で、
 * <project>_sample/DRAFT_STATUS.md を生成・更新します。
 *
 * 使い方:
 *   npm run draft-status -- <project>   # 例: npm run draft-status -- ikedaya
 *   npm run draft-status                # 全 sample プロジェクトを処理
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * HTMLからセクション一覧（id, 見出し）を抽出
 */
function extractSections(html) {
  const sections = [];
  
  // FV / ヘッダー
  if (/<header\b/i.test(html) || /class="[^"]*hero/i.test(html) || /id="hero"/i.test(html)) {
    sections.push({ id: 'hero / header', name: 'ファーストビュー（FV / ヘッダー）' });
  }

  // <section ...> タグを走査
  const sectionRegex = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi;
  let match;
  while ((match = sectionRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];

    const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const id = idMatch ? idMatch[1] : 'section-' + (sections.length + 1);

    // h1, h2, h3 などの見出しテキストを抽出
    const headingMatch = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(content);
    let heading = '';
    if (headingMatch) {
      heading = headingMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    }

    sections.push({
      id,
      name: heading ? `${id}（${heading.slice(0, 30)}）` : id,
    });
  }

  // フッター
  if (/<footer\b/i.test(html)) {
    sections.push({ id: 'footer', name: 'フッター / コピーライト' });
  }

  return sections;
}

/**
 * HTMLから注記ブロック（赤入れポイント / 修正反映済み等）を抽出
 */
function extractTips(html) {
  const tips = [];
  const tipRegex = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\breview-tip\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  
  // ネストに対応するため簡易走査
  const openTipRegex = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\breview-tip\b[^"']*["'][^>]*>/gi;
  let match;
  while ((match = openTipRegex.exec(html)) !== null) {
    const startIndex = match.index;
    const slice = html.slice(startIndex, startIndex + 1500);

    // タイトル抽出 【...】
    const titleMatch = /【([^】]+)】/.exec(slice);
    const title = titleMatch ? titleMatch[1] : '注記';

    // 本文抽出
    const pMatch = /<p\b[^>]*>([\s\S]*?)<\/p>/.exec(slice);
    let desc = '';
    if (pMatch) {
      desc = pMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    }

    const isFixed = title.includes('修正反映済み');
    const isRedPoint = title.includes('赤入れポイント') || title.includes('要ヒアリング');

    tips.push({
      rawTitle: `【${title}】`,
      title,
      desc: desc.slice(0, 100),
      isFixed,
      isRedPoint,
    });
  }

  return tips;
}

/**
 * 初稿規約チェック（<del>/<ins>、緑ボックス混入、noindex等）
 */
function analyzeDraftRules(html, sampleDir) {
  const warnings = [];
  const violations = [];

  // 1. 本文差分タグ <del> / <ins> の混入チェック
  if (/<del\b/i.test(html) || /<ins\b/i.test(html)) {
    violations.push('初稿規約違反: 本文中に差分タグ (<del> または <ins>) が残存しています。初稿は最新テキストをプレーンに記述してください。');
  }

  // 2. 修正反映済みボックス（Emerald緑）の混入チェック
  if (/修正反映済み/.test(html)) {
    violations.push('初稿規約違反: 【修正反映済み】ボックスが残存しています。初稿フェーズでは未確定の【赤入れポイント】のみを配置してください。');
  }

  // 3. noindex の有無
  const hasNoindex = /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex[^"']*["']/i.test(html);
  if (!hasNoindex) {
    warnings.push('初稿プレビュー保護: sample版に <meta name="robots" content="noindex"> が設定されていません。検索エンジンへの早期インデックスを防ぐため設定を推奨します。');
  }

  // 4. 実在しうる仮電話番号の検知
  const telMatches = html.match(/tel:([0-9\-]+)/g) || [];
  for (const tel of telMatches) {
    const num = tel.replace('tel:', '');
    if (num === '090-1234-5678' || num === '080-1234-5678' || num === '03-1234-5678') {
      warnings.push(`仮連絡先の注意: 実在しうるダミー番号 (${num}) が使われています。絶対に実在しない番号（000-0000-0000等）への変更を推奨します。`);
    }
  }

  // 5. CLIENT_SOURCE.md の存在確認
  const clientSourcePath = path.join(sampleDir, 'CLIENT_SOURCE.md');
  const hasClientSource = fs.existsSync(clientSourcePath);
  if (!hasClientSource) {
    warnings.push('一次情報ドキュメント: CLIENT_SOURCE.md が存在しません。一次情報や不可侵コピーの保全を推奨します。');
  }

  return { violations, warnings, hasNoindex, hasClientSource };
}

/**
 * 単一プロジェクトの DRAFT_STATUS.md を解析・出力
 */
export function generateDraftStatus(projectName) {
  const sampleDir = path.join(REPO_ROOT, `${projectName}_sample`);
  if (!fs.existsSync(sampleDir)) {
    console.error(`${c.red}エラー: ディレクトリが見つかりません: ${sampleDir}${c.reset}`);
    return null;
  }

  const indexPath = path.join(sampleDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error(`${c.red}エラー: index.html が見つかりません: ${indexPath}${c.reset}`);
    return null;
  }

  const html = fs.readFileSync(indexPath, 'utf-8');
  const sections = extractSections(html);
  const tips = extractTips(html);
  const ruleAnalysis = analyzeDraftRules(html, sampleDir);

  const statusFilePath = path.join(sampleDir, 'DRAFT_STATUS.md');

  // 既存の DRAFT_STATUS.md があれば手動記入済みのステータスを読み取り復元
  let existingStatuses = {};
  if (fs.existsSync(statusFilePath)) {
    const existingContent = fs.readFileSync(statusFilePath, 'utf-8');
    const lineRegex = /-\s*\[([●▲⏳◐ー])\s*([^\]]+)\]\s*`?([^`:\n]+)`?[:：]?\s*(.*)/g;
    let m;
    while ((m = lineRegex.exec(existingContent)) !== null) {
      const key = m[3].trim();
      existingStatuses[key] = {
        mark: m[1],
        label: m[2],
        note: m[4].trim(),
      };
    }
  }

  const today = new Date().toISOString().split('T')[0];

  // Markdown コンテンツの組み立て
  let md = `# 初稿ステータス管理シート: ${projectName}\n\n`;
  md += `> 本シートは、初稿LP（\`${projectName}_sample/\`）の制作状況と未確定ヒアリング箇所を可視化するダッシュボードです。\n`;
  md += `> クライアントへ提示する前に「どこができていて、どこが確認待ちか」を整理します。\n\n`;

  md += `## 1. 基本情報\n`;
  md += `- **案件名:** \`${projectName}\`\n`;
  md += `- **集計日時:** ${today}\n`;
  md += `- **確認用プレビューURL:** \`${projectName}_sample/index.html\`\n`;
  md += `- **一次情報原本:** \`${ruleAnalysis.hasClientSource ? 'CLIENT_SOURCE.md 整備済み' : 'CLIENT_SOURCE.md 未作成'}\`\n`;
  md += `- **検索エンジン除外 (noindex):** ${ruleAnalysis.hasNoindex ? '✅ 設定済み (noindex, nofollow)' : '⚠️ 未設定 (要確認)'}\n\n`;

  md += `---\n\n`;

  md += `## 2. 初稿規約チェック結果\n`;
  if (ruleAnalysis.violations.length === 0) {
    md += `✅ **初稿規約 合格**（本文中の \`<del>\` / \`<ins>\` 差分タグなし、緑色「修正反映済み」ボックスなし）\n\n`;
  } else {
    md += `⚠️ **要対応（初稿規約違反が検出されました）:**\n`;
    for (const v of ruleAnalysis.violations) {
      md += `- ❌ ${v}\n`;
    }
    md += `\n`;
  }

  if (ruleAnalysis.warnings.length > 0) {
    md += `**注意・推奨事項:**\n`;
    for (const w of ruleAnalysis.warnings) {
      md += `- 💡 ${w}\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;

  md += `## 3. セクション別 制作・確定ステータス\n`;
  md += `ステータス記号の定義:\n`;
  md += `- \`[● 確定]\`: 一次情報・支給素材に基づき初稿として確定\n`;
  md += `- \`[▲ 仮置き]\`: 一旦仮コピー・仮画像を配置（クライアントに赤入れ・意見を求める項目）\n`;
  md += `- \`[⏳ 支給待ち]\`: クライアントからの素材・情報支給を待っている項目\n`;
  md += `- \`[◐ 未完・作業中]\`: 制作側の作業が途中・これから着手する項目\n`;
  md += `- \`[ー 対象外]\`: 本案件では不要なセクション・項目\n\n`;

  md += `| セクション / 対象ブロック | ステータス | 状況メモ・確認内容 |\n`;
  md += `| :--- | :---: | :--- |\n`;

  for (const sec of sections) {
    const existing = existingStatuses[sec.id] || existingStatuses[sec.name];
    const mark = existing ? `[${existing.mark} ${existing.label}]` : '[▲ 仮置き]';
    const note = existing ? existing.note : '初稿レビュー待ち';
    md += `| \`${sec.id}\` <br><sub>${sec.name}</sub> | ${mark} | ${note} |\n`;
  }
  md += `\n---\n\n`;

  md += `## 4. ページ内【赤入れポイント】一覧（クライアント確認待ち箇所）\n`;
  md += `現在 \`${projectName}_sample/index.html\` 内に配置されている注記ボックス一覧です（合計: ${tips.length} 件）:\n\n`;

  if (tips.length === 0) {
    md += `（現在配置されている注記ボックスはありません）\n\n`;
  } else {
    md += `| # | 注記タイトル | 確認・ヒアリング内容サマリー |\n`;
    md += `| :-: | :--- | :--- |\n`;
    tips.forEach((t, idx) => {
      md += `| ${idx + 1} | **${t.rawTitle}** | ${t.desc || '—'} |\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;

  md += `## 5. クライアント提示用 添え状メッセージ（送付文テンプレート）\n`;
  md += `初稿プレビューをクライアントに送付する際は、以下のテキストをコピー＆調整してご活用ください。\n\n`;
  md += `\`\`\`markdown\n`;
  md += `お世話になっております。[制作担当者名] です。\n`;
  md += `ご依頼いただいておりますLP（Webサイト）の「初稿デザイン・構成案」が整いましたので、プレビューURLをご案内いたします。\n\n`;
  md += `■ 初稿プレビューURL（確認・注記付きバージョン）:\n`;
  md += `[プレビューURL（例: https://yuutasv-maker.github.io/sumaito/${projectName}_sample/）]\n\n`;
  md += `■ 初稿のご確認方法とお願い:\n`;
  md += `本プレビューは全体の構成と文章のトーンをすり合わせるための「初稿」です。\n`;
  md += `画面内に【赤入れポイント（赤・黄色の注記枠）】を ${tips.length} 箇所 配置しております。\n\n`;
  md += `特に以下の点について、率直なご意見・ご要望（赤入れ）をいただけますと幸いです：\n`;
  md += `1. キャッチコピー・説明文のトーン（想いや強みが表現されているか）\n`;
  md += `2. 掲載情報・数値の正確性（店舗情報、メニュー、価格、実績数値など）\n`;
  md += `3. 実物写真・ロゴのご支給（現在イメージ画像を仮置きしている箇所の差し替え用）\n\n`;
  md += `修正や追加のご要望がございましたら、気兼ねなくお申し付けください。\n`;
  md += `ご確認のほど、よろしくお願いいたします。\n`;
  md += `\`\`\`\n`;

  fs.writeFileSync(statusFilePath, md, 'utf-8');

  console.log(`\n${c.bold}========================================${c.reset}`);
  console.log(`${c.bold}  初稿ステータス集計: ${projectName}${c.reset}`);
  console.log(`${c.bold}========================================${c.reset}`);
  console.log(`  検出セクション数: ${sections.length} 件`);
  console.log(`  赤入れポイント数: ${tips.length} 件`);
  if (ruleAnalysis.violations.length === 0) {
    console.log(`  ${c.green}✓ 初稿規約: 合格（差分タグ・緑ボックスなし）${c.reset}`);
  } else {
    for (const v of ruleAnalysis.violations) {
      console.log(`  ${c.red}✖ ${v}${c.reset}`);
    }
  }
  for (const w of ruleAnalysis.warnings) {
    console.log(`  ${c.yellow}▲ ${w}${c.reset}`);
  }
  console.log(`  ${c.cyan}✓ ステータスシートを出力しました: ${projectName}_sample/DRAFT_STATUS.md${c.reset}\n`);

  return {
    projectName,
    sectionsCount: sections.length,
    tipsCount: tips.length,
    violations: ruleAnalysis.violations,
    warnings: ruleAnalysis.warnings,
  };
}

function main() {
  const targetArg = process.argv[2];
  let projects = [];

  if (targetArg) {
    projects = [targetArg.replace(/_sample\/?$/, '').replace(/\/$/, '')];
  } else {
    const rootEntries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
    projects = rootEntries
      .filter((e) => e.isDirectory() && e.name.endsWith('_sample'))
      .map((e) => e.name.replace(/_sample$/, ''));
  }

  for (const proj of projects) {
    generateDraftStatus(proj);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
