/**
 * 網站上看得到的所有文字都集中在這個檔案。要改文字，只要改這裡，不用到處找。
 *
 * 怎麼改：
 *   - 只改引號 '…' 或 `…` 裡面的字。不要動左邊的名字（例如 dateLabel）和標點（逗號、冒號、括號）。
 *   - 有 ${…} 的地方是「會自動換成數字或名字」的位置，請原樣保留，只改前後的字。
 *   - \n 代表換行，也請保留。
 *
 * 不在這個檔案裡的：
 *   - 「有吃」「沒吃」是存進試算表的資料值，後端也靠它判斷，不能改（改了會讓舊資料對不上）。
 *     它在 src/lib/types.ts 的 MED_YES / MED_NO。
 *   - 網頁標題的預設文字在 index.html，加到主畫面時的名稱在 vite.config.ts（name / short_name）。
 *   - 後端（Apps Script）送出的錯誤訊息、Discord 提醒文字，在 apps-script/Code.gs。
 */
export const T = {
  app: {
    name: '血壓記錄',
    /** 瀏覽器分頁標題：「頁面名稱｜網站名稱」 */
    pageTitle: (page: string) => `${page}｜血壓記錄`,
  },

  // 連線、登入的錯誤訊息
  errors: {
    network: '連不上伺服器，請檢查網路後再試',
    authExpired: '登入已過期，請重新登入',
    loadFailed: '讀取失敗，請稍後再試',
  },

  common: {
    morning: '早上',
    evening: '晚上',
    loading: '讀取中…',
    close: '關閉',
    ok: '好',
    cancel: '取消',
    none: '--',
    pulse: '脈搏',
    saving: '儲存中…',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    weekday: (w: string) => `週${w}`,
    range: (from: string, to: string) => `${from} 到 ${to}`,
    staleList: '目前顯示的是上次的紀錄（更新失敗）',
    fallbackError: '發生錯誤，請再試一次',
    cannotSave: '無法儲存',
    systolic: '收縮壓（高壓）',
    diastolic: '舒張壓（低壓）',
    medicationQuestion: '有吃藥嗎？',
  },

  nav: {
    aria: '主要頁面',
    record: '記錄血壓',
    history: '歷史紀錄',
    doctor: '給醫師看',
  },

  header: {
    large: '放大',
    small: '縮小',
    logout: '登出',
    logoutConfirm: '確定要登出嗎？\n登出後要重新輸入帳號和密碼。',
    offline: '目前沒有網路。血壓會先存在手機，連上網路後自動補送。',
    fontHint: '點右上角「放大」，字會變大',
    fontHintOk: '知道了',
  },

  version: {
    title: '版本資訊',
    version: '版本',
    buildTime: '建置時間',
    account: '登入帳號',
    reload: '清除快取並重新載入',
    reloading: '重新載入中…',
    admin: '管理員頁面',
  },

  // ───────── 記錄頁 ─────────
  record: {
    pageTitle: '記錄血壓',
    heading: '記錄今天的血壓',
    today: (m: number, d: number, w: string) => `今天是 ${m} 月 ${d} 日（週${w}）`,
    statusAria: '今天的記錄狀況',
    statusDone: (slot: string) => `✓ ${slot}已記錄`,
    statusTodo: (slot: string) => `${slot}還沒記錄`,
    pendingText: (n: number) => `有 ${n} 筆血壓還沒上傳，目前先存在這支手機。連上網路後會自動補送，請不要重複輸入。`,
    pendingRetry: '現在重試上傳',
    panelCaption: '血壓（mmHg）',
    pulseUnit: '次／分鐘',
    dateLabel: '測量日期',
    medLabel: '今天有吃藥嗎？',
    notesLabel: '今天的狀況',
    optional: '（選填）',
    notesPlaceholder: '例如：心情好、有點累、壓力大',
    submit: '儲存紀錄',

    // 儲存結果視窗
    savedTitle: '已儲存',
    savedDetail: (sys: string, dia: string, pulse: string) => `收縮壓 ${sys} / 舒張壓 ${dia}，脈搏 ${pulse}`,
    savedWithAdvice: (adviceTitle: string) => `已儲存，${adviceTitle}`,
    duplicateTitle: '已經儲存過了',
    duplicateDetail: '這筆資料剛剛已經存好，不會重複記錄。',
    failedTitle: '沒有儲存成功',
    failedFallback: '請再試一次',
    queuedTitle: '已暫存在手機',
    queuedWithAdvice: (adviceTitle: string) => `已暫存在手機，${adviceTitle}`,
    queuedDetail: '現在連不上網路，資料先存在這支手機裡，有網路時會自動補送，請不要重複輸入。',
    droppedTitle: '有資料沒辦法儲存',
    droppedLine: (date: string, sys: string, dia: string, error: string) => `${date}　${sys}/${dia}：${error}`,
    droppedFooter: '請重新輸入一次。',
    sentTitle: (n: number) => `已補送 ${n} 筆`,
    sentDetail: '先前暫存的血壓已經上傳完成。',
    stillOfflineTitle: '還是連不上網路',
    stillOfflineDetail: '資料還在這支手機裡沒有遺失，有網路時會再自動補送。',
  },

  // 儲存後依數字給的提醒（規則在 src/lib/advice.ts）
  advice: {
    note: '這只是提醒，不是診斷，請依醫師的指示服藥。',
    veryHigh: {
      title: '數值很高',
      text:
        '請先坐下來休息 5 分鐘，再量一次。\n' +
        '如果還是這麼高，或有頭痛、胸悶、頭暈、看不清楚、說話不順，請馬上聯絡家人，必要時撥 119。',
    },
    high: {
      title: '這次偏高',
      text: '請坐著休息 5 分鐘後再量一次，量的時候不要說話，手臂放在桌上、和心臟差不多高。',
      alsoLow: (which: string) => `另外，${which}有點低，回診時也跟醫師說一聲。`,
      systolic: '收縮壓',
      diastolic: '舒張壓',
      footer: '如果常常這樣，回診時記得給醫師看「給醫師看」的紀錄。',
    },
    low: {
      title: '這次偏低',
      text: '如果覺得頭暈、冒冷汗，請先坐下或躺下休息，起身要慢慢來，並告訴家人。',
    },
  },

  // ───────── 歷史頁 ─────────
  history: {
    pageTitle: '歷史紀錄',
    emptyTitle: '還沒有任何紀錄',
    emptyText: '量完血壓後，到「記錄血壓」存下第一筆。',
    emptyButton: '去記錄血壓',
    panelCaption: (from: string, to: string, days: number) => `${from} 到 ${to} 的平均（有記錄的 ${days} 天）`,
    panelUnit: '平均血壓（收縮 / 舒張，mmHg）',
    avgPulse: '平均脈搏',
    chartAria: '血壓走勢圖',
    chartNotes: [
      '藍線是收縮壓（高壓），綠線是舒張壓（低壓）。',
      '虛線是參考線：135（收縮壓）、85（舒張壓）。',
      '點變大、外面有橘色圈圈，表示高於參考值。',
      '點一下圖上的某一天，可以看到脈搏和吃藥狀況。',
    ],
    tableAria: '每日數值',
    colDate: '日期',
    colSys: '收縮',
    colDia: '舒張',
    colPulse: '脈搏',
    colMed: '吃藥',
    edit: '修改',
    editAria: (label: string) => `修改或刪除 ${label} 的紀錄`,
    legend: '黃底數字高於家庭血壓參考值 135 / 85 mmHg，僅供參考，請依醫師指示判斷。',
    editHint: '填錯了？按日期下面的「修改」，可以改數字或刪除那一筆。',
    older: '較早',
    newer: '較新',
    pageSelectAria: '選擇頁數',
    latest: '最新　',
  },

  // 「和上週比較」卡片
  trend: {
    title: '和上週比較',
    notEnough: '再多記錄幾天，就能和上週比較了',
    notEnoughHint: '最近 7 天和前 7 天，各要至少有 3 天的紀錄。',
    better: '比上週低，好轉中 ↓',
    steady: '和上週差不多，維持得很好 ✓',
    worse: '比上週高，要多留意 ↑',
    steadyHigh: '和上週差不多，但仍然偏高',
    mixed: '和上週相比有升有降',
    thisWeek: (from: string, to: string, bp: string) => `這週（${from}～${to}）平均 ${bp}`,
    lastWeek: (from: string, to: string, bp: string) => `上週（${from}～${to}）平均 ${bp}`,
    delta: (sys: string, dia: string) => `收縮壓${sys}、舒張壓${dia}（單位 mmHg）`,
    same: '一樣',
    higher: (n: number) => `高 ${n}`,
    lower: (n: number) => `低 ${n}`,
    stillHigh: '不過這週平均還是偏高（135/85 以上），請繼續留意，按時吃藥。',
    worseHint: '如果連續幾週都偏高，回診時記得給醫師看「給醫師看」的紀錄。',
  },

  // 歷史頁「修改」視窗
  day: {
    title: (label: string, weekday: string) => `${label}（${weekday}）的紀錄`,
    manyHint: (n: number) => `這天有 ${n} 筆，可以分別修改或刪除。`,
    oneHint: '可以修改或刪除這筆紀錄。',
    noTime: '（沒有記錄時間）',
    edit: '修改',
    delete: '刪除',
    deleteConfirm: (what: string) => `確定要刪除這筆紀錄嗎？\n\n${what}\n\n刪除後無法復原。`,
    deleteWhat: (date: string, sys: number, dia: number, pulse: string) => `${date}　${sys}/${dia}　脈搏 ${pulse}`,
    failedFallback: '沒有成功，請再試一次',
    editDate: '日期',
    editNotes: '今天的狀況',
    save: '儲存修改',
    cancel: '取消',
  },

  // 刪除後的「復原」
  undo: {
    deleted: '已刪除',
    restore: (seconds: number) => `復原（${seconds}）`,
    restoring: '復原中…',
    retry: '再試一次',
    failed: '復原失敗，請再試一次',
    dismissAria: '關閉提示',
    summary: (date: string, sys: number, dia: number, pulse: number) => `${date}　${sys}/${dia}　脈搏 ${pulse}`,
  },

  // ───────── 給醫師看 ─────────
  doctor: {
    pageTitle: '給醫師看',
    heading: '給醫師看',
    intro: '選一段時間，把這段期間的血壓整理給醫師看。',
    rangeAria: '選擇時間範圍',
    ranges: { '7': '近 7 天', '30': '近 30 天', '90': '近 90 天', custom: '自訂' },
    from: '從',
    to: '到',
    emptyTitle: '這段時間沒有紀錄',
    emptyText: '換一個時間範圍試試看。',
    reportTitle: '血壓紀錄',
    stats: {
      avg: '平均血壓',
      avgSub: (pulse: string) => `脈搏 ${pulse}`,
      days: '記錄天數',
      daysValue: (n: number) => `${n} 天`,
      daysSub: (n: number) => `共 ${n} 次量測`,
      morning: '早上平均',
      evening: '晚上平均',
      times: (n: number) => `${n} 次`,
      high: '偏高次數',
      highValue: (n: number) => `${n} 次`,
      highSub: (pct: number) => `佔 ${pct}%（135/85 以上）`,
      took: '有吃藥',
      tookSub: (n: number) => `記錄的 ${n} 天中`,
      peak: '最高一次',
    },
    colDate: '日期',
    colSlot: '時段',
    colBp: '血壓',
    colPulse: '脈搏',
    colMed: '吃藥',
    notes: (text: string) => `狀況：${text}`,
    howToRead: [
      '每一列是一次量測，最新的在最上面。',
      '血壓是「收縮壓／舒張壓」（mmHg），脈搏是每分鐘幾下。',
      '黃底表示高於家庭血壓參考值 135／85，僅供參考，請依醫師指示判斷。',
      '早上＝中午 12 點前記錄；晚上＝中午 12 點後記錄。',
      '同一天量了好幾次，會排在同一天底下，日期只寫一次。',
    ],
    organizedOn: (date: string) => `整理日期：${date}`,
    exportAria: '列印或存成',
    exportTitle: '列印／存成',
    pdf: 'PDF',
    pdfHint: '列印，或存成 PDF',
    csv: 'CSV',
    csvHint: '用 Excel 開啟',
    csvFilename: (name: string, from: string, to: string) => `血壓紀錄_${name}_${from}_${to}.csv`,
    // CSV 檔案的欄位標題
    csvHeader: ['日期', '星期', '時段', '時間', '收縮壓', '舒張壓', '脈搏', '吃藥', '今日狀況'],
  },

  // ───────── 登入／建立帳號 ─────────
  login: {
    pageTitle: '登入',
    heading: '血壓記錄',
    subtitle: '登入後，只看得到自己的紀錄。',
    modeAria: '登入或建立帳號',
    modeLogin: '登入',
    modeRegister: '建立帳號',
    username: '帳號',
    usernamePlaceholder: '請輸入手機號碼，例如 0912345678',
    displayName: '顯示名稱',
    displayNameHint: '（選填，請填自己的姓名）',
    displayNamePlaceholder: '例如：王小美',
    password: '密碼',
    passwordHintRegister: '（用生日 4 碼，例如 3 月 4 日填 0304）',
    passwordPlaceholderLogin: '輸入你的密碼',
    passwordPlaceholderRegister: '生日 4 碼，例如 0304',
    show: '顯示',
    hide: '隱藏',
    inviteCode: '邀請碼',
    inviteHint: '（向序亞詢問）',
    submitLogin: '登入',
    submitRegister: '建立帳號',
    busyLogin: '登入中…',
    busyRegister: '建立中…',
  },

  // ───────── 管理員頁 ─────────
  admin: {
    pageTitle: '管理',
    back: '← 回記錄頁',
    heading: '管理：重設密碼',
    intro: '幫忘記密碼的家人換一個新密碼。',
    adminCode: '管理密碼',
    enter: '進入',
    checking: '確認中…',
    noAccounts: '目前還沒有任何帳號',
    whoLabel: '要重設誰的密碼',
    newPassword: '新密碼',
    newPasswordHint: '（至少 4 個字元）',
    reset: '重設密碼',
    resetting: '重設中…',
    resetFailed: '重設失敗，請再試一次',
    resetDone: (who: string, password: string) => `已重設 ${who} 的密碼，新密碼是「${password}」，請告訴對方。`,
    footer: '重設後，對方在所有裝置上都會被登出，要用新密碼重新登入。紀錄不會消失。',
    statusTitle: '帳號使用狀況',
    colAccount: '帳號',
    colLastSeen: '最後使用',
    colLastRecord: '最後記錄',
    count: (n: number) => `共 ${n} 筆`,
    statusNote: '橘色＝超過 3 天，紅色＝超過 7 天或從來沒有。最後使用從這次更新後才開始記錄。',
    ago: { never: '從來沒有', today: '今天', yesterday: '昨天', days: (n: number) => `${n} 天前` },
  },
}
