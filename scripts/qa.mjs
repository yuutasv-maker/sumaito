#!/usr/bin/env node
/**
 * scripts/qa.mjs
 *
 * LP本番クリーン版（<project>/）に対する品質保証（QA）自動検証ツール。
 * DELIVERY_CHECKLIST.md に定義された P0（ブロッカー）および P1（推奨・警告）項目を静的解析します。
 *
 * 使い方:
 *   npm run qa                  # 全案件を検査
 *   npm run qa -- sumaito       # 特定の案件のみ検査
 *   npm run qa -- sumaito --packaging # 納品パッケージング時モード（noindex, フォーム未設定等を P0 厳格判定）
 *   npm run qa -- sumaito --json # 結果を JSON ファイル (qa/<project>_qa_<timestamp>.json) に保存
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// カラー出力ヘルパー
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

// 許可リスト定義
const ALLOWED_ROOT_FILE_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.txt', '.xml',
]);
const ALLOWED_SUB_DIRECTORIES = new Set([
  'images', 'assets', 'data', 'css', 'js', 'fonts',
]);
const FORBIDDEN_FILE_NAMES = new Set([
  'legacy.html', 'delivery.json', '.ds_store', 'thumbs.db',
]);

const LEAK_KEYWORDS = [
  'review-tip', '赤入れポイント', '要ヒアリング', '修正反映済み', '<del', '</del>', '<ins', '</ins>',
];
const DEV_KEYWORDS = [
  'TODO', 'FIXME', 'HACK', 'DEBUG', '仮置き', '要確認', 'ダミー', 'テスト用', '確認用',
];

// OGP / Twitter Card 必須メタタグ一覧 (5.2)
const REQUIRED_OGP_METAS = [
  { tag: 'og:site_name', isProperty: true },
  { tag: 'og:title', isProperty: true },
  { tag: 'og:description', isProperty: true },
  { tag: 'og:type', isProperty: true },
  { tag: 'og:image', isProperty: true },
  { tag: 'twitter:card', isProperty: false },
  { tag: 'twitter:title', isProperty: false },
  { tag: 'twitter:description', isProperty: false },
  { tag: 'twitter:image', isProperty: false },
];

/**
 * プロジェクト配下の全HTMLファイルを収集
 */
function getHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const htmls = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.html')) {
      htmls.push(path.join(dir, entry.name));
    }
  }
  return htmls;
}

/**
 * delivery.json を読み込み
 */
export function loadDeliveryConfig(projectName) {
  const sampleDir = path.join(REPO_ROOT, `${projectName}_sample`);
  const configPath = path.join(sampleDir, 'delivery.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 単一プロジェクトの QA 検証
 * @param {string} projectName
 * @param {object} options - { isPackaging: boolean }
 */
export function runProjectQA(projectName, options = {}) {
  const isPackaging = !!options.isPackaging;
  const prodDir = path.join(REPO_ROOT, projectName);
  const sampleDir = path.join(REPO_ROOT, `${projectName}_sample`);

  if (!fs.existsSync(prodDir)) {
    return {
      projectName,
      passed: false,
      errors: [`[P0] 本番ディレクトリが存在しません: ${prodDir} (npm run sync を先に実行してください)`],
      warnings: [],
      deliveryConfig: null,
    };
  }

  const deliveryConfig = loadDeliveryConfig(projectName);
  const errors = [];
  const warnings = [];

  // ==========================================
  // 1. 本番ディレクトリのホワイトリスト検証 (P0)
  // ==========================================
  const prodEntries = fs.readdirSync(prodDir, { withFileTypes: true });
  for (const entry of prodEntries) {
    const nameLower = entry.name.toLowerCase();
    const fullPath = path.join(prodDir, entry.name);

    if (entry.isDirectory()) {
      if (!ALLOWED_SUB_DIRECTORIES.has(nameLower)) {
        errors.push(`[P0: 2.3] 許可されていないサブディレクトリが本番に混入しています: ${entry.name}/`);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(nameLower);
      if (FORBIDDEN_FILE_NAMES.has(nameLower)) {
        errors.push(`[P0: 2.3] 納品禁止ファイルが本番に残存しています: ${entry.name}`);
      } else if (ext === '.md') {
        errors.push(`[P0: 2.3] 内部資料Markdownファイルが本番に混入しています: ${entry.name}`);
      } else if (!ALLOWED_ROOT_FILE_EXTENSIONS.has(ext)) {
        errors.push(`[P0: 2.3] 許可されていない拡張子のファイルが本番に存在します: ${entry.name}`);
      }
    }
  }

  // ==========================================
  // 2. HTMLファイルのコンテンツ静的解析
  // ==========================================
  const htmlFiles = getHtmlFiles(prodDir);
  if (htmlFiles.length === 0) {
    errors.push(`[P0: 2.1] 本番ディレクトリ内にHTMLファイルが1件も存在しません: ${projectName}`);
  }

  for (const htmlPath of htmlFiles) {
    const relHtmlPath = path.relative(REPO_ROOT, htmlPath);
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const isIndexHtml = path.basename(htmlPath) === 'index.html';

    // コメントを除去したHTML（タグの誤検知防止用）
    const htmlWithoutComments = html.replace(/<!--[\s\S]*?-->/g, '');

    // 2.1 注記・差分タグリーク (P0)
    for (const kw of LEAK_KEYWORDS) {
      if (html.includes(kw)) {
        errors.push(`[P0: 2.2] 注記/差分タグのリークを検出 [${kw}]: ${relHtmlPath}`);
      }
    }

    // 2.2 開発中コメント・未確定メモ (P0)
    for (const kw of DEV_KEYWORDS) {
      if (html.includes(kw)) {
        errors.push(`[P0: 2.5] 開発中コメント/未確定メモを検出 [${kw}]: ${relHtmlPath}`);
      }
    }

    // 2.3 外部リンク target="_blank" の rel="noopener noreferrer" 欠落 (P0)
    const linkRegex = /<a\b[^>]*\btarget\s*=\s*["']_blank["'][^>]*>/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(htmlWithoutComments)) !== null) {
      const tagStr = linkMatch[0];
      const hasRel = /rel\s*=\s*["'][^"']*["']/i.test(tagStr);
      const hasNoopener = /noopener/i.test(tagStr);
      const hasNoreferrer = /noreferrer/i.test(tagStr);
      if (!hasRel || !hasNoopener || !hasNoreferrer) {
        errors.push(`[P0: 7.1] target="_blank" に rel="noopener noreferrer" が欠落しています: ${relHtmlPath} (${tagStr.slice(0, 60)}...)`);
      }
    }

    // 2.4 ルート相対パス（/images/等）の禁止 (P0)
    const rootRelRegex = /\b(src|href)\s*=\s*["']\/([a-zA-Z0-9_\-\.]+)[^"']*["']/gi;
    let rootRelMatch;
    while ((rootRelMatch = rootRelRegex.exec(htmlWithoutComments)) !== null) {
      const attr = rootRelMatch[0];
      if (!attr.includes('://') && !attr.startsWith('src="//') && !attr.startsWith('href="//')) {
        errors.push(`[P0: 6.2] サーバー非依存でないルート相対パスが使われています: ${relHtmlPath} (${attr})`);
      }
    }

    // 2.5 未ピン留め・変動外部CDNの禁止 (P0/P1) (6.3)
    if (htmlWithoutComments.includes('@latest')) {
      errors.push(`[P0: 6.3] バージョン未固定のCDN (@latest) が参照されています: ${relHtmlPath}`);
    }
    if (htmlWithoutComments.includes('cdn.tailwindcss.com')) {
      const isApproved = deliveryConfig && deliveryConfig.allowTailwindCdn;
      if (isApproved) {
        warnings.push(`[P1: 6.3 - 承認済み] Tailwind Play CDN (cdn.tailwindcss.com) が本番で読み込まれています (delivery.json にて許容設定済み): ${relHtmlPath}`);
      } else {
        warnings.push(`[P1: 6.3] Tailwind Play CDN (cdn.tailwindcss.com) が本番で読み込まれています。本番ビルドCSS化または固定版の利用を推奨: ${relHtmlPath}`);
      }
    }

    // 2.6 ローカルアセット参照切れ（404）チェック (P0) (6.1)
    const assetRegex = /\b(src|href)\s*=\s*["']([^"':#?]+)["']/gi;
    let assetMatch;
    while ((assetMatch = assetRegex.exec(htmlWithoutComments)) !== null) {
      const assetPath = assetMatch[2].trim();
      if (
        !assetPath ||
        assetPath.startsWith('http://') ||
        assetPath.startsWith('https://') ||
        assetPath.startsWith('//') ||
        assetPath.startsWith('mailto:') ||
        assetPath.startsWith('tel:') ||
        assetPath.startsWith('javascript:') ||
        assetPath.startsWith('#')
      ) {
        continue;
      }

      const htmlDir = path.dirname(htmlPath);
      const resolvedAssetPath = path.resolve(htmlDir, assetPath.split('#')[0].split('?')[0]);
      if (!fs.existsSync(resolvedAssetPath)) {
        errors.push(`[P0: 6.1] リンク切れローカルアセットを検出 (404): ${relHtmlPath} -> ${assetPath}`);
      }
    }

    // 2.7 問い合わせフォームの送信先実在チェック (P0) (3.2)
    if (htmlWithoutComments.includes('<form')) {
      const formHasDummyAction = /<form\b[^>]*action\s*=\s*["'](#|\s*)["']/i.test(htmlWithoutComments);
      const jsHasFetch = /fetch\s*\(|XMLHttpRequest|axios|\$\.ajax/i.test(htmlWithoutComments);

      const hasConfiguredEndpoint = deliveryConfig && deliveryConfig.formEndpoint;

      if (formHasDummyAction && !jsHasFetch && !hasConfiguredEndpoint) {
        if (isPackaging) {
          errors.push(`[P0: 3.2] 納品ブロッカー: お問い合わせフォームの送信先（action属性または formEndpoint）が未設定です。モック状態での納品はできません: ${relHtmlPath}`);
        } else {
          warnings.push(`[P1: 3.2 - クライアント確認待ち] フォームがモック状態（action="#"）です。納品パッケージングまでに送信先エンドポイントを設定してください: ${relHtmlPath}`);
        }
      }
    }

    // 2.8 メタタグ・SEO (5.1)
    if (!/<title\b[^>]*>.*?<\/title>/i.test(htmlWithoutComments)) {
      errors.push(`[P0: 5.1] <title> タグが存在しません: ${relHtmlPath}`);
    }
    if (!/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/i.test(htmlWithoutComments)) {
      errors.push(`[P0: 5.1] <meta name="viewport"> が存在しません: ${relHtmlPath}`);
    }
    if (!/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/i.test(htmlWithoutComments)) {
      if (isIndexHtml) {
        errors.push(`[P0: 5.1] メインLPに <meta name="description"> が存在しません: ${relHtmlPath}`);
      } else {
        warnings.push(`[P1: 5.1] サブページに <meta name="description"> がありません: ${relHtmlPath}`);
      }
    }

    // 2.9 OGP / Twitter Card 完備チェック (5.2) & OGP画像実在チェック (5.3)
    if (isIndexHtml) {
      for (const item of REQUIRED_OGP_METAS) {
        const attrName = item.isProperty ? 'property' : 'name';
        const pattern = new RegExp(`<meta\\b[^>]*${attrName}\\s*=\\s*["']${item.tag}["'][^>]*>`, 'i');
        if (!pattern.test(htmlWithoutComments)) {
          errors.push(`[P0: 5.2] 必須OGP/Twitterメタタグが欠落しています: <meta ${attrName}="${item.tag}"> in ${relHtmlPath}`);
        }
      }

      // OGP画像のファイル実在検証 (5.3)
      const ogImageMatch = /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(htmlWithoutComments);
      if (ogImageMatch) {
        const ogImgVal = ogImageMatch[1].trim();
        let localPath = ogImgVal;
        if (ogImgVal.startsWith('http://') || ogImgVal.startsWith('https://')) {
          const urlObj = new URL(ogImgVal);
          localPath = urlObj.pathname.replace(/^\/[^\/]+\//, ''); // リポジトリプレフィックス考慮
        }
        const resolvedOgImg = path.resolve(prodDir, localPath.replace(/^\//, ''));
        if (!fs.existsSync(resolvedOgImg) && !ogImgVal.startsWith('http')) {
          errors.push(`[P0: 5.3] og:image で指定されている画像ファイルが実在しません: ${ogImgVal}`);
        }

        if (!ogImgVal.startsWith('http://') && !ogImgVal.startsWith('https://')) {
          if (deliveryConfig && deliveryConfig.productionUrl) {
            warnings.push(`[P1: 5.3] og:image が相対パス (${ogImgVal}) です。SNSシェア用完全URL (${deliveryConfig.productionUrl}${ogImgVal}) への設定を推奨: ${relHtmlPath}`);
          } else {
            warnings.push(`[P1: 5.3] og:image が相対パス (${ogImgVal}) です。本番ドメイン確定後は絶対URLへの更新を推奨: ${relHtmlPath}`);
          }
        }
      }
    }

    // 2.10 noindex 警告 / ブロッカー判定 (5.5)
    const hasNoindex = /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex[^"']*["']/i.test(htmlWithoutComments);
    if (hasNoindex) {
      const allowIndex = deliveryConfig ? deliveryConfig.allowIndex : true;
      if (isPackaging && allowIndex) {
        errors.push(`[P0: 5.5] 納品ブロッカー: 本番ファイルに noindex が設定されています。検索流入を許可する本番納品では解除が必要です: ${relHtmlPath}`);
      } else {
        warnings.push(`[P1: 5.5] robotsメタタグに noindex が設定されています（確認プレビュー用）。納品ZIP生成時に allowIndex に応じて解除されます: ${relHtmlPath}`);
      }
    }

    // 2.11 コピーライト表記の自動検証 (P0) (7.2)
    if (isIndexHtml) {
      const hasCopyright = /(©|&copy;|Copyright)\s*202\d/i.test(htmlWithoutComments);
      if (!hasCopyright) {
        errors.push(`[P0: 7.2] フッター等の著作権表記（例: © 2026 Company Name）に正しい年・表記が含まれていません: ${relHtmlPath}`);
      }
    }

    // 2.12 画像の alt 属性欠落 (P1) (7.6) & loading="lazy" (P1) (6.4)
    const imgRegex = /<img\b([^>]*)>/gi;
    let imgMatch;
    let imgIndex = 0;
    while ((imgMatch = imgRegex.exec(htmlWithoutComments)) !== null) {
      const imgAttrs = imgMatch[1];
      if (!/\balt\s*=/i.test(imgAttrs)) {
        warnings.push(`[P1: 7.6] <img> タグに alt 属性が存在しません: ${relHtmlPath} (${imgMatch[0].slice(0, 50)}...)`);
      }
      // 2枚目以降の loading="lazy" 検証 (6.4)
      if (imgIndex > 0 && !/\bloading\s*=\s*["']lazy["']/i.test(imgAttrs)) {
        // ファーストビュー画像以外での遅延読み込み推奨（警告数過多を避けるため代表検知）
        if (imgIndex === 1) {
          warnings.push(`[P1: 6.4] FV以外の画像に loading="lazy" が付与されていません（パフォーマンス向上のため遅延読み込みを推奨）: ${relHtmlPath}`);
        }
      }
      imgIndex++;
    }
  }

  // ==========================================
  // 3. 画像ファイル容量チェック (P1: 1MB超) (6.4)
  // ==========================================
  const imagesDir = path.join(prodDir, 'images');
  if (fs.existsSync(imagesDir)) {
    const scanLargeFiles = (dir) => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          scanLargeFiles(itemPath);
        } else if (item.isFile()) {
          const stats = fs.statSync(itemPath);
          if (stats.size > 1024 * 1024) {
            const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
            warnings.push(`[P1: 6.4] 1MBを超える大容量画像を検出 (${sizeMb} MB): ${path.relative(REPO_ROOT, itemPath)} (WebP化やリサイズ・圧縮を推奨)`);
          }
        }
      }
    };
    scanLargeFiles(imagesDir);
  }

  return {
    projectName,
    passed: errors.length === 0,
    errors,
    warnings,
    deliveryConfig,
  };
}

/**
 * CLI 実行
 */
function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const isPackaging = args.includes('--packaging');
  const targetProject = args.find((a) => !a.startsWith('--'));

  let projects = [];
  if (targetProject) {
    projects = [targetProject.replace(/_sample\/?$/, '').replace(/\/$/, '')];
  } else {
    const rootEntries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
    projects = rootEntries
      .filter((e) => e.isDirectory() && e.name.endsWith('_sample'))
      .map((e) => e.name.replace(/_sample$/, ''));
  }

  console.log(`\n${c.bold}========================================${c.reset}`);
  console.log(`${c.bold}  LP 最終納品前品質保証（QA）静的検証${isPackaging ? ' [納品モード]' : ''}${c.reset}`);
  console.log(`${c.bold}========================================${c.reset}\n`);

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = [];

  for (const proj of projects) {
    const res = runProjectQA(proj, { isPackaging });
    results.push(res);

    console.log(`${c.bold}▶ 案件: ${res.projectName}${c.reset}`);

    if (res.errors.length === 0 && res.warnings.length === 0) {
      console.log(`  ${c.green}✓ 全チェック項目合格（エラー・警告ゼロ）${c.reset}`);
    } else {
      for (const err of res.errors) {
        console.log(`  ${c.red}✖ ${err}${c.reset}`);
        totalErrors += 1;
      }
      for (const warn of res.warnings) {
        console.log(`  ${c.yellow}▲ ${warn}${c.reset}`);
        totalWarnings += 1;
      }
    }
    console.log('');
  }

  // JSON 出力オプション
  if (isJson) {
    const qaDir = path.join(REPO_ROOT, 'qa');
    if (!fs.existsSync(qaDir)) fs.mkdirSync(qaDir, { recursive: true });
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(qaDir, `qa_report_${dateStr}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`${c.cyan}QAレポートを保存しました: ${path.relative(REPO_ROOT, jsonPath)}${c.reset}\n`);
  }

  console.log(`${c.bold}----------------------------------------${c.reset}`);
  if (totalErrors === 0) {
    console.log(`${c.green}${c.bold}【判定: 合格】P0ブロッカー 0 件 (警告: ${totalWarnings} 件)${c.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${c.red}${c.bold}【判定: 不合格】P0ブロッカー ${totalErrors} 件が検出されました。即時修正が必要です。${c.reset}\n`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
