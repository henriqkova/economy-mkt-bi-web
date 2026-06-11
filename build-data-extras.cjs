#!/usr/bin/env node
/**
 * build-data-extras.cjs — agrega Vendas + Cancelamentos da Economy Assessoria
 * em data-extras.js (window.BIT_EXTRAS).
 *
 * Fontes:
 *  - Vendas: arquivos individuais por filial (2 formatos distintos)
 *  - Cancelamentos: consolidado
 *  - Dimensao Vendedores: resolve codVendedor -> nome + comissao
 *
 * Saida:
 *  - data/extras.json
 *  - data-extras.js  (inline pro browser)
 */
'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
let cfg;
try { cfg = require('./bi.config.js'); }
catch (e) { console.error('ERRO: bi.config.js nao encontrado.'); process.exit(1); }

const FONTES    = cfg.fontes || {};
const ECO       = FONTES.economy_xlsx || {};
const DRIVE     = (FONTES.drive && FONTES.drive.base_path) || '';
const DATA_DIR  = path.join(__dirname, 'data');
const OUT_JSON  = path.join(DATA_DIR, 'extras.json');
const OUT_JS    = path.join(__dirname, 'data-extras.js');

const VENDAS_PATH       = ECO.vendas_path || '';
const VENDAS_FILES      = ECO.vendas_files || [];
const VENDEDORES_FILE   = ECO.vendedores_file || '';
const CANCELAMENTOS_FILE = ECO.cancelamentos_file || '';

const ANO_REF = (cfg.meta && cfg.meta.ano_corrente) || new Date().getFullYear();

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MESES = ['janeiro','fevereiro','marco','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** Excel serial date -> Date object */
function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || serial < 1000) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms);
}

/** Converte qualquer formato de data para "YYYY-MM-DD" ou null */
function isoDate(v) {
  if (v == null || v === '') return null;
  // Already ISO string "YYYY-MM-DD"
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    // Try DD/MM/YYYY
    const m2 = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
    return null;
  }
  // Excel serial number
  if (typeof v === 'number') {
    const d = excelSerialToDate(v);
    if (!d) return null;
    return d.toISOString().slice(0, 10);
  }
  // Date object
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return null;
}

function yearFromIso(iso) {
  if (!iso) return null;
  return parseInt(iso.slice(0, 4), 10) || null;
}
function monthFromIso(iso) {
  if (!iso) return null;
  return parseInt(iso.slice(5, 7), 10) - 1; // 0-indexed
}

function readSheet(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const sn = sheetName || wb.SheetNames[0];
  if (!wb.Sheets[sn]) {
    console.warn(`  [warn] sheet "${sn}" nao encontrada em ${path.basename(filePath)}, usando primeira sheet`);
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  }
  return XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' });
}

function cleanStr(s) { return s == null ? '' : String(s).trim(); }

// ---------------------------------------------------------------------------
// 1. Load Vendedores dimension
// ---------------------------------------------------------------------------
console.log('=== Dimensao Vendedores ===');
const vendedoresMap = new Map(); // codVendedor (number) -> { nome, comProduto, comServico, comFinanc }
const vendedoresByName = new Map(); // nome lowercase -> same object

if (VENDEDORES_FILE && VENDAS_PATH) {
  try {
    const vPath = path.join(VENDAS_PATH, VENDEDORES_FILE);
    if (fs.existsSync(vPath)) {
      const rows = readSheet(vPath, 'Vendedores');
      for (const r of rows) {
        const cod = num(r['Cod Vendedor']);
        const nome = cleanStr(r['Nome Vendedor']);
        if (!nome) continue;
        const obj = {
          empresa: cleanStr(r['Empresa']),
          nome,
          comProduto: num(r['Comissao Produto (%)']) || 0,
          comServico: num(r['Comissao Servico (%)']) || 0,
          comFinanc:  num(r['Comissao Financeiro (%)']) || 0,
        };
        if (cod) vendedoresMap.set(cod, obj);
        vendedoresByName.set(nome.toLowerCase(), obj);
      }
      console.log(`  ${vendedoresMap.size} vendedores por codigo, ${vendedoresByName.size} por nome`);
    } else {
      console.warn(`  [warn] arquivo vendedores nao encontrado: ${vPath}`);
    }
  } catch (e) {
    console.error('  erro ao ler vendedores:', e.message);
  }
}

const DEFAULT_COMISSAO_PCT = 5;

function resolveVendedor(codVendedor, nomeVendedor) {
  // Try by code first
  if (codVendedor) {
    const cod = typeof codVendedor === 'number' ? codVendedor : num(codVendedor);
    if (cod && vendedoresMap.has(cod)) return vendedoresMap.get(cod);
  }
  // Try by name
  if (nomeVendedor) {
    const key = cleanStr(nomeVendedor).toLowerCase();
    if (vendedoresByName.has(key)) return vendedoresByName.get(key);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. Process Vendas
// ---------------------------------------------------------------------------
console.log('\n=== Vendas ===');
const allVendas = []; // raw parsed rows before dedup
const dedupSet = new Set(); // "empresa|codigo"

for (const fileName of VENDAS_FILES) {
  const filePath = path.join(VENDAS_PATH, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`  [warn] arquivo nao encontrado: ${fileName}`);
    continue;
  }

  const isFormatoBrasilia = fileName.includes('Vendas - 2025_a_2026');
  let rows;
  try {
    rows = readSheet(filePath, 'Vendas');
  } catch (e) {
    console.error(`  erro ao ler ${fileName}:`, e.message);
    continue;
  }

  console.log(`  ${fileName}: ${rows.length} rows (formato ${isFormatoBrasilia ? 'Brasilia' : 'padrao'})`);

  for (const r of rows) {
    let empresa, cliente, vendedorNome, data, valorTotal, valorFinanc, codigo, tags, comissaoPct;

    if (isFormatoBrasilia) {
      // Format: Empresa, codigo, codContato, nomeContato, codVendedor, dtVenda, valorTotal, valorFinanc, situacao, tags, ativo
      empresa      = cleanStr(r['Empresa']);
      cliente      = cleanStr(r['nomeContato']);
      const codVend = num(r['codVendedor']);
      const vInfo  = resolveVendedor(codVend, null);
      vendedorNome = vInfo ? vInfo.nome : `Vendedor ${codVend || '?'}`;
      comissaoPct  = vInfo ? vInfo.comFinanc : DEFAULT_COMISSAO_PCT;
      data         = isoDate(r['dtVenda']);
      valorTotal   = num(r['valorTotal']);
      valorFinanc  = num(r['valorFinanc']);
      codigo       = cleanStr(r['codigo']);
      tags         = cleanStr(r['tags']);
    } else {
      // Format: Empresa, Nome do Cliente, Código da Venda, Vendedor, Data, Tipo de Venda, Valor Total, Situação
      empresa      = cleanStr(r['Empresa']);
      cliente      = cleanStr(r['Nome do Cliente']);
      vendedorNome = cleanStr(r['Vendedor']);
      const vInfo  = resolveVendedor(null, vendedorNome);
      comissaoPct  = vInfo ? vInfo.comFinanc : DEFAULT_COMISSAO_PCT;
      data         = isoDate(r['Data']);
      valorTotal   = num(r['Valor Total']);
      valorFinanc  = 0; // not available in this format
      codigo       = cleanStr(r['Código da Venda']);
      tags         = '';
    }

    if (!empresa && !cliente) continue;

    // Dedup by empresa + codigo
    if (codigo) {
      const dedupKey = `${empresa}|${codigo}`;
      if (dedupSet.has(dedupKey)) continue;
      dedupSet.add(dedupKey);
    }

    const comissao = valorTotal * (comissaoPct / 100);

    allVendas.push({
      empresa,
      cliente,
      vendedor: vendedorNome,
      data,
      valorTotal,
      valorFinanc,
      codigo,
      tags,
      comissao,
    });
  }
}

// Filter to anoRef — vendas sem data são incluídas (planilhas Nirocred/Boleto Amigo não têm data)
const vendasAno = allVendas.filter(v => !v.data || yearFromIso(v.data) === ANO_REF);
console.log(`  total parsed: ${allVendas.length} | dedup remaining: ${allVendas.length} | ano ${ANO_REF}: ${vendasAno.length}`);

// Aggregations - vendas
function aggByKey(items, keyFn, valFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it) || 'Sem categoria';
    m.set(k, (m.get(k) || 0) + valFn(it));
  }
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

const porVendedorValor = aggByKey(vendasAno, v => v.vendedor, v => v.valorTotal).slice(0, 20);
const porVendedorQtd   = aggByKey(vendasAno, v => v.vendedor, () => 1).slice(0, 20);
const porUnidadeVendas  = aggByKey(vendasAno, v => v.empresa, () => 1).slice(0, 20);

const comissaoPorVendedor = aggByKey(vendasAno, v => v.vendedor, v => v.comissao).slice(0, 20);

// Por mes (12 meses)
const porMesValorV = MESES.map((m, i) => ({ m, value: 0 }));
const porMesQtdV   = MESES.map((m, i) => ({ m, value: 0 }));
const comissaoPorMes = MESES.map((m, i) => ({ m, value: 0 }));

for (const v of vendasAno) {
  const mi = monthFromIso(v.data);
  if (mi == null || mi < 0 || mi > 11) continue;
  porMesValorV[mi].value += v.valorTotal;
  porMesQtdV[mi].value += 1;
  comissaoPorMes[mi].value += v.comissao;
}

const totalVendas    = vendasAno.reduce((s, v) => s + v.valorTotal, 0);
const comissaoTotal  = vendasAno.reduce((s, v) => s + v.comissao, 0);
const numVendas      = vendasAno.length;
const mediaValor     = numVendas > 0 ? totalVendas / numVendas : 0;

console.log(`  ${ANO_REF}: R$ ${totalVendas.toFixed(2)} | ${numVendas} vendas | comissao: R$ ${comissaoTotal.toFixed(2)}`);

// ---------------------------------------------------------------------------
// 3. Process Cancelamentos
// ---------------------------------------------------------------------------
console.log('\n=== Cancelamentos ===');
let allCancelamentos = [];

if (CANCELAMENTOS_FILE && fs.existsSync(CANCELAMENTOS_FILE)) {
  try {
    const rows = readSheet(CANCELAMENTOS_FILE, 'Cancelamentos');
    console.log(`  ${path.basename(CANCELAMENTOS_FILE)}: ${rows.length} rows`);

    for (const r of rows) {
      const empresa          = cleanStr(r['Empresa']);
      const cliente          = cleanStr(r['Cliente']);
      const vendedor         = cleanStr(r['Vendedor']);
      const dataVenda        = isoDate(r['Data da Venda']);
      const dataCancelamento = isoDate(r['Data Cancelamento']);
      const tipo             = cleanStr(r['Tipo de Cancelamento']);
      const valorTotal       = num(r['Valor Total (R$)']);
      const situacao         = cleanStr(r['Situação']);
      const codigo           = cleanStr(r['Código da Venda']);

      if (!empresa && !cliente) continue;

      allCancelamentos.push({
        empresa,
        cliente,
        vendedor,
        dataVenda,
        dataCancelamento,
        tipo,
        valorTotal,
        situacao,
        codigo,
      });
    }
  } catch (e) {
    console.error('  erro ao ler cancelamentos:', e.message);
  }
} else {
  console.warn(`  [warn] arquivo cancelamentos nao encontrado: ${CANCELAMENTOS_FILE}`);
}

// Filter to anoRef based on dataCancelamento
const cancelAno = allCancelamentos.filter(c => !c.dataCancelamento || yearFromIso(c.dataCancelamento) === ANO_REF);
console.log(`  total: ${allCancelamentos.length} | ano ${ANO_REF}: ${cancelAno.length}`);

// Aggregations - cancelamentos
const valorCancelado    = cancelAno.reduce((s, c) => s + c.valorTotal, 0);
const qtdCancelamentos  = cancelAno.length;

const porSituacao  = aggByKey(cancelAno, c => c.tipo, c => c.valorTotal);
const porTipo      = aggByKey(cancelAno, c => c.tipo, () => 1);
const porUnidadeC  = aggByKey(cancelAno, c => c.empresa, () => 1);

const porMesValorC = MESES.map((m) => ({ m, value: 0 }));
const porMesQtdC   = MESES.map((m) => ({ m, value: 0 }));

for (const c of cancelAno) {
  const mi = monthFromIso(c.dataCancelamento);
  if (mi == null || mi < 0 || mi > 11) continue;
  porMesValorC[mi].value += c.valorTotal;
  porMesQtdC[mi].value += 1;
}

// Extrato: last 200 rows sorted by dataCancelamento desc
const extrato = [...cancelAno]
  .sort((a, b) => (b.dataCancelamento || '').localeCompare(a.dataCancelamento || ''))
  .slice(0, 200)
  .map(c => ({
    dataCancelamento: c.dataCancelamento,
    cliente: c.cliente,
    tipo: c.tipo,
    empresa: c.empresa,
    valorTotal: c.valorTotal,
  }));

console.log(`  ${ANO_REF}: R$ ${valorCancelado.toFixed(2)} cancelado | ${qtdCancelamentos} cancelamentos`);

// ---------------------------------------------------------------------------
// 3b. RD Station — leads/deals para ROI de marketing
// ---------------------------------------------------------------------------
console.log('\n=== RD Station (Custo por Lead) ===');

const RD_FILE = ECO.rd_station_file || '';
let roiData = null;

if (RD_FILE && fs.existsSync(RD_FILE)) {
  const rdRows = readSheet(RD_FILE);
  console.log(`  ${path.basename(RD_FILE)}: ${rdRows.length} rows`);

  // Mapeamento deal_source -> canal
  const RD_CANAL_MAP = [
    { canal: 'TV',        re: /^0002|televis/i },
    { canal: 'Rádio',     re: /^0009|radio/i },
    { canal: 'Meta',      re: /facebook|insta|^0034/i },
    { canal: 'Google',    re: /google|^0035/i },
    { canal: 'Formulário', re: /^0031|formulario/i },
    { canal: 'Redes Sociais', re: /^0003.*redes/i },
    { canal: 'Indicação', re: /^0001.*indica|^0005.*captação|^0028.*pré/i },
    { canal: 'Renovação', re: /^0008.*renova/i },
  ];
  function rdCanal(source) {
    if (!source) return 'Outros';
    for (const m of RD_CANAL_MAP) { if (m.re.test(source)) return m.canal; }
    return 'Outros';
  }

  // Mapeamento campanha -> região (por UF no nome da campanha)
  const CAMP_UF_REGIAO = {
    'CE': 'Ceará', 'DF': 'Brasília', 'PR': 'Paraná',
    'MA': 'Maranhão', 'GO': 'Goiás', 'BA': 'Bahia',
    'PA': 'Pará', 'SP': 'São Paulo', 'RJ': 'Rio de Janeiro',
    'MG': 'Minas Gerais', 'NACIONAL': 'Nacional',
  };
  function rdRegiao(campaign) {
    if (!campaign) return 'Sem Região';
    const m = campaign.match(/[\s\-]+(?:(CE|DF|PR|MA|GO|BA|PA|SP|RJ|MG|NACIONAL))\b/i);
    if (m) return CAMP_UF_REGIAO[m[1].toUpperCase()] || 'Sem Região';
    return 'Sem Região';
  }

  // Parse ISO timestamp -> "YYYY-MM-DD"
  function parseRdDate(v) {
    if (!v) return null;
    const s = String(v);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }

  // Funil de qualificação — etapas ordenadas do topo ao fundo.
  // Cada deal_stage do RD é mapeado para uma etapa do funil.
  const FUNIL_ETAPAS = [
    { id: 'novo_cliente',   label: '1. Novo Cliente',
      re: /^(?:novo|lead nova|novo cliente|\(novo cliente\)|\(novo cliente\) sem contato|formulários|indicadores|reativações|indicação)$/i },
    { id: 'interesse',      label: '2. Identificação do Interesse',
      re: /^(?:\(indicação\) identificação do interesse|interesse|interesse \d|interesse no fechamento|sem contato|sem contato \d|sem contato \d\/\d|envio de proposta|simulação|simulação \d|simulação apresentada)$/i },
    { id: 'visita',         label: '3. Visita Confirmada',
      re: /^(?:\(agenda\) visita confirmada|visita agendada|agendamento concluido)$/i },
    { id: 'reagendamento',  label: '4. Reagendamento',
      re: /^(?:\(reagendamento\) verificar nova data|reagendamento)$/i },
    { id: 'fechamento',     label: '5. Fechamento',
      re: /^(?:\(verificar\) fechamento após visita|verificar fechamento|confirmação de contrato agendada)$/i },
    { id: 'assinatura',     label: '6. Aguardando Assinatura',
      re: /^(?:\(digital\) aguardando assinatura digital|aguardando assinatura digital|aguardando assinatura|aguardando pagamento)$/i },
    { id: 'pre_venda',      label: '7. Pré-Venda',
      re: /^(?:\(agendado\) pré-venda|pré-venda ativa|empréstimo realizado)$/i },
  ];
  const FUNIL_PERDIDO = { id: 'perdido', label: 'Perdido', re: /^(?:perdidas|perdidos|reverter perdas)$/i };

  function classifyFunil(stage) {
    if (!stage) return 'novo_cliente';
    for (const e of FUNIL_ETAPAS) { if (e.re.test(stage)) return e.id; }
    if (FUNIL_PERDIDO.re.test(stage)) return 'perdido';
    return 'novo_cliente'; // default
  }

  // Funil counters
  const funilCounts = {};
  for (const e of FUNIL_ETAPAS) funilCounts[e.id] = 0;
  funilCounts['perdido'] = 0;
  // Funil by stage of exit (perdidos em cada etapa)
  const funilStageRaw = new Map(); // raw deal_stage -> count

  // Process deals
  const porMesLeads = new Array(12).fill(0);
  const porMesWins = new Array(12).fill(0);
  const porMesAmountWon = new Array(12).fill(0);
  const canalMap = new Map();   // canal -> { leads, wins, amountWon }
  const sourceMap = new Map();  // deal_source -> { leads, wins }
  const campMap = new Map();    // campaign -> { leads, wins }
  const regiaoMap = new Map(); // regiao -> { leads, wins, amountWon }
  const monthCanalMap = new Map(); // "YYYY-MM|canal" -> { leads, wins, amountWon }

  let totalLeads = 0, totalWins = 0, totalLost = 0, totalOpen = 0, totalAmountWon = 0;

  for (const r of rdRows) {
    const createdAt = parseRdDate(r['deals.created_at']);
    const closedAt = parseRdDate(r['deals.closed_at']);
    const win = r['deals.win'] === true || r['deals.win'] === 'true';
    const lost = r['deals.win'] === false || r['deals.win'] === 'false';
    const amount = num(r['deals.amount_total']);
    const source = cleanStr(r['deals.deal_source']);
    const campaign = cleanStr(r['deals.campaign']);
    const canal = rdCanal(source);

    // Filtrar por ano de criação
    const createdYear = createdAt ? parseInt(createdAt.slice(0, 4), 10) : null;
    if (createdYear !== ANO_REF) continue;

    const createdMonth = createdAt ? parseInt(createdAt.slice(5, 7), 10) - 1 : -1;
    const closedMonth = closedAt ? parseInt(closedAt.slice(5, 7), 10) - 1 : -1;
    const closedYear = closedAt ? parseInt(closedAt.slice(0, 4), 10) : null;

    totalLeads++;
    if (win) totalWins++;
    else if (lost) totalLost++;
    else totalOpen++;

    // Funil
    const stage = cleanStr(r['deals.deal_stage']);
    const funilId = classifyFunil(stage);
    funilCounts[funilId] = (funilCounts[funilId] || 0) + 1;
    if (!funilStageRaw.has(stage)) funilStageRaw.set(stage, 0);
    funilStageRaw.set(stage, funilStageRaw.get(stage) + 1);

    // Leads por mês de criação
    if (createdMonth >= 0 && createdMonth < 12) porMesLeads[createdMonth]++;

    // Wins por mês de fechamento
    if (win && closedYear === ANO_REF && closedMonth >= 0 && closedMonth < 12) {
      porMesWins[closedMonth]++;
      porMesAmountWon[closedMonth] += amount;
      totalAmountWon += amount;
    }

    // Por canal
    if (!canalMap.has(canal)) canalMap.set(canal, { canal, leads: 0, wins: 0, amountWon: 0 });
    const cc = canalMap.get(canal);
    cc.leads++;
    if (win) { cc.wins++; cc.amountWon += amount; }

    // Month x Canal
    if (createdMonth >= 0) {
      const mesKey = `${ANO_REF}-${String(createdMonth + 1).padStart(2, '0')}`;
      const mcKey = mesKey + '|' + canal;
      if (!monthCanalMap.has(mcKey)) monthCanalMap.set(mcKey, { mes: mesKey, canal, leads: 0, wins: 0, amountWon: 0 });
      const mc = monthCanalMap.get(mcKey);
      mc.leads++;
      if (win) { mc.wins++; mc.amountWon += amount; }
    }

    // Por source original
    if (source) {
      if (!sourceMap.has(source)) sourceMap.set(source, { name: source, leads: 0, wins: 0 });
      const s = sourceMap.get(source);
      s.leads++;
      if (win) s.wins++;
    }

    // Por campaign
    if (campaign) {
      if (!campMap.has(campaign)) campMap.set(campaign, { name: campaign, leads: 0, wins: 0 });
      const cp = campMap.get(campaign);
      cp.leads++;
      if (win) cp.wins++;
    }

    // Por região
    const regiao = rdRegiao(campaign);
    if (!regiaoMap.has(regiao)) regiaoMap.set(regiao, { regiao, leads: 0, wins: 0, amountWon: 0 });
    const rg2 = regiaoMap.get(regiao);
    rg2.leads++;
    if (win) { rg2.wins++; rg2.amountWon += amount; }
  }

  // Build funil: etapas acumulativas (quantos chegaram em cada etapa)
  // A lógica: o deal_stage atual mostra ONDE o lead ESTÁ agora.
  // Para o funil acumulativo, calculamos quantos passaram por cada etapa.
  // Etapa 1 (Novo Cliente) = todos os leads
  // Etapa 2 (Interesse) = todos que avançaram além de etapa 1
  // etc.
  const FUNIL_ORDER = ['novo_cliente', 'interesse', 'visita', 'reagendamento', 'fechamento', 'assinatura', 'pre_venda'];
  const funilIdx = {};
  FUNIL_ORDER.forEach((id, i) => { funilIdx[id] = i; });
  funilIdx['perdido'] = -1; // perdidos contam como saída

  // Para cada lead, determinar até qual etapa ele chegou (seu stage atual é o ponto mais avançado)
  const funilAcum = new Array(7).fill(0);
  // Re-process: contar quantos leads têm stage >= cada etapa
  // Um lead no stage "fechamento" (idx=4) passou pelas etapas 0,1,2,3,4
  // Perdidos: contamos no funil até etapa 1 (entraram mas saíram)
  for (const [stageId, count] of Object.entries(funilCounts)) {
    const idx = funilIdx[stageId];
    if (idx == null || idx < 0) {
      // Perdidos: contam como tendo entrado no funil (etapa 0)
      funilAcum[0] += count;
      continue;
    }
    // Acumular em todas as etapas até a atual
    for (let i = 0; i <= idx; i++) funilAcum[i] += count;
  }

  const funilData = FUNIL_ETAPAS.map((e, i) => ({
    id: e.id,
    label: e.label,
    total: funilAcum[i],
    atual: funilCounts[e.id] || 0,
  }));
  // Etapa 8: Venda (deals.win === true)
  funilData.push({
    id: 'venda',
    label: '8. Venda',
    total: totalWins,
    atual: totalWins,
  });

  roiData = {
    totais: { totalLeads, totalWins, totalLost, totalOpen, totalAmountWon, anoRef: ANO_REF },
    porMesLeads,
    porMesWins,
    porMesAmountWon,
    porCanal: [...canalMap.values()].sort((a, b) => b.leads - a.leads),
    porRegiao: [...regiaoMap.values()].sort((a, b) => b.leads - a.leads),
    monthCanal: [...monthCanalMap.values()].sort((a, b) => a.mes.localeCompare(b.mes) || b.leads - a.leads),
    porSource: [...sourceMap.values()].sort((a, b) => b.leads - a.leads).slice(0, 20),
    porCampaign: [...campMap.values()].sort((a, b) => b.leads - a.leads).slice(0, 25),
    funil: funilData,
    funilPerdidos: funilCounts['perdido'] || 0,
    stageDistrib: [...funilStageRaw.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
  };

  console.log(`  ${ANO_REF}: ${totalLeads} leads | ${totalWins} wins | ${totalLost} lost | ${totalOpen} open`);
  console.log(`  Canais: ${[...canalMap.values()].map(c => c.canal + '=' + c.leads).join(', ')}`);
  console.log(`  Funil: ${funilData.map(f => f.label.split('. ')[1] + '=' + f.total).join(' > ')}`);
} else {
  console.log(`  [skip] rd_station_file nao configurado ou nao encontrado: ${RD_FILE}`);
}

// ---------------------------------------------------------------------------
// 4. Build output
// ---------------------------------------------------------------------------
const out = {
  fetched_at: new Date().toISOString(),
  vendas: {
    rows: vendasAno,
    totais: {
      totalVendas,
      comissaoTotal,
      mediaValor,
      numVendas,
      anoRef: ANO_REF,
    },
    porVendedorValor,
    porVendedorQtd,
    porUnidade: porUnidadeVendas,
    porMesValor: porMesValorV,
    porMesQtd: porMesQtdV,
    comissaoPorVendedor,
    comissaoPorMes,
  },
  cancelamentos: {
    rows: cancelAno,
    totais: {
      valorCancelado,
      qtdCancelamentos,
      anoRef: ANO_REF,
    },
    porSituacao,
    porTipo,
    porUnidade: porUnidadeC,
    porMesValor: porMesValorC,
    porMesQtd: porMesQtdC,
    extrato,
  },
  roi: roiData,
};

// ---------------------------------------------------------------------------
// 5. Write output
// ---------------------------------------------------------------------------
fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
const stat = fs.statSync(OUT_JSON);
console.log(`\n=== OK ===`);
console.log(`  ${OUT_JSON} (${(stat.size / 1024).toFixed(1)} KB)`);

const js = '/* BI EXTRAS — gerado por build-data-extras.cjs (Vendas + Cancelamentos). */\n' +
  'window.BIT_EXTRAS = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(OUT_JS, js);
const stat2 = fs.statSync(OUT_JS);
console.log(`  ${OUT_JS} (${(stat2.size / 1024).toFixed(1)} KB)`);
