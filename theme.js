// 明暗の設定を描画より先に当てる(後から当てると一瞬白く光る)
  try { const t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
