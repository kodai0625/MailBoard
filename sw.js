/* ============================================================
 *  読み込みの世話係（サービスワーカー）
 *
 *  なぜ必要か
 *    ホーム画面に追加したアプリは、iPhone が index.html を
 *    かなり長いあいだ端末に持ち続けます。そのため、GitHub に
 *    新しいファイルを上げても、アプリを開き直すと古い画面が
 *    出てくる、ということが起きます。
 *    （画面の「更新する」を押したときだけ新しくなるのは、
 *      あのボタンが URL に印を付けて読み直しているためです）
 *
 *  ここで何をしているか
 *    ページそのもの（index.html）は、開くたびに必ず通信して
 *    新しいものを取りに行きます。通信できないときだけ、
 *    端末に控えてあるものを出します。
 *
 *    css / js / img は ?v=… という印が付いていて、中身が変われば
 *    印も変わります。つまり古い控えが混ざる心配がないので、
 *    控えがあればそれをそのまま使います（起動が速くなります）。
 *
 *  ★このファイルは 公開用を作る.py が de6f7098a8 を版の印に
 *    書き換えてから公開されます。
 * ============================================================ */

const VERSION = 'de6f7098a8';
const CACHE = 'mailboard-' + VERSION;

/* 新しいこのファイルが届いたら、前のものを待たずにすぐ交代します */
self.addEventListener('install', () => {
  self.skipWaiting();
});

/* 交代したら、古い版の控えを捨てて、開いている画面をすぐ受け持ちます */
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => (n === CACHE ? null : caches.delete(n))));
    await self.clients.claim();
  })());
});

async function keep(req, res) {
  if (!res || !res.ok || res.type === 'opaque') return res;
  const cache = await caches.open(CACHE);
  cache.put(req, res.clone());
  return res;
}

/** 通信を先に試し、だめなら控えを出す（ページ本体むけ） */
async function networkFirst(req) {
  try {
    return await keep(req, await fetch(req));
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

/** 控えがあればそれを出し、無ければ取りに行く（?v= 付きのファイルむけ） */
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  return keep(req, await fetch(req));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // 送信（同期）は素通し

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // Google への同期は素通し
  if (url.pathname.endsWith('/version.json')) return;  // 版の確認は必ず本物を見る

  // ページ本体は毎回通信して確かめる。ここが今回の直したところです
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }

  // 中身が変われば印（?v=）も変わるので、控えをそのまま使ってよい
  if (url.searchParams.has('v')) { e.respondWith(cacheFirst(req)); return; }

  e.respondWith(networkFirst(req));
});
