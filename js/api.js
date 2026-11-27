/* ============================================================
 *  Mail Board — 受け口との行き来
 *
 *  受け口は Google アカウントごとに1つあります（config.js の SOURCES）。
 *  どれも、そのアカウントの中で動く Apps Script です。メールは
 *  そこから直接この画面へ来ます。ほかのどこも通りません。
 *
 *  ★合言葉は受け口ごとに別です。1つ漏れても、もう片方の
 *    メールまでは読まれません。
 * ============================================================ */

/**
 * Google がそのまま返してくる英語の言い訳を、読める日本語にします。
 *
 * ★生のまま画面に出すと、200文字の英語と JSON が出て、
 *   何をすればいいのか分かりません。よくあるものだけ言い換えます。
 *   見覚えの無いものは、そのまま出します（隠すと調べられなくなるため）。
 */
function 読めるエラーに(msg) {
  const t = String(msg || '');
  if (/has not been used in project|accessNotConfigured|SERVICE_DISABLED/.test(t)) {
    return 'Gmail API がまだ使える状態になっていません。\n'
         + 'Apps Script を開いて、左の「サービス」の ＋ から '
         + '「Gmail API」を足してください。その後もう一度どうぞ。';
  }
  if (/urlfetch|1日にサービス|too many times for one day|Service invoked too many times for one day/.test(t)) {
    return '今日分の通信回数を使い切りました。\n'
         + 'Apps Script には1日の上限（普通の Google アカウントで2万回）が'
         + 'あります。日本時間の夕方16時頃に戻るので、その後'
         + '「続きを読み込む」を押してください。読んだところまでは残っています。';
  }
  if (/まとめ口/.test(t)) {
    return t + '\n（このまま1通ずつに戻すと、1日の上限をすぐ使い切ってしまうため止めました）';
  }
  if (/Rate Limit|rateLimitExceeded|Quota|429/.test(t)) {
    // ★元の文も短く添えます。言い換えだけだと、どこで断られたのかが
    //   分からず、直しようがありませんでした
    return 'Google 側が「少し急ぎすぎ」と言っています。'
         + '2〜3分置いて、もう一度どうぞ。読んだところまでは残っています。\n'
         + '（元の言い分： ' + t.slice(0, 140) + '）';
  }
  // ★受け口のコードが古いままだと、決まりごとの保存だけがここで
  //   こけます。「列の数が合いません」という Google の文だけでは
  //   何をすればいいのか分からないので、やることを書きます
  if (/number of columns|does not match the number of columns|列数/.test(t)) {
    return '受け口のコードが古いままです。決まり事の保存だけができません。\n'
         + '「コードをコピー.command」を押して Apps Script に貼り直し、'
         + '「デプロイを管理」から新しいバージョンで出し直してください。\n'
         + '（仕分けそのものはアプリの中で動いているので、'
         + '貼り直すまでの間もちゃんと分かれています）';
  }
  if (/Authorization is required|Login Required|401/.test(t)) {
    return 'Apps Script の許可が切れています。Apps Script を開いて '
         + '「準備する」を1回動かし、許可し直してください。';
  }
  if (/Exceeded maximum execution time/.test(t)) {
    return '1回分の時間を使いきりました。'
         + 'もう一度「続きを読み込む」を押すと、続きから始まります。';
  }
  if (/exception|internal error|Service invoked too many times/i.test(t)) {
    return 'Google 側が一時的に応えられませんでした。少しおいてもう一度どうぞ。\n'
         + '（元の言い分： ' + t.slice(0, 120) + '）';
  }
  return t;
}

/* ★通信そのものにかかった時間を、あとから探せるようにします。
 *
 *   アプリの中でストップウォッチを押すと、起動のときは索引の読み込みなど
 *   **手元の仕事が終わるまで止まりません。**通信が遅いのか手元が遅いのか
 *   が分かりません。ブラウザが自分で記録している時間（Resource Timing）なら、
 *   手元の忙しさに左右されません（2026-11-23、4.0秒→4.3秒で原因が見えなかったため）。
 *
 *   ★同じ受け口に同時に2つ頼むこと（取り込みと状態の確認）があるので、
 *     住所に目印（?mb=…）をつけて見分けます。受け口は目印を見ません。 */
let NET_N = 0;
try {
  // 記録は250件でいっぱいになり、それ以上は残りません。いっぱいになったら空けます
  performance.addEventListener('resourcetimingbufferfull', () => performance.clearResourceTimings());
} catch (e) { /* 古いブラウザ。測れないだけで、動きは変わりません */ }

/** 目印つきの住所で記録を探して、通信にかかったミリ秒を返します（無ければ undefined） */
function netMs(name) {
  if (!name) return undefined;
  try {
    const es = performance.getEntriesByName(name);
    const e = es[es.length - 1];
    return e && e.duration > 0 ? Math.round(e.duration) : undefined;
  } catch (err) { return undefined; }
}

const Api = {
  _key(src, k) { return APP.storageKey + ':' + src + ':' + k; },

  /**
   * 受け口の URL。
   *
   * ★端末に入れたぶんを、config.js より先に見ます。
   *   アプリをネットに置くと config.js は誰でも読めるので、
   *   URL を書いたままにすると「合言葉だけが守り」になります。
   *   端末に入れておけば、置いてあるファイルには何も残りません。
   */
  url(src) {
    let v = '';
    try { v = localStorage.getItem(this._key(src, 'url')) || ''; } catch (e) { v = ''; }
    if (v) return v.trim();
    const s = SOURCES.find((x) => x.id === src);
    return s && s.url ? s.url.trim() : '';
  },
  setUrl(src, v) {
    const t = String(v || '').trim();
    if (t) localStorage.setItem(this._key(src, 'url'), t);
    else localStorage.removeItem(this._key(src, 'url'));
  },
  name(src) {
    const s = SOURCES.find((x) => x.id === src);
    return s ? s.name : src;
  },
  enabled(src) { return !!this.url(src); },
  pin(src) { return localStorage.getItem(this._key(src, 'pin')) || ''; },
  setPin(src, p) { localStorage.setItem(this._key(src, 'pin'), String(p).trim()); },
  clearPin(src) { localStorage.removeItem(this._key(src, 'pin')); },
  ready(src) { return this.enabled(src) && !!this.pin(src); },

  /** つなげる受け口の id を並べて返します */
  live() { return SOURCES.filter((s) => this.ready(s.id)).map((s) => s.id); },
  any() { return this.live().length > 0; },

  async post(src, action, body, pin) {
    const url = this.url(src);
    if (!url) throw new Error(this.name(src) + ' の受け口が入っていません');
    const tagged = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'mb=' + action + '.' + (++NET_N);
    const res = await fetch(tagged, {
      method: 'POST',
      // text/plain にするのは、ブラウザに事前確認（preflight）を
      // させないためです。Apps Script は事前確認に応えないので、
      // application/json だと通りません。
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign(
        { pin: pin !== undefined ? pin : this.pin(src), action }, body || {})),
    });
    if (!res.ok) throw new Error(this.name(src) + ' につながりませんでした（' + res.status + '）');
    const data = await res.json();
    if (!data.ok) {
      throw new Error(this.name(src) + '： ' + 読めるエラーに(data.error || '断られました'));
    }
    data._net = tagged;               // ★あとで netMs() で通信の時間を探すための目印
    return data;
  },

  // full を立てると、決まりごと・上書き・テンプレも一緒に返ってきます
  // （別々に聞くと往復が3回増えるため。古い受け口は返さないので、
  //   アプリ側で今までどおり別に聞き直します）
  probe(src, pin, full) { return this.post(src, 'probe', full ? { full: true } : {}, pin); },
  scan(src) { return this.post(src, 'scan', {}); },
  // light ＝ 新しく届いたぶんだけ（見張りが10秒おきに呼ぶほう）
  // have ＝ この端末がいま持っている通数。渡すと、足りないぶんも一緒に返ります
  // since ＝ この端末が既読・旗をそろえた時点の印。渡すと、そこからの変化（marks）も返ります
  sync(src, light, have, since) {
    const b = {};
    if (light) b.light = true;
    if (have !== undefined) b.have = have;
    if (light && since) b.since = String(since);
    return this.post(src, 'sync', b);
  },
  peek(src) { return this.post(src, 'peek', {}); },
  recount(src) { return this.post(src, 'recount', {}); },
  pushKey(src) { return this.post(src, 'pushKey', {}); },
  // 通知が届かないときの記録（403＝鍵ちがい／410＝もう無い／201＝送れている）
  pushLog(src) { return this.post(src, 'pushLog', {}); },
  // 通知の鍵をそろえるため（★秘密の鍵。合言葉が合うときだけ、https の上だけ）
  vapidGet(src) { return this.post(src, 'vapidGet', {}); },
  vapidSet(src, d) { return this.post(src, 'vapidSet', { d }); },
  pushAdd(src, endpoint, ua) { return this.post(src, 'pushAdd', { endpoint, ua }); },
  pushHas(src, endpoint) { return this.post(src, 'pushHas', { endpoint }); },
  pushDel(src, endpoint) { return this.post(src, 'pushDel', { endpoint }); },
  pull(src, offset, limit) { return this.post(src, 'pull', { offset, limit }); },
  body(src, id) { return this.post(src, 'body', { id }); },
  // メールを日本語に（受け口の中で Google 翻訳を使います。鍵も契約も要りません）
  translate(src, id, to) { return this.post(src, 'translate', { id, to: to || 'ja' }); },
  // 送信済み。★索引には入れず、見るときだけ取りに行きます
  sent(src, addr, page, max) { return this.post(src, 'sent', { addr, page, max }); },
  read(src, ids, read) { return this.post(src, 'read', { ids, read }); },
  unsub(src, id) { return this.post(src, 'unsub', { id }); },
  star(src, ids, on) { return this.post(src, 'star', { ids, on }); },
  reply(src, id, text, all, from) { return this.post(src, 'reply', { id, text, all, from }); },
  send(src, m) { return this.post(src, 'send', m); },
  draft(src, id, text, all, from) { return this.post(src, 'draft', { id, text, all, from }); },
  aliases(src) { return this.post(src, 'aliases', {}); },
  rules(src) { return this.post(src, 'rules', {}); },
  setRules(src, rows) { return this.post(src, 'setRules', { rows }); },
  tpl(src) { return this.post(src, 'tpl', {}); },
  setTpl(src, rows) { return this.post(src, 'setTpl', { rows }); },
  over(src) { return this.post(src, 'over', {}); },
  setOver(src, rows) { return this.post(src, 'setOver', { rows }); },
  repair(src) { return this.post(src, 'repair', {}); },
  setQuery(src, query) { return this.post(src, 'setQuery', { query }); },
  rebuild(src) { return this.post(src, 'rebuild', {}); },
};
