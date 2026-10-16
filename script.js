(function () {
    registerServiceWorker();
    if (!requireLogin()) return;
    renderUser();

    const form = document.getElementById("bpForm");
    const submitBtn = document.getElementById("submitBtn");
    const dateInput = document.getElementById("date");
    const dialog = document.getElementById("resultDialog");
    const dialogTitle = document.getElementById("resultTitle");
    const dialogDetail = document.getElementById("resultDetail");
    const dialogOk = document.getElementById("resultOk");
    let closeTimer = null;

    function localToday() {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${mm}-${dd}`;
    }

    // 結果用畫面正中央的視窗通知，小螢幕不用往下捲也看得到
    function showResult(kind, title, detail) {
        dialog.dataset.kind = kind;
        dialogTitle.textContent = title;
        dialogDetail.textContent = detail || "";
        dialog.hidden = false;
        dialogOk.focus();
        clearTimeout(closeTimer);
        if (kind === "ok") closeTimer = setTimeout(closeResult, 4000); // 成功 4 秒後自動關閉；失敗要按「好」才關
    }

    function closeResult() {
        clearTimeout(closeTimer);
        dialog.hidden = true;
    }

    dialogOk.addEventListener("click", closeResult);
    dialog.addEventListener("click", event => { if (event.target === dialog) closeResult(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !dialog.hidden) closeResult(); });

    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const now = new Date();
    document.getElementById("todayText").textContent =
        `今天是 ${now.getMonth() + 1} 月 ${now.getDate()} 日（週${weekdays[now.getDay()]}）`;

    dateInput.value = localToday();
    dateInput.max = localToday();

    // 確認登入還有效（過期就回登入頁），同時先把歷史紀錄抓好，之後打開歷史頁就不用等
    refreshRecords().then(result => {
        if (handleAuthError(result)) return;
        renderUser();
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (submitBtn.disabled) return;

        const params = Object.fromEntries(new FormData(form));
        submitBtn.disabled = true;
        submitBtn.textContent = "儲存中…";

        const result = await callApi("add", params);
        submitBtn.disabled = false;
        submitBtn.textContent = "儲存紀錄";

        if (handleAuthError(result)) return;
        if (!result.ok) {
            showResult("error", "沒有儲存成功", result.error || "請再試一次");
            return;
        }

        if (result.duplicate) {
            showResult("ok", "已經儲存過了", "這筆資料剛剛已經存好，不會重複記錄。");
        } else {
            showResult("ok", "已儲存", `收縮壓 ${params.systolic} / 舒張壓 ${params.diastolic}，脈搏 ${params.pulse}`);
        }
        refreshRecords(); // 背景更新歷史紀錄，不用等
        const keepDate = dateInput.value;
        form.reset();
        dateInput.value = keepDate;
    });
})();
