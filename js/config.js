/* ============================================================
 *  Mail Board — 設定
 *
 *  変えたいところは、ほとんどこのファイルに集めています。
 * ============================================================ */

const APP = {
  title: 'Mail Board',
  sub: 'メールを箱に分ける',

  // 保存場所の名前。変えると端末にためた索引が読めなくなります
  storageKey: 'mail-board-v1',

  // 一覧に一度に出す通数。多すぎると iPhone で重くなります
  pageSize: 50,

  // 受け口のコードの版の印。版の印をつける.py が書き込みます。
  // これと受け口の印が違うと、アプリが「古いままです」と出します
  gasVersion: '0c04735c',

  // 索引を受け取るときの小分けの大きさ
  pullChunk: 2000,
};

/* ------------------------------------------------------------
 *  受け口（Apps Script のウェブアプリ URL）
 *
 *  ★受け口は Google アカウントごとに1つ置きます。
 *    Apps Script は「置いたアカウントのメール」しか読めないためです。
 *    会社のメールを個人の受け口から読むことはできません。
 *
 *  ★会社ぶんを「転送」でまとめる手もありますが、転送は
 *    **これから届くぶんだけ**です。過去のメールは永久に入りません。
 *    だから会社側にも受け口を置いて、直接読みます。
 *
 *  転送と直読みを両方やっても、同じメールが二度出ることはありません。
 *  Message-ID を見て、元の箱で読んだほうだけを残します。
 *
 *  url が空のものは、ただ無いものとして扱われます。
 *  全部空なら、アプリは「見本」で動きます。
 * ---------------------------------------------------------- */
const SOURCES = [
  { id: 'me',   name: '個人', url: '' },
  { id: 'work', name: '会社', url: '' },
];

/* ------------------------------------------------------------
 *  索引1行の並び
 *
 *  数字を直接書くと読めなくなるので、名前を付けます。
 *  SRC だけはアプリ側で足すもので、受け口からは来ません。
 * ---------------------------------------------------------- */
const F = {
  ID: 0, TID: 1, DATE: 2, ADDR: 3, FROM: 4, NAME: 5,
  SUBJ: 6, SNIP: 7, UNREAD: 8, TO: 9, MSGID: 10, RCPT: 11, SRC: 12,
};

/* ------------------------------------------------------------
 *  自分のアドレス
 *
 *  ここに書いたアドレスごとに、上の帯のフォルダが分かれます。
 *  name はフォルダに出る短い呼び名です。アドレスをそのまま出すと
 *  iPhone の幅では2つも並びません。
 *
 *  ★1つめを「受け口を置いた Google アカウント」にしてください。
 *    転送でまとめたメールは、届き先がこのアドレスになります。
 *    どれが「集めた先」なのかを知っていないと、転送ぶんが
 *    全部このフォルダに吸い込まれてしまいます。
 *
 *  設定の画面からも直せます（そちらが優先されます）。
 * ---------------------------------------------------------- */
const MY_ADDRS = [
  { addr: '', name: '' },
  { addr: '', name: '' },
  { addr: '', name: '' },
  // ★お店。受け口は置いていません（過去のぶんは要らないと決めました）。
  //   個人の Gmail へ転送して、届いた先ではなく**元の宛先**で
  //   この箱に振り分けます（folderOf が集めた先より優先します）
  { addr: '', name: '' },
];

/* ------------------------------------------------------------
 *  カテゴリー
 *
 *  ★並び順は「急ぐ順」です。確認コードは10分で切れるので先頭、
 *    広告は最後。上から見ていけば、急ぐものから片づきます。
 *
 *  ここに足したカテゴリーは、設定の「仕分けの決まりごと」から
 *  すぐ使えるようになります。
 * ---------------------------------------------------------- */
const CATS = [
  { id: 'auth',   name: '認証・ログイン', icon: 'key',   hint: '確認コード、パスワード、本人確認' },
  { id: 'card',   name: 'カード・決済',   icon: 'card',  hint: 'ご利用明細、請求、引き落とし' },
  { id: 'money',  name: '銀行・お金',     icon: 'yen',   hint: '入出金、証券、ローン' },
  { id: 'shop',   name: '買い物・配送',   icon: 'box',   hint: '注文、発送、お届け' },
  { id: 'travel', name: '旅行',           icon: 'plane', hint: '航空券、宿、旅程' },
  { id: 'booking', name: '予約',          icon: 'cal',   hint: '美容室、飲食店、チケットなど旅行以外の予約' },
  { id: 'people', name: 'やり取り',       icon: 'talk',  hint: '人が書いて、返事を待っているもの' },
  { id: 'point',  name: 'ポイント・案件', icon: 'star',  hint: 'ポイント、アンケート、モニター' },
  { id: 'news',   name: 'お知らせ・広告', icon: 'bell',  hint: 'メルマガ、キャンペーン' },
  /* ---- ここから下は会社の箱で使うもの ----------------------
     ★カテゴリーは全部の箱で共通ですが、**0通のものは出しません。**
       だから会社にしか来ないものを足しても、個人の箱には出ません。
       どの箱で効かせるかは、決まりごとの側で決めます。 */
  { id: 'order',   name: '発注',      icon: 'box',   hint: '仕入れ・発注・納品・請求書' },
  { id: 'upsider', name: 'UPSIDER',   icon: 'card',  hint: 'UPSIDER からのもの' },
  { id: 'uber',    name: 'Uber Eats', icon: 'bike',  hint: 'Uber Eats からのもの' },
  { id: 'demae',   name: '出前館',    icon: 'bike',  hint: '出前館からのもの' },
  { id: 'baitoru', name: 'バイトル',  icon: 'person', hint: '求人・応募のお知らせ' },
  { id: 'sns',     name: 'SNS',       icon: 'share', hint: 'Facebook・Instagram・LINE・Google ビジネス・口コミ' },
  { id: 'homepage', name: 'ホームページ', icon: 'globe', hint: 'Studio.Design からのもの' },
  { id: 'person',  name: '個人',      icon: 'talk',  hint: '個人で使うアドレスから届いたもの' },

  /* ★「その他」はいちばん最後に置きます。どの決まりごとにも
     当たらなかったものの行き先なので、途中にあると落ち着きません */
  { id: 'other',  name: 'その他',    icon: 'dots',  hint: 'どの決まりごとにも当たらなかったもの' },
];

const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]));

/* ------------------------------------------------------------
 *  箱ごとに使うカテゴリー
 *
 *  ★ここが「会社の箱は8つだけ」の正体です。
 *
 *  カテゴリーを箱ごとに分けないと、会社の箱に「カード・決済」や
 *  「お知らせ・広告」まで並んでしまいます。会社のメールで知りたいのは
 *  「発注か、予約か、どこの会社からか」で、個人のメールとは
 *  探しかたがまるで違います。
 *
 *  ★仕分けの決まりごとも、これで自動的に絞られます。
 *    「その箱で使わないカテゴリーに入れる決まりごとは、
 *      その箱では動かない」という決まりにしました。
 *    決まりごとを1本ずつ「会社だけ」と印を付けて回るより、
 *    取りこぼしがありません。
 *
 *  ★アドレスではなく**呼び名**（フォルダに出る短い名前）で結びつけます。
 *    人に渡すプレビューに本物のアドレスを埋め込まないためです。
 *    設定でこの呼び名を変えると、棚は元に戻ります。
 *
 *  ここに書いていない呼び名は、下の BOX_CATS_DEFAULT を使います。
 *  （個人・iCloud はこちらです。今までと何も変わりません）
 * ---------------------------------------------------------- */
const BOX_CATS_DEFAULT = [
  'auth', 'card', 'money', 'shop', 'travel', 'booking',
  'people', 'point', 'news', 'other',
];

/* 飲食店の箱の棚。会社でもお店でも同じなので、1か所に書いて分け合います。
   ★写して2つ持つと、片方だけ直して食い違います */
const CATS_MISE = [
  'booking', 'order', 'upsider', 'uber', 'demae', 'baitoru',
  'sns', 'homepage', 'person', 'other',
];

const BOX_CATS = {
  '会社': CATS_MISE,
  'バグる': CATS_MISE,
};

/* ------------------------------------------------------------
 *  差出人・件名で箱を決める上書き
 *
 *  ★ふだんは「誰あてに届いたか」で箱を決めます。そのほうが
 *    取り違えません。ただ、お店の予約システムのように
 *    **こちらの個人アドレスあてに送ってくる**ものがあります。
 *    誰あてかでは分けられないので、そこだけ上書きします。
 *
 *  呼び名 → その箱に入れたい目印（差出人のアドレス・差出人の名前・
 *  件名のどれかに含まれていれば当たります）
 *
 *  ★目印は「その店のものだけ」に当たるものにしてください。
 *    会社で共通に使っている送信元を目印にすると、もう一方のお店の
 *    通知まで同じ箱に入ってしまいます。**店の名前**のほうが安全です。
 *    「バグる」だけ、のような短い言葉も避けてください。ふつうの文に
 *    出てくる言葉だと、関係のないメールを巻き込みます。
 * ---------------------------------------------------------- */
const BOX_HINTS = {
  'バグる': ['炭焼ハンバーグ バグる'],
};

/**
 * 箱（アドレス）から、決まりごとを引くときの見出しを作ります。
 * folderName は app.js にあります（設定で付け替えた呼び名も拾えるように）。
 */
function boxKey(box) {
  if (!box) return '';
  return (typeof folderName === 'function') ? folderName(box) : String(box);
}

/** その箱で使うカテゴリーの id を、出す順に返します */
function catsOf(box) {
  return BOX_CATS[boxKey(box)] || BOX_CATS_DEFAULT;
}

/** その箱にこのカテゴリーはあるか */
function catInBox(cat, box) {
  return catsOf(box).indexOf(cat) >= 0;
}

/* ------------------------------------------------------------
 *  組み込みの決まりごと（会社の箱）
 *
 *  [カテゴリー, 見かた, ことば, 順番]
 *
 *  見かた
 *    from … 差出人のアドレスに含まれる
 *    text … 件名・本文のはじめのほう・差出人の名前のどれかに含まれる
 *    human… 人が書いて送ってきた（機械の自動送信ではない）
 *
 *  ★なぜ表計算に入れず、ここに直接書いたか
 *    表計算に入れると、受け口を貼り替えて、ボタンを押して、
 *    という手順が要ります。ここに書けば**開いた時点で効いています。**
 *    会社ごとに違うもの（仕入先など）だけを表計算の側に足す、
 *    という分けかたにしました。
 *
 *  ★順番は20番から。自分で「差出人」の画面から決めたものは
 *    15番なので、**そちらが必ず勝ちます。**
 * ---------------------------------------------------------- */
/* ------------------------------------------------------------
 *  わざと外した決まりごと
 *
 *  ★以前つかっていて、今は「入れない」と決めたものです。
 *    前に設定の「まとめて入れる」ボタンで表計算へ入れたぶんが
 *    残っていると、外したはずの動きがそのまま戻ってきます。
 *    読み込むときに、ここに書いたものは落とします。
 *
 *  [カテゴリー, 見かた, ことば]
 * ---------------------------------------------------------- */
// 「人が書いたものは全部 個人へ」。同僚や取引先の担当者まで
// 個人に入ってしまい、個人の棚が会社のメールで埋まったため外しました
const GONE_MISE = [['person', 'human', '']];

const BOX_RULES_GONE = {
  '会社': GONE_MISE,
  'バグる': GONE_MISE,
};

/* 飲食店の箱の決まりごと。こちらも会社とお店で分け合います */
const RULES_MISE = [
    /* --- 20番：名前がはっきりしている送り元 -------------------
       ★いちばん先に見ます。ここに当たったものは、件名に何と
         書いてあっても行き先が決まっているからです。
         （Uber Eats の「新しいご注文」が発注へ行かないように） */
    ['upsider', 'from', 'upsider', 20],
    ['upsider', 'from', 'up-sider', 20],
    ['uber',    'from', 'uber.com', 20],
    ['uber',    'from', 'ubereats', 20],
    ['uber',    'from', 'uber-mail', 20],
    ['demae',   'from', 'demae-can', 20],
    ['demae',   'from', 'demaecan', 20],
    ['baitoru', 'from', 'baitoru', 20],
    ['baitoru', 'from', 'dip-net', 20],

    /* --- 21番：SNS の送り元 ----------------------------------
       ★`x.com` のように短いものは `@` を付けています。付けないと
         `fedex.com` の中の "x.com" にも当たってしまいます */
    ['sns', 'from', 'facebook.com', 21],
    ['sns', 'from', 'facebookmail.com', 21],
    ['sns', 'from', 'instagram.com', 21],
    ['sns', 'from', 'threads.net', 21],
    ['sns', 'from', 'twitter.com', 21],
    ['sns', 'from', '@x.com', 21],
    ['sns', 'from', '@line.me', 21],
    ['sns', 'from', 'linecorp.com', 21],
    ['sns', 'from', '@lin.ee', 21],
    ['sns', 'from', 'tiktok.com', 21],
    ['sns', 'from', 'youtube.com', 21],
    /* Google ビジネス プロフィールと、Google マップの口コミ */
    ['sns', 'from', 'businessprofile', 21],
    ['sns', 'from', 'business-profile', 21],
    ['sns', 'from', 'business.google.com', 21],
    ['sns', 'from', 'maps-noreply', 21],
    ['sns', 'from', 'local-guides', 21],

    /* --- 22番：同じ4つを、件名・本文・差出人の名前でも拾います --
       ★転送されてきたものや、代理店が間に入ったものは、
         アドレスに社名が出てきません。文のほうに出ます */
    ['upsider', 'text', 'upsider', 22],
    ['upsider', 'text', 'アップサイダー', 22],
    ['uber',    'text', 'uber eats', 22],
    ['uber',    'text', 'ubereats', 22],
    ['uber',    'text', 'ウーバーイーツ', 22],
    ['demae',   'text', '出前館', 22],
    ['baitoru', 'text', 'バイトル', 22],

    /* --- 30番：予約（送り元） ---------------------------------
       飲食店の予約は、だいたいこのどれかを通ってきます */
    ['booking', 'from', 'tabelog.com', 30],
    ['booking', 'from', 'gnavi.co.jp', 30],
    ['booking', 'from', 'hotpepper.jp', 30],
    ['booking', 'from', 'restaurant-board', 30],
    ['booking', 'from', 'rb.recruit', 30],
    ['booking', 'from', 'toreta', 30],
    ['booking', 'from', 'ebica', 30],
    ['booking', 'from', 'tablecheck', 30],
    ['booking', 'from', 'tablesolution', 30],
    ['booking', 'from', 'omakase', 30],
    ['booking', 'from', 'autoreserve', 30],
    ['booking', 'from', 'opentable', 30],
    ['booking', 'from', 'ikyu.com', 30],
    ['booking', 'from', 'ozmall.co.jp', 30],
    ['booking', 'from', 'retty', 30],
    ['booking', 'from', 'favy', 30],
    ['booking', 'from', 'airrsv.net', 30],
    ['booking', 'from', 'reserva.be', 30],
    ['booking', 'from', 'ebisol', 30],

    /* --- 26番：ホームページ ------------------------------------
       ★**Studio.Design だけ**です（ko-dai の指定、2026年8月21日）。
         はじめはドメイン屋やサーバー屋も入れていましたが、
         「ここには Studio 以外を入れない」と決まりました。
         棚の名前が「ホームページ」でも、中身は1社ぶんです。

       ★アドレスは noreply@studio.site。ここでは @studio.site で
         見ています。Studio が別の名前（support@ など）から
         送ってきても同じ棚に入れたいためで、よその会社は入りません。 */
    ['homepage', 'from', '@studio.site', 26],

    /* --- 32番：SNS（件名・本文） ------------------------------
       ★予約サイトの送り元（30番）より**後ろ**です。食べログの
         「口コミが投稿されました」は予約の棚に置きたいので、
         先に置くとそれを SNS へ持っていってしまいます */
    ['sns', 'text', 'facebook', 32],
    ['sns', 'text', 'フェイスブック', 32],
    ['sns', 'text', 'instagram', 32],
    ['sns', 'text', 'インスタグラム', 32],
    ['sns', 'text', 'ビジネス プロフィール', 32],
    ['sns', 'text', 'ビジネスプロフィール', 32],
    ['sns', 'text', 'google ビジネス', 32],
    ['sns', 'text', 'googleビジネス', 32],
    ['sns', 'text', '口コミが投稿', 32],
    ['sns', 'text', 'クチコミが投稿', 32],
    ['sns', 'text', '口コミが届', 32],
    ['sns', 'text', 'フォロワー', 32],
    ['sns', 'text', 'いいね！', 32],

    /* --- 34番：発注（送り元） ---------------------------------
       ★仕入先そのものは会社ごとに違うので入れられません。
         どこの店でも使う、買い物と配送の送り元だけ置いています */
    ['order', 'from', 'amazon.co.jp', 34],
    ['order', 'from', 'askul', 34],
    ['order', 'from', 'monotaro', 34],
    ['order', 'from', 'kuronekoyamato', 34],
    ['order', 'from', 'sagawa-exp', 34],
    ['order', 'from', 'post.japanpost', 34],
    ['order', 'from', 'tanomail', 34],
    ['order', 'from', 'kaunet', 34],

    /* --- 36番：個人で使うアドレスから届いたもの → 個人 --------
       ★`@` を頭に付けています。付けないと `@gmail.com` のつもりが
         `mygmail.com.example.jp` のような差出人にも当たります。
       ★件名の決まりごと（40番・42番）より**先**です。ko-dai の
         「個人であろうアドレスから来たものは個人へ」に合わせています。
         そのぶん、仕入先の担当者が Gmail から「納品書」を送ってきた
         ものも個人に入ります。いつも発注に入れたい相手は、一覧の
         「差出人」から決めてください（15番なのでこちらより先に効きます） */
    ['person', 'from', '@gmail.com', 36],
    ['person', 'from', '@googlemail.com', 36],
    ['person', 'from', '@icloud.com', 36],
    ['person', 'from', '@me.com', 36],
    ['person', 'from', '@mac.com', 36],
    ['person', 'from', '@yahoo.co.jp', 36],
    ['person', 'from', '@yahoo.ne.jp', 36],
    ['person', 'from', '@ybb.ne.jp', 36],
    ['person', 'from', '@ymail.ne.jp', 36],
    ['person', 'from', '@outlook.com', 36],
    ['person', 'from', '@outlook.jp', 36],
    ['person', 'from', '@hotmail.com', 36],
    ['person', 'from', '@hotmail.co.jp', 36],
    ['person', 'from', '@live.jp', 36],
    ['person', 'from', '@msn.com', 36],
    ['person', 'from', '@yahoo.com', 36],
    /* 携帯・スマホのアドレス */
    ['person', 'from', '@docomo.ne.jp', 36],
    ['person', 'from', '@ezweb.ne.jp', 36],
    ['person', 'from', '@au.com', 36],
    ['person', 'from', '@uqmobile.jp', 36],
    ['person', 'from', '@softbank.ne.jp', 36],
    ['person', 'from', '@i.softbank.jp', 36],
    ['person', 'from', '@vodafone.ne.jp', 36],
    ['person', 'from', '@disney.ne.jp', 36],
    ['person', 'from', '@ymobile.ne.jp', 36],
    ['person', 'from', '@y-mobile.ne.jp', 36],
    ['person', 'from', '@rakumail.jp', 36],
    ['person', 'from', '@ymobile1.ne.jp', 36],
    ['person', 'from', '@ido.ne.jp', 36],
    ['person', 'from', '@willcom.com', 36],
    ['person', 'from', '@emnet.ne.jp', 36],
    ['person', 'from', '@mineo.jp', 36],
    ['person', 'from', '@iijmio-mail.jp', 36],
    /* 昔からあるプロバイダのアドレス */
    ['person', 'from', '@nifty.com', 36],
    ['person', 'from', '@ocn.ne.jp', 36],
    ['person', 'from', '@biglobe.ne.jp', 36],
    ['person', 'from', '@so-net.ne.jp', 36],
    ['person', 'from', '@dion.ne.jp', 36],
    ['person', 'from', '@plala.or.jp', 36],
    ['person', 'from', '@jcom.home.ne.jp', 36],
    ['person', 'from', '@aol.jp', 36],
    ['person', 'from', '@aol.com', 36],
    ['person', 'from', '@excite.co.jp', 36],
    ['person', 'from', '@proton.me', 36],
    ['person', 'from', '@protonmail.com', 36],
    ['person', 'from', '@zaq.ne.jp', 36],
    ['person', 'from', '@eonet.ne.jp', 36],
    ['person', 'from', '@nuro.jp', 36],
    ['person', 'from', '@infoseek.jp', 36],
    ['person', 'from', '@excite.jp', 36],

    /* --- 40番：予約（件名・本文） -----------------------------
       ★発注（42番）より先に見ます。「ご予約の注文を承りました」
         のように両方の言葉が入ることがあり、そのときは
         予約として扱うほうが当たります */
    ['booking', 'text', 'ご予約', 40],
    ['booking', 'text', '予約が入り', 40],
    ['booking', 'text', '予約確認', 40],
    ['booking', 'text', '予約完了', 40],
    ['booking', 'text', '予約内容', 40],
    ['booking', 'text', '予約変更', 40],
    ['booking', 'text', '予約の変更', 40],
    ['booking', 'text', '予約キャンセル', 40],
    ['booking', 'text', 'ネット予約', 40],
    ['booking', 'text', '来店予定', 40],
    ['booking', 'text', 'ご来店', 40],
    ['booking', 'text', 'お席', 40],
    ['booking', 'text', 'reservation', 40],
    ['booking', 'text', 'booking confirm', 40],

    /* --- 42番：発注（件名・本文） ----------------------------- */
    ['order', 'text', '発注', 42],
    ['order', 'text', 'ご注文', 42],
    ['order', 'text', '注文書', 42],
    ['order', 'text', '注文内容', 42],
    ['order', 'text', '納品', 42],
    ['order', 'text', '納期', 42],
    ['order', 'text', '仕入', 42],
    ['order', 'text', '請求書', 42],
    ['order', 'text', 'ご請求', 42],
    ['order', 'text', '見積', 42],
    ['order', 'text', '単価', 42],
    ['order', 'text', '出荷', 42],
    ['order', 'text', '入荷', 42],
    ['order', 'text', '欠品', 42],
    ['order', 'text', '棚卸', 42],
    ['order', 'text', '伝票', 42],
    ['order', 'text', '発送', 42],
    ['order', 'text', 'お届け予定', 42],
    ['order', 'text', 'invoice', 42],

    /* --- 44番：バイトル以外の求人も、応募の知らせは同じ棚へ ---- */
    ['baitoru', 'text', 'ご応募', 44],
    ['baitoru', 'text', '応募がありました', 44],
    ['baitoru', 'text', '求人', 44],
    ['baitoru', 'text', '面接', 44],

    /* ★「人が書いて送ってきたもの → 個人」という受け皿は
         **置いていません**（ko-dai の指定、2026年8月21日）。
         置くと、同僚や取引先の担当者など、会社のアドレスから
         届いた人のメールまで全部「個人」に入ってしまい、
         個人の棚が会社のメールで埋まりました。
         個人に入るのは、上の36番に並べたアドレスから届いたものだけです。
         当てはまらないものは「その他」へ行きます。 */
];

/* ------------------------------------------------------------
 *  どの呼び名の箱で、どの決まりごとを使うか
 *
 *  ★お店の Gmail を足すときは、ここに1行足すだけです。
 *    （BOX_CATS のほうにも同じ呼び名で1行）
 * ---------------------------------------------------------- */
const BOX_RULES = {
  '会社': RULES_MISE,
  'バグる': RULES_MISE,
};


/* ------------------------------------------------------------
 *  差出人が「機械」かどうかの見分け
 *
 *  ★「やり取り」カテゴリーの土台です。返事を待っている相手と、
 *    返しても誰も読まない自動配信を分けるために使います。
 *    アドレスの @ より前だけを見ます。
 * ---------------------------------------------------------- */
const MACHINE_LOCAL = new RegExp(
  '^(' + [
    'no-?reply', 'noreply', 'donotreply', 'do[_-]not[_-]reply', 'auto[a-z]*',
    'mailer', 'postmaster', 'bounce', 'notif[a-z]*', 'news[a-z]*', 'info',
    'support', 'service', 'admin', 'system', 'alert[a-z]*', 'update[a-z]*',
    'magazine', 'melmaga', 'mailmag[a-z]*', 'order[a-z-]*', 'receipt',
    'billing', 'invoice', 'account[a-z]*', 'confirm', 'delivery', 'shipment',
    'reserve', 'ticket[a-z]*', 'point[a-z-]*', 'campaign', 'entry',
    'thankyou', 'thanks', 'webmaster', 'message[a-z-]*', 'send[a-z-]*',
  ].join('|') + ')([._+-]|$)', 'i'
);

/* ------------------------------------------------------------
 *  見本のメール
 *
 *  受け口（syncUrl）を入れる前でも画面を確かめられるように、
 *  それらしい形のものを置いています。**本物のメールではありません。**
 * ---------------------------------------------------------- */
const DEMO = (function () {
  const now = Date.now();
  const h = 3600 * 1000;
  const mk = (i, addr, from, name, subj, snip, un, ago) => [
    'd' + i, 't' + i, now - ago * h, addr, from, name, subj, snip, un,
    addr, 'demo' + i + '@example', addr, 'me',
  ];
  let i = 0;
  const A = 'あなた@gmail.com';
  const B = 'あなた@icloud.com';
  const C = 'あなた@会社.co.jp';
  return [
    mk(++i, A, 'login-master@mail.yahoo.co.jp', 'Yahoo! JAPAN', 'Yahoo! JAPAN - 確認コード', '488330 画面の確認コード入力欄に上記の数字を入力してください。', 1, 1),
    mk(++i, A, 'mail@cj.jcb.co.jp', 'JCBカード', '【JCB】カードご利用のお知らせ', 'ご利用日 08/20 ご利用金額 3,240円 ご利用先 コンビニエンスストア', 1, 4),
    mk(++i, A, 'service@ac.rakuten-bank.co.jp', '楽天銀行', '【楽天銀行】入金がありました', '下記日時に、お客さまの口座へ入金がありました。', 0, 9),
    mk(++i, B, 'furubayashi@example.co.jp', '古林', '打ち合わせの日程について', 'お世話になっております。来週の候補日をお送りします。', 1, 11),
    mk(++i, A, 'shipment-tracking@amazon.co.jp', 'Amazon.co.jp', 'ご注文の商品を発送しました', '本日発送いたしました。お届け予定日は明日です。', 0, 20),
    mk(++i, C, 'reserve@beauty.hotpepper.jp', 'ホットペッパー', 'ご予約が確定しました', '8月26日 14:00 からのご予約を承りました。', 0, 26),
    mk(++i, A, 'no-reply@sender.skyscanner.com', 'Skyscanner', '名古屋発ソウル行き 航空券のお知らせ', '過去4日間の最安値です。料金は変更される場合があります。', 0, 28),
    mk(++i, A, 'info@mail.rakuten-card.co.jp', '楽天カード', '【8月31日まで】ポイント山分けキャンペーン中！', 'エントリーだけで最大500万ポイント山分け。', 0, 30),
    mk(++i, A, 'info@pocket-research.jp', 'ポケットリサーチ', '【謝礼2,000pt】口座開設完了でpt獲得', '本日は、少額から始められる案件のご紹介です。', 1, 33),
    mk(++i, B, 'library.bar@example.com', 'The Library', 'RE: Dress Code Inquiry', 'Please find our responses to your questions below.', 0, 40),
    mk(++i, C, 'no-reply@example-pos.jp', 'レジシステム', '日次売上レポート', '本日の売上集計をお送りします。', 0, 45),
    mk(++i, C, 'businessprofile-noreply@google.com', 'Google ビジネス プロフィール', '新しい口コミが投稿されました', 'お店に★5の口コミが届いています。', 1, 8),
    mk(++i, C, 'noreply@studio.site', 'Studio.Design', 'サイトの公開が完了しました', '変更内容が公開サイトに反映されました。', 1, 15),
    mk(++i, C, 'kenji.suzuki@gmail.com', '鈴木健二', '来週の打ち合わせについて', 'お世話になっております。候補日をお送りします。', 1, 22),
    mk(++i, A, 'no-reply@accounts.google.com', 'Google', 'セキュリティ通知', '新しいデバイスからのログインがありました。', 0, 50),
    mk(++i, A, 'confirm@ml.example-card.com', '出光カード', 'ご利用明細更新のお知らせ', 'ご請求に関する重要なお知らせです。', 0, 55),
  ];
})();

/* ------------------------------------------------------------
 *  見本のときだけ使う仕分けの決まりごと
 *
 *  ★本物の決まりごとは gas/コード.gs の seedRules_ にあります。
 *    そちらが本体で、ここは受け口をつなぐ前に画面の動きを
 *    見せるためだけの短い写しです。中身をそろえる必要はありません。
 * ---------------------------------------------------------- */
const DEMO_RULES = [
  ['d1', 'auth',   'subj', '確認コード', 10],
  ['d2', 'auth',   'from', 'accounts.google.com', 11],
  ['d3', 'auth',   'subj', 'セキュリティ', 12],
  ['d4', 'card',   'from', 'jcb.co.jp', 30],
  ['d5', 'card',   'from', 'example-card.com', 30],
  ['d6', 'card',   'from', 'rakuten-card.co.jp', 30],
  ['d7', 'money',  'from', 'rakuten-bank.co.jp', 40],
  ['d8', 'shop',   'from', 'amazon.co.jp', 50],
  ['d9', 'booking', 'from', 'beauty.hotpepper.jp', 60],
  ['d10', 'point', 'from', 'pocket-research.jp', 70],
  ['d11', 'news',  'subj', 'キャンペーン', 81],
  ['d13', 'travel', 'from', 'skyscanner.com', 60],
  ['d12', 'people', 'human', '', 90],
];
