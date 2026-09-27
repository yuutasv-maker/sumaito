#!/usr/bin/env node
/**
 * init-project.mjs
 *
 * 新規LP案件の立ち上げ時に、最初から3ディレクトリ構成を自動生成します:
 *   1. <project>/         : 本番公開・納品用クリーン版
 *   2. <project>_sample/  : クライアント確認・レビュー版（Single Source of Truth / .review-tip 注記付き）
 *   3. <project>_frame/   : 初期枠組み版（ワイヤーフレーム構成）
 *
 * 使い方:
 *   npm run init-project -- <project_name>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const projectName = process.argv[2];

if (!projectName || projectName.startsWith('-')) {
  console.error('Usage: npm run init-project -- <project_name>');
  process.exit(1);
}

if (!/^[a-z0-9_-]+$/i.test(projectName)) {
  console.error('Error: Project name must be alphanumeric (e.g. "client_lp").');
  process.exit(1);
}

const dirs = [
  projectName,
  `${projectName}_sample`,
  `${projectName}_frame`,
];

for (const d of dirs) {
  const fullPath = path.join(REPO_ROOT, d);
  if (fs.existsSync(fullPath)) {
    console.error(`Error: Directory "${d}" already exists.`);
    process.exit(1);
  }
}

// ベーステンプレートとして _templates/housing_lp_frame が存在する場合は骨格をコピー、なければディレクトリ作成
const templateFrameDir = path.join(REPO_ROOT, '_templates', 'housing_lp_frame');

for (const d of dirs) {
  const targetDir = path.join(REPO_ROOT, d);
  fs.mkdirSync(path.join(targetDir, 'images'), { recursive: true });

  if (fs.existsSync(templateFrameDir)) {
    for (const file of ['index.html', 'company.html', 'privacy.html']) {
      const srcFile = path.join(templateFrameDir, file);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(targetDir, file));
      }
    }
  }
}

console.log(`
============================================================
Initialized 3-directory structure for project: "${projectName}"
============================================================
  1. ${projectName}/         (Production Clean)
  2. ${projectName}_sample/  (Client Review - Single Source of Truth)
  3. ${projectName}_frame/   (Wireframe Archive)

Next Steps:
  1. Edit content & add .review-tip notes in "${projectName}_sample/".
  2. Run "npm run sync -- ${projectName}" to generate clean HTML in "${projectName}/".
  3. Add project card to root "index.html" and test suite to "tests/ui-interaction.spec.ts".
`);
