// TODO: 換成你自己部署後的 Web App GET URL（確保權限設定為「任何人（匿名）皆可存取」）
const apiURL = "https://script.google.com/macros/s/AKfycbzrFVUBw72vURX3TTmRPmDl-cq6sSHVC_U7aFxWc70_P4RgXZOuECGzkq_Pyh7Nle81Bg/exec";

let currentPage = 1;
const itemsPerPage = 7;
let aggregatedRecords = [];
let chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  fetch(apiURL)
    .then(r => r.json())
    .then(data => {
      aggregatedRecords = aggregateByDate(data.records);
      initPagination();
      renderPage();
    })
    .catch(console.error);
});

/**
 * 將同一天的多筆資料聚合成一筆，計算平均值，
 * 並正確處理時區，保證 05/09 不會被算成 05/08
 */
function aggregateByDate(records) {
  const map = {};
  records.forEach(r => {
    // r = [日期, sys, dia, pulse, stress, med, notes, ...]
    const d = new Date(r[0]);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key   = `${yyyy}-${mm}-${dd}`; // 用於排序
    const label = `${mm}/${dd}`;         // 用於顯示

    if (!map[key]) {
      map[key] = { key, label, sys: 0, dia: 0, pulse: 0, stress: 0, count: 0, med: '', notes: '' };
    }
    const m = map[key];
    m.sys    += Number(r[1]);
    m.dia    += Number(r[2]);
    m.pulse  += Number(r[3]);
    m.stress += Number(r[4]);
    m.count++;
    m.med    = r[5];
    m.notes  = r[6];
  });

  return Object.values(map)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(m => [
      m.label,
      Math.round(m.sys / m.count),
      Math.round(m.dia / m.count),
      Math.round(m.pulse / m.count),
      Math.round(m.stress / m.count),
      m.med,
      m.notes
    ]);
}

// 初始化分頁控制：上一頁 / 下一頁 / 下拉跳頁
function initPagination() {
  const total = Math.ceil(aggregatedRecords.length / itemsPerPage);
  const sel   = document.getElementById('pageSelect');
  sel.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.text  = i;
    sel.appendChild(opt);
  }
  document.getElementById('prevPage').onclick = () => {
    if (currentPage > 1) renderPage(--currentPage);
  };
  document.getElementById('nextPage').onclick = () => {
    if (currentPage < total) renderPage(++currentPage);
  };
  sel.onchange = () => renderPage(currentPage = Number(sel.value));
}

// 渲染分頁：更新表格、下拉選單及圖表
function renderPage(page = currentPage) {
  currentPage = page;
  const start = (page - 1) * itemsPerPage;
  const slice = aggregatedRecords.slice(start, start + itemsPerPage);

  // 表格
  const tbody = document.querySelector('#reportsTable tbody');
  tbody.innerHTML = '';
  slice.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(c => {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // 更新下拉顯示
  document.getElementById('pageSelect').value = page;

  // 重繪圖表
  drawChart(slice);
}

// 用 Chart.js 繪製柱狀圖，並套用藍/綠 & 黃/橘配色，支援點 legend 切換
function drawChart(rows) {
  const labels = rows.map(r => r[0]);
  const sys    = rows.map(r => r[1]);
  const dia    = rows.map(r => r[2]);
  const avgSys = Math.round(sys.reduce((a, b) => a + b, 0) / sys.length);
  const avgDia = Math.round(dia.reduce((a, b) => a + b, 0) / dia.length);

  labels.push('平均');
  sys.push(avgSys);
  dia.push(avgDia);

  const ctx = document.getElementById('bpChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '收縮壓 (SYS)',
          data: sys,
          backgroundColor: labels.map(l => l === '平均' ? '#FFD700' : '#007BFF'),
          borderColor: '#0056b3'
        },
        {
          label: '舒張壓 (DIA)',
          data: dia,
          backgroundColor: labels.map(l => l === '平均' ? '#FFA500' : '#28a745'),
          borderColor: '#218838'
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { autoSkip: false } },
        y: { beginAtZero: true }
      },
      plugins: {
        legend: {
          onClick: (e, item, legend) => {
            const ci = legend.chart;
            const meta = ci.getDatasetMeta(item.datasetIndex);
            meta.hidden = !meta.hidden;
            ci.update();
          }
        }
      }
    }
  });
}
