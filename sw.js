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
 *  ★このファイルは 公開用を作る.py が a86f54ac57 を版の印に
 *    書き換えてから公開されます。
 * ============================================================ */

const VERSION = 'a86f54ac57';
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

/** IndexedDB の kv に1つ書きます（もう知らせた通を覚えるため） */
function kvSet(key, val) {
  return new Promise((ok) => {
    let req;
    try { req = indexedDB.open(DB_NAME); } catch (e) { ok(false); return; }
    req.onerror = () => ok(false);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) { ok(false); return; }
      try {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = () => ok(true);
        tx.onerror = () => ok(false);
      } catch (e) { ok(false); }
    };
  });
}

const PUSH_MAX = 8;          // 一度に出す通知の数（鳴りっぱなしを防ぎます）
const WAIT_TAG = 'mailboard-new';
const ICONS = { icon: 'img/app-icon-192.png', badge: 'img/app-icon-192.png' };

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    /* ★**先に1つ出してから**、件名を取りに行きます。
     *
     *   件名は受け口（Apps Script）に聞きに行きます。向こうが眠っていると
     *   返事に数秒かかり、**その間に iOS が世話係を止めてしまうことがあります。**
     *   先に出しておけば、少なくとも「来たこと」は必ず分かります
     *   （2026-11-20、ko-dai さんの「通知が毎回来るわけではない」）。
     *
     *   件名が取れたら、この1つを消して、1通ずつ出し直します。
     */
    await self.registration.showNotification('新しいメール', Object.assign({
      body: '件名を取りに行っています…', tag: WAIT_TAG, renotify: true,
    }, ICONS));

    const srcs = (await kvGet('pushSrc')) || [];
    const got = await Promise.all(srcs.map((s) =>
      askBrief(s).then((d) => (d ? { name: s.name, d } : null))));
    const live = got.filter((x) => x && x.d && x.d.n);

    if (!live.length) {
      // 受け口に聞けなかったとき。★消さずに、文だけ置き換えます
      await self.registration.showNotification('新しいメール', Object.assign({
        body: '新着があります', tag: WAIT_TAG, renotify: true,
      }, ICONS));
      return;
    }

    // ★**1通ずつ、送り主と件名で**知らせます（2026-11-19）。
    //   もう知らせた通は出しません。出すと、見るたびに同じ通知が並びます
    const seen = (await kvGet('pushSeen')) || [];
    const seenSet = new Set(seen.map(String));
    const fresh = [];
    live.forEach((x) => {
      (x.d.list || []).forEach((m) => {
        if (!m || !m.id || seenSet.has(String(m.id))) return;
        fresh.push({ name: x.name, m });
      });
    });

    if (!fresh.length) {
      // 新しく知らせるものが無い（もう知らせたぶんだけ）。
      // ★iOS は「通知を出さない push」を嫌うので、出したものは消さずに置き換えます
      const n = live.reduce((a, x) => a + Number(x.d.n || 0), 0);
      await self.registration.showNotification('新しいメール', Object.assign({
        body: '未読 ' + n + '通', tag: WAIT_TAG, renotify: true,
      }, ICONS));
      return;
    }

    const show = fresh.slice(0, PUSH_MAX);
    for (const { name, m } of show) {
      await self.registration.showNotification(
        (m.from || '差出人なし') + '（' + name + '）', Object.assign({
          body: m.subj || '（件名なし）',
          tag: 'mail-' + m.id,          // ★1通ごとに別の印。並んで出ます
          data: { at: Date.now() },
        }, ICONS));
    }
    if (fresh.length > show.length) {
      await self.registration.showNotification('ほか ' + (fresh.length - show.length) + '通', Object.assign({
        body: '新しいメールが届いています', tag: 'mailboard-more', renotify: true,
      }, ICONS));
    }
    // ★先に出した「取りに行っています…」を片づけます（中身が出そろったので）
    try {
      const olds = await self.registration.getNotifications({ tag: WAIT_TAG });
      olds.forEach((n) => n.close());
    } catch (err) { /* 消せなくても困りません */ }
    // 覚えておくのは新しい200件だけ（増え続けないように）
    await kvSet('pushSeen', fresh.map((x) => String(x.m.id)).concat(seen).slice(0, 200));
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
