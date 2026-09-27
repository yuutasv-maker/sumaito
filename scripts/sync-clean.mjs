#!/usr/bin/env node
/**
 * sync-clean.mjs
 *
 * <project>_sample/ を正（Single Source of Truth）とし、
 * HTML内のすべての `.review-tip` 要素（要ヒアリング・赤入れポイント・修正反映済みボックス）を
 * 内部の <div> ネスト階層を考慮して正確に除去した上で、<project>/（本番クリーン版）へ同期します。
 *
 * 使い方:
 *   npm run sync                  # リポジトリ内の全 <project>_sample を検出して同期
 *   npm run sync -- sumaito       # 特定の案件（例: sumaito）のみ同期
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * インライン差分タグ（<del class="diff-del">旧</del> と <ins class="diff-ins">新</ins>）を本番用にクリーン化する。
 * - <del ...>.*?</del> は要素ごと完全に除去（削除）
 * - <ins ...>(.*?)</ins> はタグのみ剥がして内部テキストを残す（採用）
 */
function cleanDiffTags(html) {
  let result = html;
  // <del>...</del> の完全除去（改行含む任意の文字）
  result = result.replace(/<del\b[^>]*>([\s\S]*?)<\/del>/gi, '');
  // <ins>...</ins> のタグ解除（中のコンテンツのみ保持）
  result = result.replace(/<ins\b[^>]*>([\s\S]*?)<\/ins>/gi, '$1');
  // 確認用 インライン差分ハイライトCSSブロックの除去
  result = result.replace(/[ \t]*\/\* 確認用 インライン差分ハイライト \*\/[\s\S]*?\.diff-ins\s*\{[\s\S]*?\}\n?/gi, '');
  return result;
}

/**
 * HTML文字列から class に "review-tip" を持つ <div> ブロック（および直前のHTMLコメント）を
 * 内部の <div> ネスト深さを追跡して正確に除去し、さらにインライン差分（<del>/<ins>）も本番用にクリーン化する。
 */
function stripReviewTips(html) {
  let result = html;
  let removedCount = 0;

  // <div ... class="...review-tip..." ...> の開始位置を検索
  const openDivRegex = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\breview-tip\b[^"']*["'][^>]*>/i;

  while (true) {
    const match = openDivRegex.exec(result);
    if (!match) break;

    const divStartIndex = match.index;
    const afterOpenTagIndex = divStartIndex + match[0].length;

    // ネストされた <div ...> と </div> を走査して対応する閉じ </div> を見つける
    const tagTokenizer = /<\/?div\b[^>]*>/gi;
    tagTokenizer.lastIndex = afterOpenTagIndex;

    let depth = 1;
    let divEndIndex = -1;
    let token;

    while ((token = tagTokenizer.exec(result)) !== null) {
      if (token[0].startsWith('</')) {
        depth -= 1;
      } else if (!token[0].endsWith('/>')) {
        depth += 1;
      }
      if (depth === 0) {
        divEndIndex = token.index + token[0].length;
        break;
      }
    }

    if (divEndIndex === -1) {
      throw new Error('Unclosed .review-tip <div> detected in HTML.');
    }

    // 直前にあるインデントや単一行コメント（<!-- ...ポイント... --> 等）も一緒に除去して空行残りを防ぐ
    const beforeSlice = result.slice(0, divStartIndex);
    const leadingCommentRegex = /(\n[ \t]*<!--[^\n]*-->)?\n[ \t]*$/;
    const leadingMatch = leadingCommentRegex.exec(beforeSlice);
    const cutStart = leadingMatch ? divStartIndex - leadingMatch[0].length : divStartIndex;

    // 直後の改行・空白調整
    let cutEnd = divEndIndex;
    if (result.slice(cutEnd, cutEnd + 1) === '\n' && cutStart === divStartIndex) {
      cutEnd += 1;
    }

    result = result.slice(0, cutStart) + result.slice(cutEnd);
    removedCount += 1;
  }

  // インライン差分（<del>の除去と<ins>のアンラップ）
  result = cleanDiffTags(result);

  return { cleanedHtml: result, removedCount };
}

/**
 * 単一プロジェクトの <project>_sample/ -> <project>/ 同期処理
 */
function syncProject(projectName) {
  const sampleDir = path.join(REPO_ROOT, `${projectName}_sample`);
  const prodDir = path.join(REPO_ROOT, projectName);

  if (!fs.existsSync(sampleDir)) {
    console.error(`[ERROR] Sample directory not found: ${sampleDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(prodDir)) {
    fs.mkdirSync(prodDir, { recursive: true });
  }

  console.log(`\n=== Syncing: ${projectName}_sample/ -> ${projectName}/ ===`);

  const entries = fs.readdirSync(sampleDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.html')) {
      const srcPath = path.join(sampleDir, entry.name);
      const destPath = path.join(prodDir, entry.name);

      const rawHtml = fs.readFileSync(srcPath, 'utf-8');
      const { cleanedHtml, removedCount } = stripReviewTips(rawHtml);

      // リーク検証（本番版に注記キーワードや差分タグが残っていないかチェック）
      const leakKeywords = ['review-tip', '赤入れポイント', '要ヒアリング', '修正反映済み', '<del', '</del>', '<ins', '</ins>'];
      for (const kw of leakKeywords) {
        if (cleanedHtml.includes(kw)) {
          throw new Error(
            `[LEAK DETECTED] Keyword/tag "${kw}" still exists in ${projectName}/${entry.name}.`
          );
        }
      }

      fs.writeFileSync(destPath, cleanedHtml, 'utf-8');
      console.log(`  ✓ ${entry.name} (removed ${removedCount} .review-tip block(s))`);
    }
  }

  // images/ ディレクトリの同期
  const sampleImages = path.join(sampleDir, 'images');
  const prodImages = path.join(prodDir, 'images');
  if (fs.existsSync(sampleImages)) {
    fs.cpSync(sampleImages, prodImages, { recursive: true });
    console.log(`  ✓ images/ synced`);
  }
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

  if (projects.length === 0) {
    console.log('No <project>_sample directories found.');
    return;
  }

  for (const proj of projects) {
    syncProject(proj);
  }
  console.log('\nAll projects synced cleanly.');
}

main();
