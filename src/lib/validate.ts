/**
 * 收縮壓（高壓）一定要比舒張壓（低壓）大。長輩常常把兩個數字填反，所以在輸入的當下就比較。
 * 兩個欄位都有填、而且收縮壓 ≤ 舒張壓，才算填錯（只填一個、或還在輸入中不算）。
 */
export function bpOrderWrong(sys: string, dia: string): boolean {
  if (sys.trim() === '' || dia.trim() === '') return false
  const s = Number(sys)
  const d = Number(dia)
  return Number.isFinite(s) && Number.isFinite(d) && s <= d
}
