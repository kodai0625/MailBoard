/* ============================================================
 *  Mail Board — 端末の中の置き場
 *
 *  【なぜ端末に索引を持つのか】
 *  カテゴリーを切り替えるたびに Gmail へ問い合わせていては、
 *  1回ごとに2〜3秒待たされます。それでは「すぐ探せる」に
 *  なりません。**差出人・件名・日時だけ**を最初にまとめて
 *  受け取り、端末の中に置いておきます。
 *  そのあとの絞り込みと検索は、通信なしで一瞬で終わります。
 *
 *  【本文は置きません】
 *  本文まで持つと、端末に「メールの複製」ができます。開いた
 *  ときにその都度取りに行くほうが、置き場の中身は軽くて済みます。
 *
 *  【なぜ1通1件で入れないのか】
 *  2万件を1件ずつ出し入れすると、iPhone では数秒かかります。
 *  2000通ずつの束にして入れると、読み書きは十数回で済みます。
 * ============================================================ */

const Store = {
  db: null,
  CHUNK: 2000,

  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((ok, ng) => {
      const req = indexedDB.open(APP.storageKey, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => { this.db = req.result; ok(this.db); };
      req.onerror = () => ng(req.error);
    });
  },

  _tx(store, mode) {
    return this.db.transaction(store, mode).objectStore(store);
  },

  _wrap(req) {
    return new Promise((ok, ng) => {
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ng(req.error);
    });
  },

  async get(key) { await this.open(); return this._wrap(this._tx('kv', 'readonly').get(key)); },
  async set(key, val) { await this.open(); return this._wrap(this._tx('kv', 'readwrite').put(val, key)); },

  // 索引1行の形の版。列を足したらここを1つ上げます
  FMT: 2,

  /** ためてある索引を全部読み出します（新しい順に並べ直して返します） */
  async loadAll() {
    await this.open();
    const parts = await this._wrap(this._tx('chunks', 'readonly').getAll());
    if (!parts.length) return [];
    const rows = [].concat.apply([], parts);
    rows.sort((a, b) => b[2] - a[2]);
    return rows;
  },

  /** 索引をまるごと置き直します */
  async saveAll(rows) {
    await this.open();
    const db = this.db;
    return new Promise((ok, ng) => {
      const tx = db.transaction('chunks', 'readwrite');
      const st = tx.objectStore('chunks');
      st.clear();
      for (let i = 0; i * this.CHUNK < rows.length; i++) {
        st.put(rows.slice(i * this.CHUNK, (i + 1) * this.CHUNK), i);
      }
      tx.oncomplete = () => { this.savedLen = rows.length; ok(rows.length); };
      tx.onerror = () => ng(tx.error);
    });
  },

  /**
   * **1行だけ**変わったときに、その行が入っている束だけを書き直します。
   *
   * ★前は1通読むたびに索引をまるごと書き直していました（5万3千行・27束）。
   *   変わるのは1行なので、束1つ（2千行）で足ります（2026-11-22）。
   * ★行の数が変わっていたら束の切れ目がずれるので、そのときは全部書きます。
   *   数が同じでも、並べ替えがあれば崩れるため、**既読の印を付けるときだけ**使います。
   */
  async savePart(rows, i) {
    if (i < 0) return 0;
    await this.open();
    if (this.savedLen !== rows.length) return this.saveAll(rows);
    const db = this.db;
    const k = Math.floor(i / this.CHUNK);
    const part = rows.slice(k * this.CHUNK, (k + 1) * this.CHUNK);
    return new Promise((ok, ng) => {
      const tx = db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').put(part, k);
      tx.oncomplete = () => ok(part.length);
      tx.onerror = () => ng(tx.error);
    });
  },

  async clear() {
    await this.open();
    const db = this.db;
    return new Promise((ok, ng) => {
      const tx = db.transaction(['chunks', 'kv'], 'readwrite');
      tx.objectStore('chunks').clear();
      tx.objectStore('kv').clear();
      tx.oncomplete = () => ok();
      tx.onerror = () => ng(tx.error);
    });
  },
};
