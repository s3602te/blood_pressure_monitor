(function () {
    registerServiceWorker();
    if (!requireLogin()) return;
    renderUser();

    const HIGH_SYS = 135;
    const HIGH_DIA = 85;
    const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
    const DAY_MS = 86400000;

    const $ = id => document.getElementById(id);
    let allRecords = [];

    function pad(n) { return String(n).padStart(2, "0"); }
    function dateText(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text; // 用 textContent，避免使用者輸入的文字被當成 HTML
        return node;
    }

    const today = new Date();
    $("toDate").max = dateText(today);
    $("fromDate").max = dateText(today);
    $("toDate").value = dateText(today);
    $("fromDate").value = dateText(addDays(today, -29));

    document.querySelectorAll('input[name="range"]').forEach(radio => {
        radio.addEventListener("change", () => {
            $("customRange").hidden = radio.value !== "custom";
            build();
        });
    });
    $("fromDate").addEventListener("change", build);
    $("toDate").addEventListener("change", build);
    $("printBtn").addEventListener("click", () => window.print());

    init();

    async function init() {
        const cached = RecordCache.read();
        if (cached) {
            allRecords = cached.records;
            $("loadingText").hidden = true;
            build();
        }

        const result = await refreshRecords();
        if (handleAuthError(result)) return;
        if (!result.ok) {
            if (cached) {
                $("loadingText").textContent = "目前顯示的是上次的紀錄（更新失敗）";
                $("loadingText").hidden = false;
            } else {
                $("loadingText").hidden = true;
                $("errorText").textContent = result.error || "讀取失敗，請稍後再試";
            }
            return;
        }
        $("loadingText").hidden = true;
        if (!cached || JSON.stringify(cached.records) !== JSON.stringify(result.records)) {
            allRecords = result.records;
            build();
        }
    }

    function currentRange() {
        const choice = document.querySelector('input[name="range"]:checked').value;
        if (choice === "custom") {
            let from = $("fromDate").value;
            let to = $("toDate").value;
            if (!from || !to) return null;
            if (from > to) [from, to] = [to, from];
            return { from, to };
        }
        const n = Number(choice);
        return { from: dateText(addDays(today, -(n - 1))), to: dateText(today) };
    }

    // 同一天、數值完全相同、記錄時間相差不到 1 分鐘的視為重複（舊版曾有連按兩次存成兩筆的情形）
    function dedupe(list) {
        const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
        const out = [];
        sorted.forEach(r => {
            const prev = out[out.length - 1];
            if (prev && prev.date === r.date && prev.sys === r.sys && prev.dia === r.dia &&
                prev.pulse === r.pulse && Math.abs(r.at - prev.at) < 60000) {
                return;
            }
            out.push(r);
        });
        return out;
    }

    // 早上＝凌晨 4 點到中午 12 點前記錄的；其餘算晚上（半夜補記的也算前一天的晚上）。沒有記錄時間的舊資料，先放早上、已有再放晚上。
    function groupByDay(records) {
        const days = new Map();
        records.forEach(r => {
            if (!days.has(r.date)) days.set(r.date, { date: r.date, slots: [[], []], took: false, notes: [] });
            const d = days.get(r.date);
            if (r.med === "有吃") d.took = true;
            if (r.notes && !d.notes.includes(r.notes)) d.notes.push(r.notes);
            let slot;
            if (r.at) {
                const h = new Date(r.at).getHours();
                slot = h >= 4 && h < 12 ? 0 : 1;
            } else {
                slot = d.slots[0].length ? 1 : 0;
            }
            d.slots[slot].push(r);
        });
        return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    }

    function mean(list, key) {
        const v = list.map(r => r[key]).filter(Number.isFinite);
        return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    }

    function bpText(list) {
        const s = mean(list, "sys");
        const d = mean(list, "dia");
        return s === null || d === null ? "--" : `${s}/${d}`;
    }

    function build() {
        const range = currentRange();
        if (!range) return;

        const inRange = allRecords.filter(r =>
            r.date >= range.from && r.date <= range.to &&
            Number.isFinite(r.sys) && Number.isFinite(r.dia));
        const readings = dedupe(inRange);
        const days = groupByDay(readings);

        $("errorText").textContent = "";
        $("emptyState").hidden = days.length > 0;
        $("report").hidden = days.length === 0;
        if (!days.length) return;

        const session = Session.read();
        $("reportName").textContent = (session && (session.displayName || session.username)) || "";
        $("reportRange").textContent = `${range.from} 到 ${range.to}`;
        $("reportStamp").textContent = `整理日期：${dateText(new Date())}`;

        renderStats(readings, days);
        renderTable(days);
    }

    function stat(label, value, sub) {
        const box = el("div", "stat");
        box.appendChild(el("div", "stat-label", label));
        box.appendChild(el("div", "stat-value", value));
        if (sub) box.appendChild(el("div", "stat-sub", sub));
        return box;
    }

    function renderStats(readings, days) {
        const grid = $("statGrid");
        grid.innerHTML = "";

        const morning = readings.filter(r => days.find(d => d.date === r.date).slots[0].includes(r));
        const evening = readings.filter(r => days.find(d => d.date === r.date).slots[1].includes(r));
        const high = readings.filter(r => r.sys >= HIGH_SYS || r.dia >= HIGH_DIA).length;
        const tookDays = days.filter(d => d.took).length;
        const peak = readings.reduce((a, b) => (b.sys > a.sys ? b : a));
        const pulse = mean(readings, "pulse");

        grid.appendChild(stat("平均血壓", bpText(readings), `脈搏 ${pulse === null ? "--" : pulse}`));
        grid.appendChild(stat("記錄天數", `${days.length} 天`, `共 ${readings.length} 次量測`));
        grid.appendChild(stat("早上平均", bpText(morning), `${morning.length} 次`));
        grid.appendChild(stat("晚上平均", bpText(evening), `${evening.length} 次`));
        grid.appendChild(stat("偏高次數", `${high} 次`, `佔 ${Math.round(high / readings.length * 100)}%（135/85 以上）`));
        grid.appendChild(stat("有吃藥", `${tookDays} 天`, `記錄的 ${days.length} 天中`));
        grid.appendChild(stat("最高一次", `${peak.sys}/${peak.dia}`, peak.date.slice(5).replace("-", "/")));
    }

    function readingLine(r) {
        const line = el("div", "reading");
        const bp = el("span", null, `${r.sys}/${r.dia}`);
        if (r.sys >= HIGH_SYS || r.dia >= HIGH_DIA) bp.className = "hi";
        else bp.className = "bp";
        line.appendChild(bp);
        if (Number.isFinite(r.pulse)) line.appendChild(el("span", "pulse", `（${r.pulse}）`));
        return line;
    }

    function renderTable(days) {
        const body = $("reportBody");
        body.innerHTML = "";
        days.forEach(d => {
            const tr = document.createElement("tr");

            const dateTd = document.createElement("td");
            const [y, m, day] = d.date.split("-").map(Number);
            const dateEl = el("div", "date", `${pad(m)}/${pad(day)}`);
            dateEl.appendChild(el("span", "weekday", `週${WEEKDAYS[new Date(y, m - 1, day).getDay()]}`));
            dateTd.appendChild(dateEl);
            if (d.notes.length) dateTd.appendChild(el("div", "note", d.notes.join("；")));
            tr.appendChild(dateTd);

            d.slots.forEach(list => {
                const td = document.createElement("td");
                if (list.length) list.forEach(r => td.appendChild(readingLine(r)));
                else td.textContent = "--";
                tr.appendChild(td);
            });

            tr.appendChild(el("td", null, d.took ? "有吃" : "沒吃"));
            body.appendChild(tr);
        });
    }
})();
