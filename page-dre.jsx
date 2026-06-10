const { useState, useMemo } = React;

/* ======== DRE Economy Assessoria — replica exata do Power BI ======== */

const DRE_LINES = [
  { ordem: 1,  label: "(+) RECEBIMENTOS TOTAL DO MÊS DE PARCELAS",                   tipo: "Detalhe",  cor: "#00E676" },
  { ordem: 2,  label: "(-) TRANSFERÊNCIA PARA FUNDO DE CAIXA - GRUPO ECONOMY",        tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 3,  label: "(-) INVESTIMENTO EM ALIENAÇÕES - SICOOB - NIROCRED",           tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 4,  label: "(-) PAGAMENTO DE IMPOSTO DE VENDAS",                           tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 5,  label: "(-) PAGAMENTO DE RESCISÕES COM DEVOLUÇÃO DE VALORES",          tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 6,  label: "(=) RESULTANTE PARA RECEITA LÍQUIDA",                          tipo: "Subtotal", cor: "#2196F3" },
  { ordem: 7,  label: "(-) CUSTO DA CENTRAL NACIONAL PARA UNIDADE",                   tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 8,  label: "(-) CUSTO DO SERVIÇO DE COMPRA DAS DÍVIDAS",                   tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 9,  label: "(=) RESULTANTE PARA RECEITA BRUTA OPERACIONAIS DA UNIDADE",    tipo: "Subtotal", cor: "#2196F3" },
  { ordem: 10, label: "(-) DESPESAS OPERACIONAIS DA UNIDADE",                         tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 11, label: "(-) DESPESAS DE COLABORADORES DA UNIDADE",                     tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 12, label: "(-) DESPESAS DE PUBLICIDADES E PROPAGANDAS DA UNIDADE",        tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 13, label: "(-) DESPESAS DE TAXAS E TRIBUTOS DA UNIDADE",                  tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 14, label: "(-) DESPESAS BANCÁRIAS DA UNIDADE",                            tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 15, label: "(-) DESPESAS DE VISITAS A UNIDADE",                            tipo: "Detalhe",  cor: "#FF1744" },
  { ordem: 16, label: "(=) RESULTADO DO MÊS (LUCRO/PREJUÍZO)",                        tipo: "Subtotal", cor: "#2196F3" },
  { ordem: 17, label: "(+/-) OUTRAS RECEITAS / DESPESAS FINANCEIRAS",                 tipo: "Detalhe",  cor: "#FF9800" },
  { ordem: 18, label: "(=) RESULTADO FINAL DO MÊS",                                   tipo: "Subtotal", cor: "#2196F3" },
  { ordem: 19, label: "(-) Antigos até Dezembro 2022",                                tipo: "Detalhe",  cor: "#9E9E9E" },
];

// ---- Mapeamento categoria → DRE Grupo (replica coluna DRE Grupo do PBI) ----
// Validado centavo a centavo contra screenshot PBI Jan-Mai/2026.
function _dreGrp(cat, kind) {
  if (!cat) return 10;
  var c = cat;

  // ---- Receitas ----
  if (kind === "r") {
    if (/empr[eé]stimo/i.test(c)) return 17;
    if (/receitas?\s+diversas/i.test(c)) return 17;
    if (/aplic/i.test(c)) return 17;
    if (/rendimento/i.test(c)) return 17;
    if (/entrada.*pessoal/i.test(c)) return 11;
    return 1;
  }

  // ---- Despesas ----
  // Grp 2 — Fundo de caixa + empréstimo ao fundo
  if (/fundo\s+de\s+caixa.*economy/i.test(c)) return 2;
  if (/empr[eé]stimo\s+ao\s+fundo/i.test(c)) return 2;
  // Grp 3 — Alienações Sicoob
  if (/aliena/i.test(c)) return 3;
  // Grp 4 — Somente Simples Nacional (notas fiscais)
  if (/simples\s+nacional/i.test(c)) return 4;
  // Grp 5 — Rescisões (contratual + condenações)
  if (/resc.*contratual.*devolu/i.test(c)) return 5;
  if (/resc.*condena/i.test(c)) return 5;
  // Grp 7 — Central operacional
  if (/ressarcimento.*central|ressarcimento.*custos/i.test(c)) return 7;
  // Grp 8 — Compra de dívidas (todas)
  if (/compra\s+de\s+d[ií]vidas/i.test(c)) return 8;
  // Grp 11 — Colaboradores
  if (/sal[aá]rio/i.test(c)) return 11;
  if (/f[eé]rias/i.test(c)) return 11;
  if (/rescis.*funcion/i.test(c)) return 11;
  if (/vale\s+(aliment|transport)/i.test(c)) return 11;
  if (/13[º°]|13\s*sal/i.test(c)) return 11;
  if (/est[aá]gio|bolsa/i.test(c)) return 11;
  if (/adiantamento\s+salarial/i.test(c)) return 11;
  if (/desconto.*folha/i.test(c)) return 11;
  if (/ajuda.*combust/i.test(c)) return 11;
  if (/taxa.*exame/i.test(c)) return 11;
  // Grp 12 — Publicidade e propaganda
  if (/an[uú]ncio/i.test(c)) return 12;
  if (/tr[aá]fego/i.test(c)) return 12;
  if (/propaganda/i.test(c)) return 12;
  if (/cach[eê]/i.test(c)) return 12;
  if (/publicidade|marketing/i.test(c)) return 12;
  if (/campanha/i.test(c)) return 12;
  if (/materi.*gr[aá]fico/i.test(c)) return 12;
  // Grp 13 — Taxas e tributos
  if (/^simples$/i.test(c.trim())) return 13;
  if (/^fgts$/i.test(c.trim())) return 13;
  if (/^inss$/i.test(c.trim())) return 13;
  if (/^irpf$/i.test(c.trim())) return 13;
  if (/^irrf$/i.test(c.trim())) return 13;
  if (/^darf$/i.test(c.trim())) return 13;
  if (/^iptu$/i.test(c.trim())) return 13;
  if (/taxa.*junta|junta.*comercial/i.test(c)) return 13;
  // Grp 14 — Bancárias
  if (/tarifa/i.test(c)) return 14;
  // Grp 15 — Visitas
  if (/viagem/i.test(c)) return 15;
  // Grp 17 — Empréstimos (exceto ao fundo, que é grp 2)
  if (/empr[eé]stimo/i.test(c)) return 17;
  // Grp 10 — Catch-all operacional
  return 10;
}

const PageDRE = ({ filters, setFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const [expanded, setExpanded] = useState({});
  const refYear = year || window.REF_YEAR || new Date().getFullYear();
  const B = window.BIT || {};
  const fmt = B.fmt || function (n) { return "R$" + n.toFixed(2); };
  const ML = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  // ---- Computar DRE a partir de ALL_TX — sempre caixa realizado ----
  const dre = useMemo(function () {
    var allTx = window.ALL_TX || [];
    var rg = (filters && filters.regime === "competencia") ? "k" : "c";
    var txs = window.filterTx
      ? window.filterTx(allTx, "realizado", null, rg, filters)
      : allTx.filter(function (r) { return r[9] === rg && r[6] === 1; });
    txs = txs.filter(function (r) { return r[1] && r[1].startsWith(String(refYear)); });

    var grpM = {}, grpC = {};
    for (var i = 0; i < txs.length; i++) {
      var row = txs[i];
      var kind = row[0], mes = row[1], cat = row[3] || "", valor = row[5];
      var mi = parseInt(mes.slice(5, 7), 10) - 1;
      if (mi < 0 || mi > 11) continue;
      var signed = kind === "r" ? valor : -valor;
      var g = _dreGrp(cat, kind);
      if (!grpM[g]) grpM[g] = new Float64Array(12);
      grpM[g][mi] += signed;
      if (!grpC[g]) grpC[g] = {};
      if (!grpC[g][cat]) grpC[g][cat] = new Float64Array(12);
      grpC[g][cat][mi] += signed;
    }

    var G = function (n) { return grpM[n] || new Float64Array(12); };
    var add = function () {
      var r = new Float64Array(12);
      for (var a = 0; a < arguments.length; a++) {
        var arr = arguments[a];
        for (var j = 0; j < 12; j++) r[j] += arr[j];
      }
      return r;
    };

    var recLiq = add(G(1), G(2), G(3), G(4), G(5));
    var recBruta = add(recLiq, G(7), G(8));
    var resMes = add(recBruta, G(10), G(11), G(12), G(13), G(14), G(15));
    var resFinal = add(resMes, G(17));

    var lv = {};
    lv[1] = G(1); lv[2] = G(2); lv[3] = G(3); lv[4] = G(4); lv[5] = G(5);
    lv[6] = recLiq;
    lv[7] = G(7); lv[8] = G(8);
    lv[9] = recBruta;
    lv[10] = G(10); lv[11] = G(11); lv[12] = G(12); lv[13] = G(13); lv[14] = G(14); lv[15] = G(15);
    lv[16] = resMes;
    lv[17] = G(17);
    lv[18] = resFinal;
    lv[19] = G(19);

    return { lv: lv, grpC: grpC };
  }, [refYear, filters]);

  // Meses com dados
  var mwd = useMemo(function () {
    var ms = [];
    for (var mi = 0; mi < 12; mi++) {
      for (var k = 0; k < DRE_LINES.length; k++) {
        var v = dre.lv[DRE_LINES[k].ordem];
        if (v && Math.abs(v[mi]) > 0.005) { ms.push(mi); break; }
      }
    }
    return ms.length ? ms : [0, 1, 2, 3, 4];
  }, [dre]);

  var sum12 = function (a) { var s = 0; for (var i = 0; i < 12; i++) s += a[i]; return s; };
  var grp1Total = sum12(dre.lv[1] || new Float64Array(12));
  var grp1M = dre.lv[1] || new Float64Array(12);

  var pctAv = function (v, base) {
    if (!base || Math.abs(base) < 0.01) return "—";
    return ((v / base) * 100).toFixed(2).replace(".", ",") + "%";
  };
  var vc = function (v) { return v > 0.01 ? "#00E676" : v < -0.01 ? "#FF1744" : "var(--fg-3)"; };
  var toggle = function (k) { setExpanded(function (s) { var n = {}; for (var x in s) n[x] = s[x]; n[k] = !s[k]; return n; }); };

  var stk = { position: "sticky", left: 0, background: "var(--surface)", zIndex: 2 };
  var stkTh = { position: "sticky", left: 0, background: "var(--surface)", zIndex: 3 };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>DRE</h1>
          <div className="status-line">Demonstração do Resultado · {refYear} · Caixa Realizado</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <div className="card" style={{ overflow: "auto" }}>
        <table className="t" style={{ fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...stkTh, minWidth: 420, textAlign: "left", padding: "10px 12px" }}>Linha DRE</th>
              {mwd.map(function (mi) {
                return (
                  <React.Fragment key={mi}>
                    <th className="num" style={{ minWidth: 115, padding: "10px 8px" }}>{ML[mi]}/{refYear}</th>
                    <th className="num" style={{ minWidth: 58, padding: "10px 4px", fontSize: 10 }}>AV%</th>
                  </React.Fragment>
                );
              })}
              <th className="num" style={{ minWidth: 125, padding: "10px 8px", fontWeight: 700 }}>Total</th>
              <th className="num" style={{ minWidth: 58, padding: "10px 4px", fontSize: 10 }}>AV%</th>
            </tr>
          </thead>
          <tbody>
            {DRE_LINES.map(function (line) {
              var vals = dre.lv[line.ordem] || new Float64Array(12);
              var total = sum12(vals);
              var isSub = line.tipo === "Subtotal";
              var isExp = !!expanded[line.ordem];
              var hasCats = line.tipo === "Detalhe" && dre.grpC[line.ordem];
              var cats = hasCats
                ? Object.entries(dre.grpC[line.ordem])
                    .map(function (e) { return { name: e[0], vals: e[1], total: sum12(e[1]) }; })
                    .filter(function (c) { return Math.abs(c.total) > 0.005; })
                    .sort(function (a, b) { return Math.abs(b.total) - Math.abs(a.total); })
                : [];

              var rowBg = isSub ? "rgba(33,150,243,0.10)" : "transparent";
              var cellStk = Object.assign({}, stk, isSub ? { background: "rgba(33,150,243,0.10)" } : {});

              return (
                <React.Fragment key={line.ordem}>
                  <tr
                    style={{ background: rowBg, cursor: cats.length > 0 ? "pointer" : "default", borderBottom: isSub ? "2px solid rgba(33,150,243,0.25)" : undefined }}
                    onClick={cats.length > 0 ? function () { toggle(line.ordem); } : undefined}
                  >
                    <td style={{ ...cellStk, padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {cats.length > 0 && (
                        <span style={{ display: "inline-block", width: 16, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)" }}>{isExp ? "▼" : "▶"}</span>
                      )}
                      {cats.length === 0 && <span style={{ display: "inline-block", width: 16 }} />}
                      <span style={{ color: line.cor, fontWeight: isSub ? 700 : 600, fontSize: isSub ? 13 : 12 }}>{line.label}</span>
                    </td>
                    {mwd.map(function (mi) {
                      return (
                        <React.Fragment key={mi}>
                          <td className="num" style={{ fontWeight: isSub ? 700 : 400, color: vc(vals[mi]), padding: "8px 8px" }}>{fmt(vals[mi])}</td>
                          <td className="num" style={{ fontSize: 10, color: "var(--fg-3)", padding: "8px 4px" }}>{pctAv(vals[mi], grp1M[mi])}</td>
                        </React.Fragment>
                      );
                    })}
                    <td className="num" style={{ fontWeight: isSub ? 700 : 600, color: vc(total), padding: "8px 8px" }}>{fmt(total)}</td>
                    <td className="num" style={{ fontSize: 10, color: "var(--fg-3)", padding: "8px 4px" }}>{pctAv(total, grp1Total)}</td>
                  </tr>

                  {isExp && cats.map(function (cat) {
                    return (
                      <tr key={cat.name} style={{ background: "rgba(255,255,255,0.02)" }}>
                        <td style={{ ...stk, paddingLeft: 44, fontSize: 11, color: "var(--fg-2)", padding: "5px 12px 5px 44px" }}>
                          {cat.name || "Sem categoria"}
                        </td>
                        {mwd.map(function (mi) {
                          var v = cat.vals[mi];
                          return (
                            <React.Fragment key={mi}>
                              <td className="num" style={{ fontSize: 11, color: Math.abs(v) > 0.005 ? vc(v) : "var(--fg-3)", padding: "5px 8px" }}>
                                {Math.abs(v) > 0.005 ? fmt(v) : "—"}
                              </td>
                              <td className="num" style={{ fontSize: 9, color: "var(--fg-3)", padding: "5px 4px" }}>
                                {Math.abs(v) > 0.005 ? pctAv(v, grp1M[mi]) : ""}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="num" style={{ fontSize: 11, color: vc(cat.total), padding: "5px 8px" }}>{fmt(cat.total)}</td>
                        <td className="num" style={{ fontSize: 9, color: "var(--fg-3)", padding: "5px 4px" }}>{pctAv(cat.total, grp1Total)}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

window.PageDRE = PageDRE;
