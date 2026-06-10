/* PageMarketingROI — Custo por Lead (E-gestor x RD Station) */
const { useState, useMemo } = React;

// Mapeamento de categorias do E-gestor para canais de marketing
const CANAL_MAP = [
  { canal: "TV",        re: /an[uú]ncio.*televis/i },
  { canal: "Rádio",     re: /an[uú]ncio.*r[aá]dio/i },
  { canal: "Meta",      re: /trafego.*meta|meta.*(?:face|insta)|an[uú]ncio.*(?:instragram|face)/i },
  { canal: "Google",    re: /trafego.*google|google.*ads|an[uú]ncio.*google/i },
  { canal: "Agência",   re: /ag[eê]ncia.*(?:publicidade|market)|publicidade.*market/i },
  { canal: "Campanhas", re: /campanhas?\s*(?:de\s+)?divers|campanha\s+(?:vale|revis|carteira)/i },
  { canal: "Premiação", re: /premia[cç][aã]o/i },
];
const MKT_RE = new RegExp(CANAL_MAP.map(c => c.re.source).join("|"), "i");

function classifyCanal(cat) {
  for (const m of CANAL_MAP) { if (m.re.test(cat)) return m.canal; }
  return "Outros";
}

const CANAL_COLORS = {
  "TV": "var(--amber)", "Rádio": "var(--violet)", "Meta": "#1877F2",
  "Google": "#34a853", "Agência": "var(--cyan)", "Campanhas": "#f59e0b",
  "Premiação": "#a78bfa", "Formulário": "#6b7280", "Redes Sociais": "#ec4899",
  "Indicação": "#10b981", "Renovação": "#06b6d4", "Outros": "#6b7686",
};

// Funil de qualificação — formato trapézio real (afunila de cima pra baixo)
const FUNIL_COLORS = [
  "#22d3ee", "#06b6d4", "#2dd4bf", "#34d399", "#fbbf24", "#f97316", "#10b981", "#10b981",
];
const FUNIL_QUAL = {
  novo_cliente: { tag: "Desqualificado", desc: "Sem interesse identificado" },
  interesse: { tag: "Desqualificado", desc: "Não avançou para visita" },
  visita: { tag: "Qualificado", desc: "Visita confirmada" },
  reagendamento: { tag: "Qualificado", desc: "Reagendamento em curso" },
  fechamento: { tag: "Em Fechamento", desc: "Verificando fechamento" },
  assinatura: { tag: "Em Fechamento", desc: "Aguardando assinatura" },
  pre_venda: { tag: "Convertido", desc: "Pré-venda ativa" },
  venda: { tag: "Convertido", desc: "Venda fechada" },
};
const QUAL_TAG_COLORS = {
  "Desqualificado": "#ef4444", "Qualificado": "#fbbf24",
  "Em Fechamento": "#22d3ee", "Convertido": "#10b981",
};

const FunnelChart = ({ funil, perdidos, totalLeads }) => {
  if (!funil || funil.length === 0) return null;

  // Separate funnel steps (trapezoid) from the final "Venda" step (special)
  const isVenda = (s) => s.id === "venda";
  const funnelSteps = funil.filter(s => !isVenda(s));
  const vendaStep = funil.find(s => isVenda(s));
  const nFunnel = funnelSteps.length;

  const W = 560, padLeft = 100, padRight = 120;
  const funnelW = W - padLeft - padRight;
  const rowH = 46, gap = 14;
  const topW = funnelW;
  const bottomW = funnelW * 0.18;
  const cx = padLeft + funnelW / 2; // center of funnel area (not of SVG)

  // Venda row: smaller height, extra gap, fixed narrow width
  const vendaGap = 22, vendaH = 40, vendaW = bottomW * 1.1;
  const funnelBodyH = nFunnel * (rowH + gap) - gap;
  const H = funnelBodyH + (vendaStep ? vendaGap + vendaH : 0) + 20;

  // Pre-compute geometry for funnel steps
  const steps = funnelSteps.map((step, i) => {
    const t0 = i / nFunnel, t1 = (i + 1) / nFunnel;
    const w0 = topW - (topW - bottomW) * t0;
    const w1 = topW - (topW - bottomW) * t1;
    const y = i * (rowH + gap);
    return {
      ...step, i,
      y, w0, w1,
      x0L: cx - w0 / 2, x0R: cx + w0 / 2,
      x1L: cx - w1 / 2, x1R: cx + w1 / 2,
    };
  });

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} preserveAspectRatio="xMidYMid meet">
        <defs>
          {funil.map((_, i) => (
            <linearGradient key={i} id={`fg${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={FUNIL_COLORS[i]} stopOpacity="0.05" />
              <stop offset="50%" stopColor={FUNIL_COLORS[i]} stopOpacity="0.32" />
              <stop offset="100%" stopColor={FUNIL_COLORS[i]} stopOpacity="0.05" />
            </linearGradient>
          ))}
          <marker id="fArrRed" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M1,1 L7,4 L1,7 Z" fill="#ef4444" />
          </marker>
          <marker id="fArrCyan" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M1,1 L7,4 L1,7 Z" fill="#22d3ee" />
          </marker>
          <marker id="fArrAmber" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M1,1 L7,4 L1,7 Z" fill="#fbbf24" />
          </marker>
          <marker id="fArrPurple" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M1,1 L7,4 L1,7 Z" fill="#a78bfa" />
          </marker>
        </defs>

        {steps.map((s, i) => {
          const points = `${s.x0L},${s.y} ${s.x0R},${s.y} ${s.x1R},${s.y + rowH} ${s.x1L},${s.y + rowH}`;
          const pct = totalLeads > 0 ? (s.total / totalLeads * 100) : 0;
          const color = FUNIL_COLORS[i];
          const midY = s.y + rowH / 2;

          return (
            <g key={s.id}>
              <polygon points={points} fill={`url(#fg${i})`} stroke={color} strokeWidth="1.5" strokeOpacity="0.5" />
              <text x={cx} y={midY - 8} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="600" fontFamily="var(--font-ui)" opacity="0.85">
                {s.label}
              </text>
              <text x={cx} y={midY + 7} textAnchor="middle" fill={color} fontSize="14" fontWeight="700" fontFamily="var(--font-mono)">
                {s.total.toLocaleString("pt-BR")}
              </text>
              <text x={cx} y={midY + 19} textAnchor="middle" fill={color} fontSize="9.5" fontWeight="500" fontFamily="var(--font-mono)" opacity="0.7">
                ({pct.toFixed(1)}%)
              </text>
            </g>
          );
        })}

        {/* Curved arrows between funnel steps */}
        {steps.map((s, i) => {
          if (i >= nFunnel - 1) return null;
          const next = steps[i + 1];
          const dropOff = s.total - next.total;
          const passPct = s.total > 0 ? (next.total / s.total * 100) : 0;
          const dropPct = s.total > 0 ? (dropOff / s.total * 100) : 0;

          // Right side: curved arrow from this step bottom-right to next step top-right
          const rStartY = s.y + rowH;
          const rEndY = next.y;
          const rX = s.x1R + 6;           // start x (bottom-right edge)
          const rX2 = next.x0R + 6;       // end x (top-right edge of next)
          const rBulge = 28;              // how far the curve goes out
          const rMidY = (rStartY + rEndY) / 2;
          const rPath = `M${rX},${rStartY} C${rX + rBulge},${rStartY + 4} ${rX2 + rBulge},${rEndY - 4} ${rX2},${rEndY}`;

          // Left side: curved arrow going out left
          const lX = s.x1L - 6;
          const lX2 = next.x0L - 6;
          const lBulge = 28;
          const lPath = `M${lX},${rStartY} C${lX - lBulge},${rStartY + 4} ${lX2 - lBulge},${rEndY - 4} ${lX2},${rEndY}`;

          return (
            <g key={s.id + "-trans"}>
              {/* Right: pass-through % (curved arrow) */}
              <path d={rPath} fill="none" stroke="#22d3ee" strokeWidth="1.2" opacity="0.5" markerEnd="url(#fArrCyan)" />
              <text x={Math.max(rX, rX2) + rBulge + 4} y={rMidY + 4} textAnchor="start" fill="#22d3ee" fontSize="10.5" fontWeight="600" fontFamily="var(--font-mono)">
                {passPct.toFixed(1)}%
              </text>

              {/* Left: drop-off leads (curved arrow) */}
              {dropOff > 0 && (
                <g>
                  <path d={lPath} fill="none" stroke="#ef4444" strokeWidth="1.2" opacity="0.5" markerEnd="url(#fArrRed)" />
                  <text x={Math.min(lX, lX2) - lBulge - 4} y={rMidY + 4} textAnchor="end" fill="#ef4444" fontSize="9.5" fontFamily="var(--font-mono)" opacity="0.85">
                    -{dropOff.toLocaleString("pt-BR")}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Venda step — smaller rectangle below funnel, no transition arrows from pre-venda */}
        {vendaStep && (() => {
          const vy = funnelBodyH + vendaGap;
          const vx = cx - vendaW / 2;
          const vColor = "#10b981";
          const vMidY = vy + vendaH / 2;

          return (
            <g>
              <rect x={vx} y={vy} width={vendaW} height={vendaH} rx={8}
                fill={vColor} fillOpacity="0.15" stroke={vColor} strokeWidth="2" strokeOpacity="0.6" />
              <text x={cx} y={vMidY - 5} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="600" fontFamily="var(--font-ui)">
                {vendaStep.label}
              </text>
              <text x={cx} y={vMidY + 11} textAnchor="middle" fill={vColor} fontSize="14" fontWeight="700" fontFamily="var(--font-mono)">
                {vendaStep.total.toLocaleString("pt-BR")}
              </text>
            </g>
          );
        })()}

        {/* External metric arrows (far right, spanning multiple steps) */}
        {vendaStep && (() => {
          const step1 = steps[0];  // Novo Cliente
          const step3 = steps[2];  // Visita Confirmada (index 2)
          const vy = funnelBodyH + vendaGap;
          const vendas = vendaStep.total;

          // --- CAC: Novo Cliente → Venda (outermost right) ---
          const cacX = W - 18;  // far right
          const cacStartY = step1.y + rowH / 2;
          const cacEndY = vy + vendaH / 2;
          const cacMidY = (cacStartY + cacEndY) / 2;
          const cacPct = step1.total > 0 ? (vendas / step1.total * 100) : 0;
          // Vertical line with rounded corners
          const cacPath = `M${step1.x0R + 6},${cacStartY} L${cacX - 8},${cacStartY} Q${cacX},${cacStartY} ${cacX},${cacStartY + 8} L${cacX},${cacEndY - 8} Q${cacX},${cacEndY} ${cacX - 8},${cacEndY} L${cx + vendaW / 2 + 6},${cacEndY}`;

          // --- Eficiência da Visita: Visita Confirmada → Venda (inner right) ---
          const efX = W - 48;
          const efStartY = step3.y + rowH / 2;
          const efEndY = vy + vendaH / 2;
          const efMidY = (efStartY + efEndY) / 2;
          const efPct = step3.total > 0 ? (vendas / step3.total * 100) : 0;
          const efPath = `M${step3.x0R + 6},${efStartY} L${efX - 8},${efStartY} Q${efX},${efStartY} ${efX},${efStartY + 8} L${efX},${efEndY - 8} Q${efX},${efEndY} ${efX - 8},${efEndY} L${cx + vendaW / 2 + 6},${efEndY - 4}`;

          return (
            <g>
              {/* CAC arrow */}
              <path d={cacPath} fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.45"
                strokeDasharray="4,3" markerEnd="url(#fArrAmber)" />
              <text x={cacX + 2} y={cacMidY + 4} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)"
                transform={`rotate(90, ${cacX + 2}, ${cacMidY + 4})`}>
                {cacPct.toFixed(1)}%
              </text>

              {/* Eficiência da Visita arrow */}
              <path d={efPath} fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.45"
                strokeDasharray="4,3" markerEnd="url(#fArrPurple)" />
              <text x={efX + 2} y={efMidY + 4} textAnchor="middle" fill="#a78bfa" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)"
                transform={`rotate(90, ${efX + 2}, ${efMidY + 4})`}>
                {efPct.toFixed(1)}%
              </text>
            </g>
          );
        })()}
      </svg>
      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", marginTop: 6, fontSize: 10.5 }}>
        {Object.entries(QUAL_TAG_COLORS).map(([tag, color]) => (
          <span key={tag} style={{ display: "flex", alignItems: "center", gap: 4, color }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
            {tag}
          </span>
        ))}
        {perdidos > 0 && (
          <span style={{ color: "#ef4444" }}>
            {perdidos.toLocaleString("pt-BR")} perdidos
          </span>
        )}
      </div>
    </div>
  );
};

// TrendChart — always shows values, hover highlights
const RoiTrendChart = ({ values, labels, height = 180, color = "var(--amber)", gradientId = "rtg", fmtVal }) => {
  const [hover, setHover] = useState(null);
  const w = 1000, h = height;
  const padX = 40, padY = 36;
  const n = Math.max(values.length, 2);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - padX * 2) / (n - 1);
  const points = values.map((v, i) => [padX + i * stepX, padY + (1 - (v - min) / range) * (h - padY * 2)]);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = path + ` L ${points[points.length - 1][0]} ${h - padY} L ${points[0][0]} ${h - padY} Z`;
  const formatVal = fmtVal || ((v) => window.BIT && window.BIT.fmtK ? window.BIT.fmtK(v) : "R$" + Math.round(v));

  return (
    <svg className="trend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}
      onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map(i => {
        const y = padY + (i / 3) * (h - padY * 2);
        return <line key={i} className="grid" x1={padX} y1={y} x2={w - padX} y2={y} />;
      })}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      {points.map((p, i) => {
        const isHov = hover === i;
        const above = p[1] > padY + 20;
        const labelY = above ? p[1] - 10 : p[1] + 18;
        return (
          <g key={i}>
            {/* Hit area */}
            <rect x={p[0] - stepX / 2} y={0} width={stepX} height={h} fill="transparent"
              onMouseEnter={() => setHover(i)} />
            {/* Point */}
            <circle cx={p[0]} cy={p[1]} r={isHov ? 5 : 3} fill={color} opacity={isHov ? 1 : 0.8} />
            {/* Value label — always visible, bolder on hover */}
            <text x={p[0]} y={labelY} textAnchor="middle"
              fill={isHov ? "#fff" : color}
              fontSize={isHov ? "13" : "11"}
              fontWeight={isHov ? "700" : "500"}
              fontFamily="var(--font-mono)"
              opacity={isHov ? 1 : 0.65}>
              {formatVal(values[i])}
            </text>
          </g>
        );
      })}
      {/* Hover vertical line */}
      {hover != null && points[hover] && (
        <line x1={points[hover][0]} y1={padY} x2={points[hover][0]} y2={h - padY}
          stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.3"/>
      )}
      {labels && labels.map((l, i) => (
        <text key={"x"+i} className="axis-text" x={padX + i * stepX} y={h - 4} textAnchor="middle">{l}</text>
      ))}
    </svg>
  );
};

const PageMarketingROI = ({ statusFilter, filters, setFilters, year }) => {
  const ROI = (typeof window !== "undefined" && window.BIT_EXTRAS && window.BIT_EXTRAS.roi) || null;
  const B = window.BIT || {};
  const refYear = year || window.REF_YEAR || new Date().getFullYear();

  if (!ROI) {
    return (
      <div className="page">
        <div className="page-title"><div><h1>Custo por Lead</h1></div></div>
        <div className="card"><h2 className="card-title">Sem dados RD Station</h2>
          <p style={{ color: "var(--mute)" }}>Configure <code>rd_station_file</code> no bi.config.js e rode <code>node build-data-extras.cjs</code>.</p>
        </div>
      </div>
    );
  }

  // ---------- Date filter bounds ----------
  const dateFrom = (filters && filters.dateFrom) || "";
  const dateTo = (filters && filters.dateTo) || "";
  // Month index range from date filters (0-indexed)
  const mFrom = dateFrom ? parseInt(dateFrom.slice(5, 7), 10) - 1 : 0;
  const mTo = dateTo ? parseInt(dateTo.slice(5, 7), 10) - 1 : 11;

  // ---------- Marketing spend from ALL_TX ----------
  const mktData = useMemo(() => {
    const allTx = window.ALL_TX || [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const sf = statusFilter || "realizado";
    const byMonth = new Array(12).fill(0);
    const byCanal = new Map();

    for (let i = 0; i < allTx.length; i++) {
      const r = allTx[i];
      if (r[0] !== "d") continue;
      if (r[9] !== rg) continue;
      if (sf === "realizado" && r[6] !== 1) continue;
      if (sf === "a_pagar_receber" && r[6] !== 0) continue;
      const cat = r[3] || "";
      if (!MKT_RE.test(cat)) continue;
      const mes = r[1] || "";
      if (!mes.startsWith(String(refYear))) continue;
      // Date filter
      if (dateFrom && mes + "-" + String(r[2]).padStart(2, "0") < dateFrom) continue;
      if (dateTo && mes + "-" + String(r[2]).padStart(2, "0") > dateTo) continue;
      const mIdx = parseInt(mes.slice(5, 7), 10) - 1;
      if (mIdx < 0 || mIdx > 11) continue;
      const val = r[5] || 0;
      const canal = classifyCanal(cat);

      byMonth[mIdx] += val;
      byCanal.set(canal, (byCanal.get(canal) || 0) + val);
    }

    return {
      byMonth,
      byCanal: [...byCanal.entries()].map(([canal, val]) => ({ canal, val })).sort((a, b) => b.val - a.val),
      total: byMonth.reduce((a, b) => a + b, 0),
    };
  }, [statusFilter, filters, refYear, dateFrom, dateTo]);

  // ---------- RD data filtered by date range (month-level) ----------
  const rdFiltered = useMemo(() => {
    const leads = ROI.porMesLeads.map((v, i) => (i >= mFrom && i <= mTo) ? v : 0);
    const wins = ROI.porMesWins.map((v, i) => (i >= mFrom && i <= mTo) ? v : 0);
    const amountWon = ROI.porMesAmountWon.map((v, i) => (i >= mFrom && i <= mTo) ? v : 0);
    return {
      porMesLeads: leads,
      porMesWins: wins,
      porMesAmountWon: amountWon,
      totalLeads: leads.reduce((a, b) => a + b, 0),
      totalWins: wins.reduce((a, b) => a + b, 0),
      totalAmountWon: amountWon.reduce((a, b) => a + b, 0),
    };
  }, [ROI, mFrom, mTo]);

  // ---------- Cross data (CPL/CPV por mês) ----------
  const T = { ...ROI.totais, totalLeads: rdFiltered.totalLeads, totalWins: rdFiltered.totalWins, totalAmountWon: rdFiltered.totalAmountWon, totalOpen: ROI.totais.totalOpen };
  const totalInvestido = mktData.total;
  const cpl = T.totalLeads > 0 ? totalInvestido / T.totalLeads : 0;
  const cpv = T.totalWins > 0 ? totalInvestido / T.totalWins : 0;
  const convRate = T.totalLeads > 0 ? (T.totalWins / T.totalLeads) * 100 : 0;

  const cplMes = rdFiltered.porMesLeads.map((l, i) => l > 0 ? mktData.byMonth[i] / l : 0);
  const cpvMes = rdFiltered.porMesWins.map((w, i) => w > 0 ? mktData.byMonth[i] / w : 0);

  // ---------- Canal table (cross E-gestor x RD) ----------
  const canalTable = useMemo(() => {
    const rdMap = new Map();
    for (const c of ROI.porCanal) rdMap.set(c.canal, c);

    const allCanals = new Set([...mktData.byCanal.map(c => c.canal), ...ROI.porCanal.map(c => c.canal)]);
    return [...allCanals].map(canal => {
      const rd = rdMap.get(canal) || { leads: 0, wins: 0, amountWon: 0 };
      const eg = mktData.byCanal.find(c => c.canal === canal);
      const investido = eg ? eg.val : 0;
      return {
        canal,
        investido,
        leads: rd.leads,
        wins: rd.wins,
        cpl: rd.leads > 0 ? investido / rd.leads : null,
        cpv: rd.wins > 0 ? investido / rd.wins : null,
        conv: rd.leads > 0 ? (rd.wins / rd.leads) * 100 : 0,
      };
    }).sort((a, b) => b.investido - a.investido || b.leads - a.leads);
  }, [mktData, ROI]);

  // ---------- Monthly summary table ----------
  const monthTable = useMemo(() => {
    return B.MONTHS ? B.MONTHS.map((m, i) => ({
      mes: m,
      investido: mktData.byMonth[i],
      leads: ROI.porMesLeads[i],
      wins: ROI.porMesWins[i],
      cpl: ROI.porMesLeads[i] > 0 ? mktData.byMonth[i] / ROI.porMesLeads[i] : 0,
      cpv: ROI.porMesWins[i] > 0 ? mktData.byMonth[i] / ROI.porMesWins[i] : 0,
      conv: ROI.porMesLeads[i] > 0 ? (ROI.porMesWins[i] / ROI.porMesLeads[i]) * 100 : 0,
    })) : [];
  }, [mktData, ROI, B]);

  // Active months (have either investment or leads)
  const activeMonths = monthTable.filter(m => m.investido > 0 || m.leads > 0);

  const fmtR = B.fmt || (n => "R$" + n.toFixed(2));
  const fmtRK = B.fmtK || (n => "R$" + Math.round(n));
  const fmtNum = (n) => n.toLocaleString("pt-BR");
  const fmtPct = (n) => n.toFixed(1).replace(".", ",") + "%";

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Custo por Lead</h1>
          <span className="status-line">E-gestor x RD Station | {refYear}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <KpiTile label="Investido Marketing" value={fmtRK(totalInvestido).replace("R$","")} sparkValues={mktData.byMonth} sparkColor="var(--amber)" />
        <KpiTile label="Leads Criados" value={fmtNum(T.totalLeads)} nonMonetary sparkValues={rdFiltered.porMesLeads} sparkColor="var(--cyan)" />
        <KpiTile label="Vendas Ganhas" value={fmtNum(T.totalWins)} nonMonetary sparkValues={rdFiltered.porMesWins} sparkColor="var(--green)" />
        <KpiTile label="Custo / Lead" value={fmtR(cpl).replace("R$","")} />
        <KpiTile label="Custo / Venda" value={fmtR(cpv).replace("R$","")} />
        <KpiTile label="Taxa de Conversão" value={fmtPct(convRate)} nonMonetary />
      </div>

      {/* Funil + CPL/CPV lado a lado */}
      <div className="row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <h2 className="card-title">Funil de Qualificação</h2>
          {ROI.funil ? (
            <FunnelChart funil={ROI.funil} perdidos={ROI.funilPerdidos} totalLeads={T.totalLeads} />
          ) : (
            <p style={{ color: "var(--mute)" }}>Dados do funil não disponíveis.</p>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ flex: 1 }}>
            <h2 className="card-title">CPL por Mês</h2>
            <RoiTrendChart values={cplMes} labels={B.MONTHS || []} color="var(--amber)" height={160} gradientId="roi-cpl" fmtVal={fmtR} />
          </div>
          <div className="card" style={{ flex: 1 }}>
            <h2 className="card-title">CPV por Mês</h2>
            <RoiTrendChart values={cpvMes} labels={B.MONTHS || []} color="var(--red)" height={160} gradientId="roi-cpv" fmtVal={fmtR} />
          </div>
        </div>
      </div>

      {/* Canal table */}
      <div className="card">
        <h2 className="card-title">ROI por Canal</h2>
        <div className="t-scroll">
          <table className="t" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Canal</th>
                <th>Investido</th>
                <th>Leads</th>
                <th>Vendas</th>
                <th>CPL</th>
                <th>CPV</th>
                <th>Conv%</th>
              </tr>
            </thead>
            <tbody>
              {canalTable.map(row => (
                <tr key={row.canal}>
                  <td style={{ textAlign: "left" }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: CANAL_COLORS[row.canal] || "#6b7686", marginRight: 8, verticalAlign: "middle" }} />
                    {row.canal}
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{row.investido > 0 ? fmtRK(row.investido) : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{row.leads.toLocaleString("pt-BR")}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{row.wins.toLocaleString("pt-BR")}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{row.cpl != null ? fmtR(row.cpl) : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}>{row.cpv != null ? fmtR(row.cpv) : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: row.conv > 10 ? "var(--green)" : row.conv > 2 ? "var(--amber)" : "var(--mute)" }}>
                    {row.conv.toFixed(1).replace(".", ",")}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar lists: Source e Campaign */}
      <div className="row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h2 className="card-title">Leads por Fonte (deal_source)</h2>
          <BarList items={ROI.porSource.map(s => ({ name: s.name, value: s.leads }))} color="var(--cyan)" fmt={v => v.toLocaleString("pt-BR")} />
        </div>
        <div className="card">
          <h2 className="card-title">Leads por Campanha</h2>
          <BarList items={ROI.porCampaign.slice(0, 15).map(s => ({ name: s.name, value: s.leads }))} color="var(--cyan)" fmt={v => v.toLocaleString("pt-BR")} />
        </div>
      </div>

      {/* Monthly summary table */}
      <div className="card">
        <h2 className="card-title">Resumo Mensal</h2>
        <div className="t-scroll">
          <table className="t" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Mês</th>
                <th>Investimento</th>
                <th>Leads</th>
                <th>Vendas</th>
                <th>CPL</th>
                <th>CPV</th>
                <th>Conv%</th>
              </tr>
            </thead>
            <tbody>
              {activeMonths.map(row => (
                <tr key={row.mes}>
                  <td style={{ textAlign: "left", textTransform: "capitalize" }}>{row.mes}</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{fmtRK(row.investido)}</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{row.leads.toLocaleString("pt-BR")}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{row.wins.toLocaleString("pt-BR")}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{row.leads > 0 ? fmtR(row.cpl) : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}>{row.wins > 0 ? fmtR(row.cpv) : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{row.conv.toFixed(1).replace(".", ",")}%</td>
                </tr>
              ))}
              {/* Total row */}
              {activeMonths.length > 0 && (
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td style={{ textAlign: "left" }}>Total</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{fmtRK(totalInvestido)}</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{T.totalLeads.toLocaleString("pt-BR")}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{T.totalWins.toLocaleString("pt-BR")}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{fmtR(cpl)}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}>{fmtR(cpv)}</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{convRate.toFixed(1).replace(".", ",")}%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageMarketingROI });
