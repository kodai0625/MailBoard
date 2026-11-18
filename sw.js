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
 *  ★このファイルは 公開用を作る.py が 24da39c63d を版の印に
 *    書き換えてから公開されます。
 * ============================================================ */

const VERSION = '24da39c63d';
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

/* ============================================================
 *  プッシュ通知
 *
 *  ★**通知には中身が入っていません。**受け口から届くのは
 *    「変わったよ」の合図だけです。件名や差出人は、ここから
 *    ふだんの道（受け口）に聞きに行きます。
 *    こうすると、**メールの中身が Apple や Google の通知の道を
 *    通りません。**
 *
 *  ★合言葉は localStorage にありますが、ここ（サービスワーカー）からは
 *    読めません。だからアプリ側が IndexedDB にも写しています。
 * ========================================================== */

const DB_NAME = 'mail-board-v1';   // ★js/config.js の APP.storageKey と同じにすること

/** IndexedDB の kv から1つ読みます */
function kvGet(key) {
  return new Promise((ok) => {
    let req;
    try { req = indexedDB.open(DB_NAME); } catch (e) { ok(null); return; }
    req.onerror = () => ok(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) { ok(null); return; }
      try {
        const g = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        g.onsuccess = () => ok(g.result || null);
        g.onerror = () => ok(null);
      } catch (e) { ok(null); }
    };
  });
}

/** 受け口に「いまの一言」を聞きます。だめなら null */
async function askBrief(src) {
  try {
    const res = await fetch(src.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ pin: src.pin, action: 'brief' }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d && d.ok ? d : null;
  } catch (e) { return null; }
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let title = '新しいメール';
    let body = '新着があります';
    const srcs = (await kvGet('pushSrc')) || [];
    const got = await Promise.all(srcs.map((s) =>
      askBrief(s).then((d) => (d ? { name: s.name, d } : null))));
    const live = got.filter((x) => x && x.d.n);
    if (live.length) {
      const total = live.reduce((a, x) => a + Number(x.d.n || 0), 0);
      const head = live[0];
      // ★「どこに」「誰から」「何の件名か」まで出します。
      //   「新着があります」だけだと、開くまで分かりません
      title = head.d.from ? head.d.from + '（' + head.name + '）' : head.name;
      body = (head.d.subj || '（件名なし）')
           + (total > 1 ? '\nほか ' + (total - 1) + '通' + (head.d.more ? '以上' : '') : '');
    }
    await self.registration.showNotification(title, {
      body,
      tag: 'mailboard-new',          // ★まとめて1つにします（鳴りっぱなしを防ぐ）
      renotify: true,
      icon: 'img/app-icon-192.png',
      badge: 'img/app-icon-192.png',
      data: { at: Date.now() },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.indexOf(self.registration.scope) === 0) {
        // ★開いているものがあれば、そこへ戻して取り込ませます
        c.postMessage({ type: 'push-open' });
        return c.focus();
      }
    }
    return self.clients.openWindow(self.registration.scope);
  })());
});
