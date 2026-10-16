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

    const $ = id => document.getElementById(id);

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

    // 同一天多筆合併成一筆：血壓取平均，有任何一筆「有吃」就算有吃，狀況文字合併
    function aggregateByDate(records) {
        const map = new Map();
        records
            .filter(r => r.date && Number.isFinite(r.sys) && Number.isFinite(r.dia))
            .sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)
            .forEach(r => {
                if (!map.has(r.date)) {
                    map.set(r.date, { date: r.date, sys: 0, dia: 0, pulse: 0, pulseCount: 0, count: 0, took: false, notes: [] });
                }
                const d = map.get(r.date);
                d.sys += r.sys;
                d.dia += r.dia;
                if (Number.isFinite(r.pulse)) { d.pulse += r.pulse; d.pulseCount++; }
                d.count++;
                if (r.med === "有吃") d.took = true;
                if (r.notes && !d.notes.includes(r.notes)) d.notes.push(r.notes);
            });

        return [...map.values()].map(d => {
            const [y, m, day] = d.date.split("-").map(Number);
            return {
                label: `${String(m).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
                weekday: WEEKDAYS[new Date(y, m - 1, day).getDay()],
                sys: Math.round(d.sys / d.count),
                dia: Math.round(d.dia / d.count),
                pulse: d.pulseCount ? Math.round(d.pulse / d.pulseCount) : null,
                med: d.took ? "有吃" : "沒吃",
                notes: d.notes.join("；")
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
            const dateEl = document.createElement("div");
            dateEl.className = "date";
            dateEl.textContent = d.label;
            const weekday = document.createElement("span");
            weekday.className = "weekday";
            weekday.textContent = `週${d.weekday}`;
            dateEl.appendChild(weekday);
            dateTd.appendChild(dateEl);
            if (d.notes) {
                const note = document.createElement("div");
                note.className = "note";
                note.textContent = d.notes; // 用 textContent，避免使用者輸入的文字被當成 HTML
                dateTd.appendChild(note);
            }
            tr.appendChild(dateTd);

            tr.appendChild(numCell(d.sys, d.sys >= HIGH_SYS));
            tr.appendChild(numCell(d.dia, d.dia >= HIGH_DIA));
            tr.appendChild(numCell(d.pulse, false));

            const medTd = document.createElement("td");
            medTd.textContent = d.med;
            tr.appendChild(medTd);

            body.appendChild(tr);
        });
    }

    function renderChart(slice) {
        if (typeof Chart === "undefined") {
            $("bpChart").parentElement.hidden = true; // 離線且沒快取到圖表套件時，只顯示表格
            return;
        }
        if (chart) chart.destroy();
        Chart.defaults.font.family = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

        const line = (label, data, color) => ({
            label, data,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 3,
            pointRadius: 4,
            tension: 0.25
        });

        chart = new Chart($("bpChart").getContext("2d"), {
            type: "line",
            data: {
                labels: slice.map(d => d.label),
                datasets: [
                    line("收縮壓", slice.map(d => d.sys), "#1f5f8b"),
                    line("舒張壓", slice.map(d => d.dia), "#2ba38f")
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { autoSkip: false, font: { size: 13 } } },
                    y: { suggestedMin: 50, suggestedMax: 160, ticks: { font: { size: 13 } } }
                },
                plugins: { legend: { labels: { usePointStyle: true, font: { size: 14 } } } }
            }
        });
    }
})();
