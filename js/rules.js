/* ============================================================
 *  Mail Board — 仕分け
 *
 *  1通がどのカテゴリーに入るかを決めます。
 *
 *  【決めかた】
 *  決まりごとを ord（順番）の小さいほうから見ていき、
 *  **最初に当たったところで決まり**ます。あとは見ません。
 *
 *  ★「点数をつけて一番高いカテゴリー」にはしませんでした。
 *    そのやり方だと、なぜそこに入ったのかが説明できなくなります。
 *    順番なら「この決まりごとで入りました」と1行で言えるので、
 *    思ったところに入らなかったときに直せます。
 *
 *  【手で直したものが最優先】
 *  1通だけ別の箱に移したいことがあります。その覚え書き（over）は
 *  決まりごとより先に見ます。人が決めたことを機械が上書きしないためです。
 * ============================================================ */

const Rules = {
  list: [],          // [{id, cat, kind, pattern, ord, box}]
  over: {},          // { メールのid: カテゴリーid }
  _byBox: {},        // 箱ごとに組み立てた決まりごと（作り直しを減らすため）

  set(rows) {
    // 組み込みとまるかぶりのものを見つけるための引き。
    // 決まりごとの box はアドレスなので、呼び名に直してから見ます
    const built = {};
    const mark = (nm, r) => { built[nm + '|' + r[0] + '|' + String(r[2] || '').toLowerCase()] = 1; };
    Object.keys(BOX_RULES).forEach((nm) => { (BOX_RULES[nm] || []).forEach((r) => mark(nm, r)); });
    // わざと外したものも、戻ってこないように同じ引きに入れます
    Object.keys(BOX_RULES_GONE).forEach((nm) => { (BOX_RULES_GONE[nm] || []).forEach((r) => mark(nm, r)); });

    this.list = (rows || [])
      .filter((r) => r && r[0])
      .map((r) => ({
        id: String(r[0]), cat: String(r[1]), kind: String(r[2]),
        pattern: String(r[3] || '').toLowerCase(), ord: Number(r[4]) || 999,
        // box … その箱（アドレス）に届いたものにだけ効かせる。空なら全部
        box: String(r[5] || '').trim().toLowerCase(),
      }))
      // ★組み込みとまるかぶりのものは落とします。
      //   以前「まとめて入れる」ボタンで入れたものが、組み込みと
      //   二重に並んで見えるのを防ぎます。同じことをする決まりごとなので
      //   落としても行き先は変わりません
      .filter((r) => !built[boxKey(r.box) + '|' + r.cat + '|' + r.pattern])
      .sort((a, b) => a.ord - b.ord || a.id.localeCompare(b.id));
    this.bump();
  },

  /** 決まりごとをいじったら呼びます。組み立て直しの合図です */
  bump() { this._byBox = {}; },

  rows() {
    return this.list.map((r) => [r.id, r.cat, r.kind, r.pattern, r.ord, r.box || '']);
  },

  setOver(rows) {
    this.over = {};
    (rows || []).forEach((r) => { if (r && r[0]) this.over[String(r[0])] = String(r[1]); });
  },

  overRows() {
    return Object.keys(this.over).map((k) => [k, this.over[k]]);
  },

  isMachine(addr) {
    const local = String(addr || '').split('@')[0];
    return MACHINE_LOCAL.test(local);
  },

  /**
   * その箱で実際に使う決まりごとを、順番に並べて返します。
   *
   *  ・組み込み（BOX_RULES）と、自分で足したものを混ぜます
   *  ・**その箱に無いカテゴリーへ入れる決まりごとは外します**
   *    会社の箱に「カード・決済」は無いので、カードの決まりごとは
   *    会社では動きません。決まりごとを1本ずつ「会社だけ」と
   *    印を付けて回らなくてよくなります
   */
  forBox(box) {
    const key = String(box || '').toLowerCase();
    if (this._byBox[key]) return this._byBox[key];

    const allow = catsOf(key);
    const ok = (cat) => allow.indexOf(cat) >= 0;

    const mine = this.list.filter((r) => (!r.box || r.box === key) && ok(r.cat));
    const built = (BOX_RULES[boxKey(key)] || [])
      .filter((r) => ok(r[0]))
      .map((r, i) => ({ id: 'b' + i, cat: r[0], kind: r[1],
                        pattern: String(r[2] || '').toLowerCase(), ord: Number(r[3]) || 999,
                        box: key, built: true }));

    const list = mine.concat(built)
      .sort((a, b) => a.ord - b.ord || String(a.id).localeCompare(String(b.id)));
    this._byBox[key] = list;
    return list;
  },

  /**
   * 手で移した覚え書きの見出し。
   * ★受け口の印を頭に付けます。メールの id は Google アカウントごとの
   *   番号なので、別々の受け口で同じ番号が出ても取り違えないためです。
   */
  keyOf(row) {
    return String(row[F.SRC] || 'me') + ':' + String(row[F.ID]);
  },

  /**
   * row = [id, tid, date, addr, fromAddr, fromName, subject, snippet, ...]
   * 戻り値は { cat, why }。why は「なぜそこに入ったか」です。
   * 思ったところに入らなかったときに、直す手がかりになります。
   */
  of(row) {
    const id = this.keyOf(row);
    if (this.over[id]) return { cat: this.over[id], why: '手で移しました' };

    const from = String(row[F.FROM] || '').toLowerCase();
    const name = String(row[F.NAME] || '').toLowerCase();
    const subj = String(row[F.SUBJ] || '').toLowerCase();
    const snip = String(row[F.SNIP] || '').toLowerCase();
    // ★どの箱に届いたか。箱ごとにカテゴリーが違うので、まずこれを見ます
    const box = folderOf(row);
    const list = this.forBox(box);

    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const only = (r.box && !r.built) ? '（' + r.box + ' に届いたぶん）' : '';

      if (r.kind === 'from') {
        if (r.pattern && from.indexOf(r.pattern) >= 0) {
          return { cat: r.cat, why: '差出人に「' + r.pattern + '」' + only };
        }
      } else if (r.kind === 'subj') {
        if (r.pattern && subj.indexOf(r.pattern) >= 0) {
          return { cat: r.cat, why: '件名に「' + r.pattern + '」' + only };
        }
      } else if (r.kind === 'text') {
        // ★件名・本文・差出人の名前をまとめて見ます。どれに当たったかは
        //   分けて言います。思ったところに入らなかったとき、
        //   「本文のこの言葉で拾われたのか」と分かるようにするためです
        if (!r.pattern) continue;
        if (subj.indexOf(r.pattern) >= 0) {
          return { cat: r.cat, why: '件名に「' + r.pattern + '」' + only };
        }
        if (snip.indexOf(r.pattern) >= 0) {
          return { cat: r.cat, why: '本文に「' + r.pattern + '」' + only };
        }
        if (name.indexOf(r.pattern) >= 0) {
          return { cat: r.cat, why: '差出人の名前に「' + r.pattern + '」' + only };
        }
      } else if (r.kind === 'human') {
        if (from && !this.isMachine(from)) {
          return { cat: r.cat, why: '人のアドレスから届いています' };
        }
      }
    }
    return { cat: 'other', why: 'どの決まりごとにも当たりませんでした' };
  },
};
