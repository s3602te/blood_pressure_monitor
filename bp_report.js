(function () {
    registerServiceWorker();
    if (!requireLogin()) return;
    renderUser();

    const PER_PAGE = 7;
    const HIGH_SYS = 135;
    const HIGH_DIA = 85;
    const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

    let days = [];   // 依日期由舊到新
    let page = 1;    // 第 1 頁 = 最新的 7 天
    let chart = null;
    let openIso = null; // 目前打開「修改」視窗的那一天

    const $ = id => document.getElementById(id);

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text; // 用 textContent，避免使用者輸入的文字被當成 HTML
        return node;
    }

    function pad(n) { return String(n).padStart(2, "0"); }

    init();

    // 先秀出這台裝置上次存的紀錄（馬上看得到），再到背景抓最新的，有變動才更新畫面
    async function init() {
        const cached = RecordCache.read();
        if (cached) show(cached.records);

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
        if (!cached || JSON.stringify(cached.records) !== JSON.stringify(result.records)) {
            show(result.records);
        }
    }

    function show(records) {
        days = aggregateByDate(records);
        $("loadingText").hidden = true;
        $("emptyState").hidden = days.length > 0;
        $("content").hidden = days.length === 0;
        if (!days.length) return;
        page = Math.min(page, totalPages());
        setupPager();
        render();
    }

    // 同一天多筆合併成一筆：血壓取平均，有任何一筆「有吃」就算有吃，狀況文字合併。
    // items 留著這天的每一筆原始紀錄，修改、刪除時要用。
    function aggregateByDate(records) {
        const map = new Map();
        records
            .filter(r => r.date && Number.isFinite(r.sys) && Number.isFinite(r.dia))
            .sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)
            .forEach(r => {
                if (!map.has(r.date)) {
                    map.set(r.date, { date: r.date, sys: 0, dia: 0, pulse: 0, pulseCount: 0, count: 0, took: false, notes: [], items: [] });
                }
                const d = map.get(r.date);
                d.sys += r.sys;
                d.dia += r.dia;
                if (Number.isFinite(r.pulse)) { d.pulse += r.pulse; d.pulseCount++; }
                d.count++;
                d.items.push(r);
                if (r.med === "有吃") d.took = true;
                if (r.notes && !d.notes.includes(r.notes)) d.notes.push(r.notes);
            });

        return [...map.values()].map(d => {
            const [y, m, day] = d.date.split("-").map(Number);
            return {
                iso: d.date,
                label: `${pad(m)}/${pad(day)}`,
                weekday: WEEKDAYS[new Date(y, m - 1, day).getDay()],
                sys: Math.round(d.sys / d.count),
                dia: Math.round(d.dia / d.count),
                pulse: d.pulseCount ? Math.round(d.pulse / d.pulseCount) : null,
                med: d.took ? "有吃" : "沒吃",
                notes: d.notes.join("；"),
                items: d.items
            };
        });
    }

    function totalPages() {
        return Math.ceil(days.length / PER_PAGE);
    }

    function pageSlice() {
        const end = days.length - (page - 1) * PER_PAGE;
        return days.slice(Math.max(0, end - PER_PAGE), end);
    }

    function setupPager() {
        const total = totalPages();
        const select = $("pageSelect");
        select.innerHTML = "";
        for (let i = 1; i <= total; i++) {
            const opt = document.createElement("option");
            opt.value = i;
            // 用日期範圍當選項，一看就知道是哪一段；最新的一段排第一個
            const end = days.length - (i - 1) * PER_PAGE;
            const start = Math.max(0, end - PER_PAGE);
            opt.textContent = `${i === 1 ? "最新　" : ""}${days[start].label} 到 ${days[end - 1].label}`;
            select.appendChild(opt);
        }
        select.onchange = () => { page = Number(select.value); render(); };
        $("olderPage").onclick = () => { if (page < total) { page++; render(); } };
        $("newerPage").onclick = () => { if (page > 1) { page--; render(); } };
    }

    function average(list, key) {
        const values = list.map(d => d[key]).filter(Number.isFinite);
        return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : "--";
    }

    function render() {
        const slice = pageSlice();
        $("pageSelect").value = page;
        $("olderPage").disabled = page >= totalPages();
        $("newerPage").disabled = page <= 1;

        $("summaryCaption").textContent = `這 ${slice.length} 天的平均`;
        $("avgSys").textContent = average(slice, "sys");
        $("avgDia").textContent = average(slice, "dia");
        $("avgPulse").textContent = average(slice, "pulse");
        $("rangeCaption").textContent = `${slice[0].label} 到 ${slice[slice.length - 1].label}`;

        renderTable(slice);
        renderChart(slice);
    }

    function numCell(value, isHigh) {
        const td = document.createElement("td");
        td.className = "num";
        if (isHigh) {
            const mark = document.createElement("span");
            mark.className = "hi";
            mark.textContent = value;
            td.appendChild(mark);
        } else {
            td.textContent = value ?? "--";
        }
        return td;
    }

    function renderTable(slice) {
        const body = $("logBody");
        body.innerHTML = "";
        [...slice].reverse().forEach(d => {
            const tr = document.createElement("tr");

            const dateTd = document.createElement("td");
            const dateEl = el("div", "date", d.label);
            dateEl.appendChild(el("span", "weekday", `週${d.weekday}`));
            dateTd.appendChild(dateEl);
            if (d.notes) dateTd.appendChild(el("div", "note", d.notes));
            const editBtn = el("button", "link-btn row-edit", "修改");
            editBtn.type = "button";
            editBtn.setAttribute("aria-label", `修改或刪除 ${d.label} 的紀錄`);
            editBtn.onclick = () => openDay(d.iso);
            dateTd.appendChild(editBtn);
            tr.appendChild(dateTd);

            tr.appendChild(numCell(d.sys, d.sys >= HIGH_SYS));
            tr.appendChild(numCell(d.dia, d.dia >= HIGH_DIA));
            tr.appendChild(numCell(d.pulse, false));

            tr.appendChild(el("td", null, d.med));
            body.appendChild(tr);
        });
    }

    /* ───────────── 圖表 ───────────── */

    // 135 和 85 的參考虛線：一眼看出哪幾天超過
    const refLines = {
        id: "refLines",
        afterDatasetsDraw(c) {
            const { ctx, chartArea: area, scales: { y } } = c;
            [[HIGH_SYS, "#1f5f8b"], [HIGH_DIA, "#2ba38f"]].forEach(([value, color]) => {
                if (value < y.min || value > y.max) return;
                const py = y.getPixelForValue(value);
                ctx.save();
                ctx.setLineDash([6, 5]);
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.55;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(area.left, py);
                ctx.lineTo(area.right, py);
                ctx.stroke();
                ctx.restore();
            });
        }
    };

    function renderChart(slice) {
        if (typeof Chart === "undefined") {
            $("bpChart").parentElement.hidden = true; // 離線且沒快取到圖表套件時，只顯示表格
            return;
        }
        $("bpChart").parentElement.hidden = false;
        if (chart) chart.destroy();
        Chart.defaults.font.family = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

        const k = document.documentElement.getAttribute("data-size") === "large" ? 1.25 : 1; // 放大字體時圖表文字一起放大
        const HIGH_COLOR = "#c9670a";

        const line = (label, key, color, limit) => ({
            label,
            data: slice.map(d => d[key]),
            borderColor: color,
            backgroundColor: color,
            borderWidth: 3,
            tension: 0.25,
            // 高於參考值的點改成橘色並放大，一看就知道
            pointBackgroundColor: c => (c.raw >= limit ? HIGH_COLOR : color),
            pointBorderColor: c => (c.raw >= limit ? HIGH_COLOR : color),
            pointRadius: c => (c.raw >= limit ? 7 : 4),
            pointHoverRadius: 8
        });

        chart = new Chart($("bpChart").getContext("2d"), {
            type: "line",
            data: {
                labels: slice.map(d => d.label),
                datasets: [
                    line("收縮壓（高壓）", "sys", "#1f5f8b", HIGH_SYS),
                    line("舒張壓（低壓）", "dia", "#2ba38f", HIGH_DIA)
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                scales: {
                    x: { ticks: { autoSkip: false, font: { size: 13 * k } } },
                    y: { suggestedMin: 50, suggestedMax: 160, ticks: { font: { size: 13 * k } } }
                },
                plugins: {
                    legend: { labels: { usePointStyle: true, font: { size: 14 * k } } },
                    tooltip: {
                        titleFont: { size: 14 * k },
                        bodyFont: { size: 14 * k },
                        footerFont: { size: 13 * k },
                        callbacks: {
                            footer: items => {
                                const d = slice[items[0].dataIndex];
                                return [`脈搏：${d.pulse ?? "--"}`, `吃藥：${d.med}`];
                            }
                        }
                    }
                }
            },
            plugins: [refLines]
        });
    }

    window.addEventListener("bp-fontchange", () => { if (days.length) render(); });

    /* ───────────── 修改／刪除 ───────────── */

    const dayDialog = $("dayDialog");
    const dayBody = $("dayBody");
    const dayError = $("dayError");
    let busy = false;

    function setDayError(text) {
        dayError.textContent = text || "";
    }

    function openDay(iso) {
        openIso = iso;
        setDayError("");
        dayDialog.hidden = false;
        renderDay();
        $("dayClose").focus();
    }

    function closeDay() {
        dayDialog.hidden = true;
        openIso = null;
        dayBody.innerHTML = "";
        setDayError("");
    }

    $("dayClose").addEventListener("click", closeDay);
    dayDialog.addEventListener("click", event => { if (event.target === dayDialog) closeDay(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !dayDialog.hidden) closeDay(); });

    function timeText(r) {
        if (!r.at) return "（沒有記錄時間）";
        const t = new Date(r.at);
        const h = t.getHours();
        return `${h >= 4 && h < 12 ? "早上" : "晚上"} ${pad(h)}:${pad(t.getMinutes())}`;
    }

    function renderDay() {
        const day = days.find(d => d.iso === openIso);
        if (!day) { closeDay(); return; }
        $("dayTitle").textContent = `${day.label}（週${day.weekday}）的紀錄`;
        $("daySub").textContent = day.items.length > 1
            ? `這天有 ${day.items.length} 筆，可以分別修改或刪除。`
            : "可以修改或刪除這筆紀錄。";
        dayBody.innerHTML = "";
        day.items.forEach(r => dayBody.appendChild(itemView(r)));
    }

    function itemView(r) {
        const box = el("div", "rec");
        box.appendChild(el("div", "rec-time", timeText(r)));

        const bp = el("div", "rec-bp");
        const bpNum = el("span", r.sys >= HIGH_SYS || r.dia >= HIGH_DIA ? "hi" : "", `${r.sys}/${r.dia}`);
        bp.appendChild(bpNum);
        bp.appendChild(el("span", "rec-pulse", Number.isFinite(r.pulse) ? `　脈搏 ${r.pulse}` : ""));
        box.appendChild(bp);

        const meta = [r.med, r.notes].filter(Boolean).join("　｜　");
        if (meta) box.appendChild(el("div", "rec-meta", meta));

        if (r.row) {
            const actions = el("div", "rec-actions");
            const edit = el("button", "btn btn-quiet", "修改");
            edit.type = "button";
            edit.onclick = () => { if (!busy) editView(r, box); };
            const del = el("button", "btn btn-quiet btn-danger", "刪除");
            del.type = "button";
            del.onclick = () => { if (!busy) removeRecord(r); };
            actions.appendChild(edit);
            actions.appendChild(del);
            box.appendChild(actions);
        }
        return box;
    }

    function field(labelText, input) {
        const wrap = el("div", "field");
        wrap.appendChild(el("label", null, labelText));
        wrap.appendChild(input);
        return wrap;
    }

    function numberInput(name, value, min, max) {
        const input = el("input", "input");
        input.type = "number";
        input.name = name;
        input.inputMode = "numeric";
        input.min = min;
        input.max = max;
        input.value = Number.isFinite(value) ? value : "";
        input.required = true;
        return input;
    }

    // 把這一筆換成可以修改的表單
    function editView(r, box) {
        setDayError("");
        const form = el("form", "rec-form");

        const date = el("input", "input");
        date.type = "date";
        date.name = "date";
        date.value = r.date;
        const t = new Date();
        date.max = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
        date.required = true;
        form.appendChild(field("日期", date));

        const sys = numberInput("systolic", r.sys, 50, 300);
        const dia = numberInput("diastolic", r.dia, 30, 200);
        const pulse = numberInput("pulse", r.pulse, 30, 250);
        form.appendChild(field("收縮壓（高壓）", sys));
        form.appendChild(field("舒張壓（低壓）", dia));
        form.appendChild(field("脈搏", pulse));

        const seg = el("div", "seg");
        ["有吃", "沒吃"].forEach(value => {
            const label = document.createElement("label");
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "medication";
            radio.value = value;
            radio.required = true;
            radio.checked = r.med === value;
            label.appendChild(radio);
            label.appendChild(el("span", null, value));
            seg.appendChild(label);
        });
        form.appendChild(field("有吃藥嗎？", seg));

        const notes = el("textarea", "input");
        notes.name = "notes";
        notes.maxLength = 500;
        notes.value = r.notes || "";
        form.appendChild(field("今天的狀況", notes));

        const actions = el("div", "rec-actions");
        const save = el("button", "btn btn-primary", "儲存修改");
        save.type = "submit";
        const cancel = el("button", "btn btn-quiet", "取消");
        cancel.type = "button";
        cancel.onclick = () => { setDayError(""); renderDay(); };
        actions.appendChild(save);
        actions.appendChild(cancel);
        form.appendChild(actions);

        form.addEventListener("submit", async event => {
            event.preventDefault();
            if (busy) return;
            const data = new FormData(form);
            const params = {
                row: r.row,
                origAt: r.at,
                origDate: r.date,
                date: data.get("date"),
                systolic: data.get("systolic"),
                diastolic: data.get("diastolic"),
                pulse: data.get("pulse"),
                medication: data.get("medication"),
                notes: data.get("notes")
            };
            setBusy(true, save, "儲存中…");
            const result = await callApi("update", params, 20000);
            setBusy(false, save, "儲存修改");
            if (handleAuthError(result)) return;
            if (!result.ok) { await failed(result); return; }
            const moved = params.date !== r.date;
            await reloadRecords();
            if (moved) closeDay(); // 改了日期，這筆已經搬到別天
            else renderDay();
        });

        box.replaceWith(form);
        sys.focus();
    }

    async function removeRecord(r) {
        const what = `${r.date}　${r.sys}/${r.dia}　脈搏 ${Number.isFinite(r.pulse) ? r.pulse : "--"}`;
        if (!confirm(`確定要刪除這筆紀錄嗎？\n\n${what}\n\n刪除後無法復原。`)) return;
        setDayError("");
        busy = true;
        const result = await callApi("delete", { row: r.row, origAt: r.at, origDate: r.date }, 20000);
        busy = false;
        if (handleAuthError(result)) return;
        if (!result.ok) { await failed(result); return; }
        await reloadRecords();
        renderDay();
    }

    function setBusy(on, button, label) {
        busy = on;
        button.disabled = on;
        button.textContent = label;
    }

    // 沒成功：顯示原因。資料如果已經被別處改過（STALE），順便更新畫面。
    async function failed(result) {
        setDayError(result.error || "沒有成功，請再試一次");
        if (result.code === "STALE") {
            await reloadRecords();
            renderDay();
        }
    }

    // 修改後重新抓最新紀錄
    async function reloadRecords() {
        const result = await refreshRecords();
        if (handleAuthError(result)) return;
        if (result.ok) show(result.records);
        else setDayError("已經修改，但更新畫面失敗，請重新整理頁面");
    }
})();
