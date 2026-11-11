#!/usr/bin/env node
/**
 * sync-clean.mjs
 *
 * <project>_sample/ を正（Single Source of Truth）とし、
 * HTML内のすべての `.review-tip` 要素（要ヒアリング・赤入れポイント・修正反映済みボックス）を
 * 内部の <div> ネスト階層を考慮して正確に除去した上で、<project>/（本番クリーン版）へ同期します。
 *
 * 【厳格ホワイトリスト方式】
 * - 本番ディレクトリ（<project>/）には Web 公開に必要なアセットのみを許可。
 * - 内部資料（.md 全般, legacy.html, tests/, qa/, .DS_Store 等）は一切同期せず、
 *   既存の本番ディレクトリに残存している場合は自動パージ（削除）します。
 *
 * 使い方:
 *   npm run sync                  # リポジトリ内の全 <project>_sample を検出して同期
 *   npm run sync -- sumaito       # 特定の案件（例: sumaito）のみ同期
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

// 本番ルート直下に許可するファイル拡張子（小文字）
const ALLOWED_ROOT_FILE_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.ico',
  '.txt',
  '.xml',
]);

// 本番配下に許可するサブディレクトリ名
const ALLOWED_SUB_DIRECTORIES = new Set([
  'images',
  'assets',
  'data',
  'css',
  'js',
  'fonts',
]);

// 本番に配置してはならないファイル名（完全一致）
const FORBIDDEN_FILE_NAMES = new Set([
  'legacy.html',
  'delivery.json',
  '.ds_store',
  'thumbs.db',
]);

/**
 * インライン差分タグ（<del class="diff-del">旧</del> と <ins class="diff-ins">新</ins>）を本番用にクリーン化する。
 * - <del ...>.*?</del> は要素ごと完全に除去（削除）
 * - <ins ...>(.*?)</ins> はタグのみ剥がして内部テキストを残す（採用）
 */
export function cleanDiffTags(html) {
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
export function stripReviewTips(html) {
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
 * 本番ディレクトリ内の不要・禁止ファイル（.md, legacy.html, tests/, qa/, .DS_Store 等）を自動パージする
 */
function purgeForbiddenFiles(prodDir, sampleFilesSet) {
  if (!fs.existsSync(prodDir)) return;

  const prodEntries = fs.readdirSync(prodDir, { withFileTypes: true });
  for (const entry of prodEntries) {
    const entryNameLower = entry.name.toLowerCase();
    const fullPath = path.join(prodDir, entry.name);

    if (entry.isDirectory()) {
      // 許可外のサブディレクトリは削除（tests/, qa/ など）
      if (!ALLOWED_SUB_DIRECTORIES.has(entryNameLower)) {
        console.log(`  ⌫ Purging unauthorized directory: ${entry.name}/`);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entryNameLower);
      const isForbiddenName = FORBIDDEN_FILE_NAMES.has(entryNameLower);
      const isForbiddenExt = !ALLOWED_ROOT_FILE_EXTENSIONS.has(ext) || ext === '.md';
      const isDeletedInSample = !sampleFilesSet.has(entry.name);

      if (isForbiddenName || isForbiddenExt || isDeletedInSample) {
        console.log(`  ⌫ Purging unauthorized/orphan file: ${entry.name}`);
        fs.rmSync(fullPath, { force: true });
      }
    }
  }
}

/**
 * 単一プロジェクトの <project>_sample/ -> <project>/ 同期処理
 */
export function syncProject(projectName) {
  const sampleDir = path.join(REPO_ROOT, `${projectName}_sample`);
  const prodDir = path.join(REPO_ROOT, projectName);

  if (!fs.existsSync(sampleDir)) {
    throw new Error(`[ERROR] Sample directory not found: ${sampleDir}`);
  }
  if (!fs.existsSync(prodDir)) {
    fs.mkdirSync(prodDir, { recursive: true });
  }

  console.log(`\n=== Syncing: ${projectName}_sample/ -> ${projectName}/ ===`);

  const sampleEntries = fs.readdirSync(sampleDir, { withFileTypes: true });
  const sampleRootFiles = new Set(sampleEntries.filter(e => e.isFile()).map(e => e.name));

  // 1. 本番ディレクトリの先行パージ（不要・禁止ファイルの一掃）
  purgeForbiddenFiles(prodDir, sampleRootFiles);

  // 2. ルートファイルの同期（検証を行ってから書き込み）
  for (const entry of sampleEntries) {
    const entryNameLower = entry.name.toLowerCase();
    const ext = path.extname(entryNameLower);

    // 禁止ファイルや .md は本番へ持ち込まない
    if (FORBIDDEN_FILE_NAMES.has(entryNameLower) || ext === '.md') {
      continue;
    }

    const srcPath = path.join(sampleDir, entry.name);
    const destPath = path.join(prodDir, entry.name);

    if (entry.isFile()) {
      if (ext === '.html') {
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

        // 開発中コメント・未確定メモの残存検証 (DELIVERY_CHECKLIST 2.5)
        const devKeywords = ['TODO', 'FIXME', 'HACK', 'DEBUG', '仮置き', '要確認', 'ダミー', 'テスト用', '確認用'];
        for (const dkw of devKeywords) {
          if (cleanedHtml.includes(dkw)) {
            throw new Error(
              `[DEV COMMENT DETECTED] Development memo/comment "${dkw}" still exists in ${projectName}/${entry.name}.`
            );
          }
        }

        fs.writeFileSync(destPath, cleanedHtml, 'utf-8');
        console.log(`  ✓ ${entry.name} (removed ${removedCount} .review-tip block(s))`);
      } else if (ALLOWED_ROOT_FILE_EXTENSIONS.has(ext)) {
        // 静的ファイル（css, js, json, svg, png 等）の同期
        if (ext === '.css' || ext === '.js') {
          const fileContent = fs.readFileSync(srcPath, 'utf-8');
          const devKeywords = ['TODO', 'FIXME', 'HACK', 'DEBUG', '仮置き', '要確認', 'ダミー', 'テスト用', '確認用'];
          for (const dkw of devKeywords) {
            if (fileContent.includes(dkw)) {
              throw new Error(
                `[DEV COMMENT DETECTED] Development memo/comment "${dkw}" found in ${projectName}/${entry.name}.`
              );
            }
          }
        }

        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✓ ${entry.name} copied`);
      }
    }
  }

  // 3. 許可サブディレクトリの同期（images, assets, data, css, js, fonts）
  for (const subDir of ALLOWED_SUB_DIRECTORIES) {
    const sampleSub = path.join(sampleDir, subDir);
    const prodSub = path.join(prodDir, subDir);

    if (fs.existsSync(sampleSub)) {
      // サブディレクトリ内をミラーリングコピー
      fs.cpSync(sampleSub, prodSub, { recursive: true });

      // 万一サブディレクトリ内に .DS_Store があれば削除
      const removeDsStore = (dir) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const p = path.join(dir, item.name);
          if (item.isDirectory()) {
            removeDsStore(p);
          } else if (item.name === '.DS_Store' || item.name === 'Thumbs.db') {
            fs.rmSync(p, { force: true });
          }
        }
      };
      removeDsStore(prodSub);

      console.log(`  ✓ ${subDir}/ synced cleanly`);
    } else if (fs.existsSync(prodSub)) {
      // sample 側に存在しない場合は prod 側からも削除
      fs.rmSync(prodSub, { recursive: true, force: true });
    }
  }
}

export function getAllProjectNames() {
  const rootEntries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
  return rootEntries
    .filter((e) => e.isDirectory() && e.name.endsWith('_sample'))
    .map((e) => e.name.replace(/_sample$/, ''));
}

function main() {
  const targetArg = process.argv[2];
  let projects = [];

  if (targetArg) {
    projects = [targetArg.replace(/_sample\/?$/, '').replace(/\/$/, '')];
  } else {
    projects = getAllProjectNames();
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

// CLI 直接実行時のみ main を呼ぶ
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
