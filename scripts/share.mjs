import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 4173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// 1. 静的HTTPサーバーの作成
const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath.endsWith('/')) {
    reqPath += 'index.html';
  }

  let filePath = path.join(rootDir, reqPath);

  // ディレクトリトラバーサル防止
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  // PROJECT #01: 住宅 スマイト（sumaito）のトンネル外部公開終了（Cloudflare経由のリクエストを404遮断）
  const isExternalRequest = req.headers['cf-ray'] ||
                            (req.headers['host'] && req.headers['host'].includes('trycloudflare.com')) ||
                            req.headers['x-forwarded-proto'];

  if (isExternalRequest && (
    reqPath.startsWith('/sumaito') ||
    reqPath.startsWith('/sumaito_sample') ||
    reqPath.startsWith('/sumaito_frame')
  )) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found: PROJECT #01（住宅 スマイト）の外部共有トンネルは終了しました。');
  }

  // ディレクトリ指定時に末尾スラッシュ補正
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    if (!req.url.endsWith('/')) {
      res.writeHead(301, { Location: req.url + '/' });
      return res.end();
    }
    filePath = path.join(filePath, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Local Server] Started at http://127.0.0.1:${PORT}`);
  startCloudflaredTunnel();
});

let tunnelProcess = null;

function startCloudflaredTunnel() {
  console.log('[Cloudflare] Starting quick tunnel (trycloudflare.com)...');

  tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let urlDetected = false;

  const handleOutput = (data) => {
    const text = data.toString();
    // デバッグ用出力（必要に応じて）
    // process.stdout.write(text);

    if (!urlDetected) {
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !match[0].includes('api.trycloudflare.com')) {
        urlDetected = true;
        const publicUrl = match[0];
        printShareBanner(publicUrl);

        // macOS pbcopy
        try {
          const pbcopy = spawn('pbcopy');
          pbcopy.stdin.write(publicUrl);
          pbcopy.stdin.end();
          console.log('\n  📋 公開URLをクリップボードにコピーしました！');
        } catch (_) {}
      }
    }
  };

  tunnelProcess.stdout.on('data', handleOutput);
  tunnelProcess.stderr.on('data', handleOutput);

  tunnelProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`\n[Cloudflare] Tunnel exited with code ${code}`);
    }
    cleanupAndExit(code || 0);
  });
}

function printShareBanner(publicUrl) {
  console.log('\n' + '='.repeat(68));
  console.log(' 🚀 Cloudflare 一時共有URLが発行されました！');
  console.log('='.repeat(68));
  console.log(`\n  🔗 ポータルTOP（全体一覧）:`);
  console.log(`     \x1b[1m\x1b[36m${publicUrl}/\x1b[0m\n`);
  console.log(`  📱 各案件ダイレクトリンク:`);
  console.log(`     - 車屋 (car_hub) ライト新装: ${publicUrl}/car_hub_light/`);
  console.log(`     - 車屋 (car_hub) 確認版    : ${publicUrl}/car_hub_sample/`);
  console.log(`     - 車屋 (car_hub) 本番版    : ${publicUrl}/car_hub/`);
  console.log(`     - bar Mano a Mano 確認版   : ${publicUrl}/manoamano_sample/`);
  console.log(`     - bar Mano a Mano 本番版   : ${publicUrl}/manoamano/`);
  console.log(`     - 唐揚げ いけだ屋 確認版   : ${publicUrl}/ikedaya_sample/`);
  console.log(`     - 唐揚げ いけだ屋 本番版   : ${publicUrl}/ikedaya/`);
  console.log(`     - 住宅 スマイト (sumaito)  : [共有終了 / 閉鎖中]`);
  console.log('\n' + '='.repeat(68));
  console.log(' ※ 終了するには [Ctrl + C] を押してください。');
  console.log('='.repeat(68) + '\n');
}

function cleanupAndExit(code = 0) {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill('SIGTERM');
    } catch (_) {}
    tunnelProcess = null;
  }
  if (server) {
    server.close();
  }
  process.exit(code);
}

process.on('SIGINT', () => {
  console.log('\n[Shutting down] トンネルおよびローカルサーバーを終了しています...');
  cleanupAndExit(0);
});
process.on('SIGTERM', () => {
  cleanupAndExit(0);
});
