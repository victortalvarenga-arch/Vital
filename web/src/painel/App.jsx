import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api } from '../shared/painel-api.js';
import { brl } from '../shared/formato.js';
import { DIAS, MESES, emFaixas, faixaDeHoras, fmtData, hojeISO, iniciais, toHora, toMin } from '../shared/tempo.js';
import { podeRemarcar } from '../shared/remarcar.js';
import Combos from './Combos.jsx';
import Unidades from './Unidades.jsx';
import Registro from './Registro.jsx';
import Agendamentos from './Agendamentos.jsx';
import Bloqueios from './Bloqueios.jsx';
import SeletorProfissional from './Seletor.jsx';
import SeletorPessoas from './SeletorPessoas.jsx';
import GradeDoDia, { classeDoBloco } from './GradeDoDia.jsx';
import Remarcar from './Remarcar.jsx';
import { useArrastar } from './useArrastar.js';
import { fechadoNoDia } from '../shared/jornada.js';
import GradeDoMes from './GradeDoMes.jsx';
import Recepcao from './Recepcao.jsx';
import SeletorCliente from './SeletorCliente.jsx';
import CampoData from './CampoData.jsx';
import { Campo, Confirmar, Gaveta, Modal, Switch } from './Base.jsx';
import Suporte from './Suporte.jsx';
import Formularios from './Formularios.jsx';
import Ficha from './Ficha.jsx';
import Comecar from './Comecar.jsx';
import ConfigSite from './ConfigSite.jsx';
import Entrar from './Entrar.jsx';
import Usuarios from './Usuarios.jsx';
import Resumo from './Resumo.jsx';
import Financeiro from './Financeiro.jsx';
import Equipe from './Equipe.jsx';
import Servicos from './Servicos.jsx';
import {
  Calendar, Users, Sparkles, MessageCircle, Wallet, Plus, X, Check, ChevronLeft,
  ChevronRight, Search, Phone, MapPin, Cake, Gift, Clock, Trash2, Pencil, Send,
  ArrowRight, ArrowLeft, User, CreditCard, Banknote, QrCode, Store, Instagram,
  Bell, Megaphone, HeartHandshake, TriangleAlert, ExternalLink, Menu, Globe,
  LogOut, KeyRound, Ban, Tag, MapPin as MapPinIcon, ScrollText,
  ClipboardList, ClipboardCheck, CalendarOff, Repeat, LayoutDashboard, LifeBuoy,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────
   Painel + site público. Todo dado vem da API em server/.
   A tela nunca grava nada direto: chama api.*, depois recarrega o estado.
   ──────────────────────────────────────────────────────────────── */


/* ─────────── utilidades ─────────── */
const uid = () => Math.random().toString(36).slice(2, 9);
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dow = iso => new Date(iso + 'T12:00:00').getDay();

const fmtDataLonga = iso => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const soDigitos = s => (s || '').replace(/\D/g, '');
const fmtFone = s => { const d = soDigitos(s).slice(0, 11); if (d.length <= 2) return d; if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; };
const waLink = (fone, texto) => `https://wa.me/55${soDigitos(fone)}?text=${encodeURIComponent(texto)}`;
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

/* ─────────── estado vindo do servidor ─────────── */

/**
 * Carrega tudo de uma vez em /api/estado e reexpõe `recarregar()`.
 * Depois de qualquer mutação a tela chama recarregar(): o servidor é a
 * fonte da verdade, então nada de estado otimista divergindo do banco.
 */
function useEstado() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  const recarregar = useCallback(async () => {
    try { setDados(await api.estado()); setErro(null); }
    catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);
  return { dados, erro, recarregar };
}

/* ─────────── motor de horários ─────────── */
/**
 * ATENÇÃO: esta função é só para desenhar a grade rápido na tela.
 * A validação que vale é a do servidor (server/src/lib/availability.js).
 * Nunca grave um agendamento confiando só nisto.
 */
function horariosLivres(prof, dataISO, duracao, agendamentos, antecedenciaH = 2) {
  const j = prof.jornada[dow(dataISO)];
  if (!j) return [];
  const [ini, fim] = [toMin(j[0]), toMin(j[1])];
  const ocupados = agendamentos.filter(a => a.prof === prof.id && a.data === dataISO && a.status !== 'cancelado');
  const agora = new Date();
  const limite = dataISO === hojeISO() ? agora.getHours() * 60 + agora.getMinutes() + antecedenciaH * 60 : -1;
  const out = [];
  for (let m = ini; m + duracao <= fim; m += 30) {
    if (m < limite) continue;
    const conflito = ocupados.some(a => m < toMin(a.hora) + a.duracao && m + duracao > toMin(a.hora));
    if (!conflito) out.push(toHora(m));
  }
  return out;
}

function renderTemplate(txt, vars) {
  return txt.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

/* ══════════════════════════════════════════════
   APP
   ══════════════════════════════════════════════ */

export default function App() {
  // `null` = ainda checando a sessão; `false` = deslogado.
  const [sessao, setSessao] = useState(null);

  useEffect(() => {
    api.eu().then(setSessao).catch(() => setSessao(false));
  }, []);

  if (sessao === null) return <div className="p-centro"><p className="p-fraco">Carregando…</p></div>;
  if (sessao === false) return <Entrar aoEntrar={setSessao} />;
  return <Painel sessao={sessao} aoSair={() => setSessao(false)} />;
}

function Painel({ sessao, aoSair }) {
  const { dados, erro, recarregar } = useEstado();
  const [secao, setSecao] = useState('resumo');
  // Um atalho pode pedir mais do que a tela: 'novo' abre a janela de
  // agendamento assim que a Agenda montar; `{ novo: true, data }` abre o
  // formulário de Horários fechados. O pedido é consumido lá e some —
  // senão voltar para a tela depois reabriria a janela sozinha.
  const [pedido, setPedido] = useState(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [toast, setToast] = useState(null);
  const [falha, setFalha] = useState(null);
  const [fila, setFila] = useState({ modoManual: true, itens: [] });

  // A fila é calculada pelo servidor (jobs/mensagens.js). Aqui a gente só lê.
  const carregarFila = useCallback(async () => {
    try { await api.gerarFila(); setFila(await api.fila()); } catch { /* servidor fora */ }
  }, []);
  useEffect(() => { carregarFila(); }, [carregarFila]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { if (falha) { const t = setTimeout(() => setFalha(null), 4000); return () => clearTimeout(t); } }, [falha]);

  if (erro && !dados) return (
    <div className="p-centro">
      <TriangleAlert size={34} style={{ color: 'var(--p-marca)' }} />
      <h2>Servidor fora do ar</h2>
      <p>Não consegui falar com a API. Rode <code>npm run dev</code> em <code>server/</code> e recarregue.</p>
      <p className="p-fraco">{erro}</p>
    </div>
  );
  if (!dados) return <div className="p-centro"><p className="p-fraco">Carregando…</p></div>;

  // Empresa recém-criada nasce sem catálogo e sem equipe, de propósito: nada de
  // ramo nenhum entra sem alguém pedir. O preço é uma primeira tela vazia, e o
  // assistente é o que paga esse preço — ensina o caminho em vez de mostrar
  // dado de mentira. Só o dono vê: quem atende não configura o negócio.
  const naoConfigurado = !dados.config.configurado
    && dados.staff.length === 0 && dados.servicos.length === 0;
  if (naoConfigurado && sessao.poderes.site) {
    return <Comecar config={dados.config} aoConcluir={recarregar} />;
  }

  /** Executa uma chamada de API, recarrega o estado e avisa em caso de erro. */
  const acao = async (fn, mensagem) => {
    try { await fn(); await recarregar(); if (mensagem) setToast(mensagem); return true; }
    catch (e) { setFalha(e.message); return false; }
  };

  // Esconder o que o papel não pode é cortesia, não segurança: a rota também
  // recusa. Um sem o outro é enganoso — ou dá erro feio, ou deixa passar.
  const p = sessao.poderes;
  const GRUPOS = [
    { titulo: null, itens: [
      { k: 'resumo', nome: 'Resumo', icon: LayoutDashboard },
      // Calendário e Agendamentos eram duas telas para a mesma pergunta — uma
      // desenhava a agenda, a outra listava a mesma agenda. Hoje são abas.
      { k: 'agenda', nome: 'Agenda', icon: Calendar },
      { k: 'bloqueios', nome: 'Horários fechados', icon: CalendarOff },
      ...(p.financeiro ? [{ k: 'financeiro', nome: 'Financeiro', icon: Wallet }] : []),
    ] },
    { titulo: 'Cadastros', itens: [
      ...(p.cadastros ? [{ k: 'servicos', nome: 'Serviços', icon: Sparkles }] : []),
      // Sem guarda de papel de propósito: quem atende também cria promoção.
      { k: 'combos', nome: 'Promoções', icon: Tag },
      ...(p.equipe ? [{ k: 'equipe', nome: 'Profissionais', icon: Store }] : []),
      ...(p.cadastros ? [{ k: 'clientes', nome: 'Clientes', icon: Users }] : []),
      ...(p.cadastros ? [{ k: 'unidades', nome: 'Unidades', icon: MapPinIcon }] : []),
      ...(p.cadastros ? [{ k: 'formularios', nome: 'Formulários', icon: ClipboardList }] : []),
    ] },
    { titulo: 'Configurações', itens: [
      { k: 'crm', nome: 'Mensagens', icon: MessageCircle, badge: fila.itens.length },
      ...(p.site ? [{ k: 'site', nome: 'Site da cliente', icon: Globe }] : []),
      ...(p.equipe ? [{ k: 'usuarios', nome: 'Acesso ao painel', icon: KeyRound }] : []),
      // Sem guarda: funcionário vê o próprio rastro, e é o servidor que recorta.
      { k: 'registro', nome: 'Registro', icon: ScrollText },
      { k: 'suporte', nome: 'Suporte técnico', icon: LifeBuoy },
    ] },
  ].filter(g => g.itens.length);

  const atual = GRUPOS.flatMap(g => g.itens).find(i => i.k === secao);
  const irPara = (k, oQue = null) => { setSecao(k); setPedido(oQue); setMenuAberto(false); };

  return (
    <div className="p-app">
      {/* Barra de topo: no celular é ela que abre o menu. */}
      <header className="p-topo">
        <button className="p-menu-btn" onClick={() => setMenuAberto(v => !v)} aria-label="Menu">
          {menuAberto ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span className="p-titulo">{atual?.nome}</span>
        <a className="p-ver-site" href="/" title="Ver o site"><ExternalLink size={18} /></a>
      </header>

      {menuAberto && <div className="p-veu" onClick={() => setMenuAberto(false)} />}

      <nav className={'p-lado' + (menuAberto ? ' aberto' : '')}>
        <div className="p-marca">
          <span className="p-marca-sigla">{(dados.config.nome || '?').trim()[0].toUpperCase()}</span>
          <span className="p-marca-nome">{dados.config.nome}</span>
        </div>
        {GRUPOS.map((g, i) => (
          <div key={i} className="p-grupo">
            {g.titulo && <div className="p-grupo-t">{g.titulo}</div>}
            {g.itens.map(item => (
              <button key={item.k}
                      className={'p-nav' + (secao === item.k ? ' on' : '')}
                      onClick={() => irPara(item.k)}>
                <item.icon size={18} />
                <span>{item.nome}</span>
                {item.badge > 0 && <span className="p-badge">{item.badge}</span>}
              </button>
            ))}
          </div>
        ))}
        <a className="p-nav p-nav-fim" href="/"><ExternalLink size={18} /><span>Ver o site</span></a>
        <div className="p-eu">
          <div className="p-eu-nome">{sessao.usuario.nome}</div>
          <div className="p-eu-papel">{sessao.usuario.papel}</div>
        </div>
        <button className="p-nav" onClick={async () => { await api.sair(); aoSair(); }}>
          <LogOut size={18} /><span>Sair</span>
        </button>
      </nav>

      <main className="p-conteudo">
        {secao === 'resumo' && (
          <Resumo dados={{ ...dados, eu: sessao.usuario }} acao={acao}
                  aviso={setToast} poderes={p} irPara={irPara} fila={fila} />
        )}
        {secao === 'agenda' && (
          <Agenda dados={{ ...dados, eu: sessao.usuario }} acao={acao}
                  aviso={setToast} poderes={p} pedido={pedido} irPara={irPara}
                  aoConsumirPedido={() => setPedido(null)} />
        )}
        {secao === 'clientes' && <Clientes dados={dados} acao={acao} aviso={setToast} />}
        {secao === 'servicos' && <Servicos dados={dados} acao={acao} aviso={setToast} />}
        {secao === 'combos' && <Combos dados={dados} acao={acao} aviso={setFalha} />}
        {secao === 'unidades' && p.cadastros && <Unidades dados={dados} acao={acao} aviso={setFalha} />}
        {secao === 'bloqueios' && (
          <Bloqueios dados={{ ...dados, eu: sessao.usuario }} aviso={setFalha} poderes={p}
                     acao={acao} pedido={pedido} aoConsumirPedido={() => setPedido(null)} />
        )}
        {secao === 'registro' && <Registro dados={{ ...dados, eu: sessao.usuario }} aviso={setFalha} />}
        {secao === 'suporte' && <Suporte aviso={setFalha} />}
        {secao === 'formularios' && p.cadastros && <Formularios dados={dados} acao={acao} aviso={setFalha} />}
        {secao === 'equipe' && <Equipe dados={dados} acao={acao} aviso={setToast} />}
        {secao === 'crm' && <CRM dados={dados} acao={acao} aviso={setToast} fila={fila} recarregarFila={carregarFila} />}
        {secao === 'financeiro' && p.financeiro && <Financeiro dados={dados} poderes={p} />}
        {secao === 'site' && p.site && <ConfigSite dados={dados} acao={acao} aviso={setFalha} />}
        {secao === 'usuarios' && p.equipe && (
          <Usuarios dados={dados} eu={sessao.usuario} aviso={setFalha} />
        )}
      </main>

      {toast && <div className="p-aviso"><Check size={17} />{toast}</div>}
      {falha && <div className="p-aviso erro"><TriangleAlert size={17} />{falha}</div>}
    </div>
  );
}

/* ── Agenda ── */
/**
 * Geometria da agenda.
 *
 * `TOPO` é a folga acima da primeira linha. Sem ela, a legenda das 08:00 —
 * centrada na própria linha, que é onde ela precisa estar para ser lida junto
 * com a grade — sairia cortada pela borda de cima.
 */
const H_INI = 8, H_FIM = 20, PX_H = 56, TOPO = 10;
const MIN_POR_PX = 60 / PX_H;

/** Os sete dias da semana que contém `iso`, de segunda a domingo. */
function semanaDe(iso) {
  const d = new Date(iso + 'T12:00:00');
  const desdeSegunda = (d.getDay() + 6) % 7;
  const segunda = addDias(iso, -desdeSegunda);
  return Array.from({ length: 7 }, (_, i) => addDias(segunda, i));
}

/** Primeiro e último dia do recorte: um dia, a semana de segunda a domingo, ou o mês. */
function faixaDaEscala(escala, ancora, semana) {
  if (escala === 'dia') return { de: ancora, ate: ancora };
  if (escala === 'semana') return { de: semana[0], ate: semana[6] };
  const [ano, mes] = ancora.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { de: `${ancora.slice(0, 7)}-01`, ate: `${ancora.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` };
}

/** A seta anda no tamanho do que se está vendo: um dia, uma semana, um mês. */
function passoDaEscala(escala, ancora, passos) {
  if (escala === 'dia') return addDias(ancora, passos);
  if (escala === 'semana') return addDias(ancora, passos * 7);
  const [ano, mes] = ancora.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + passos;
  // Dia 1 de propósito: somar mês sobre dia 31 cairia em "31 de fevereiro".
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIA_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'];

/** 'Sexta-feira, 26 de setembro' — o subtítulo da tela. */
function diaPorExtenso(iso) {
  const d = new Date(iso + 'T12:00:00');
  const nome = DIA_LONGO[d.getDay()];
  return `${nome[0].toUpperCase()}${nome.slice(1)}, ${d.getDate()} de ${MES_LONGO[d.getMonth()]}`;
}

/** O que vai escrito entre as setas. Curto: é rótulo, não frase. */
function rotuloDaEscala(escala, ancora, de, ate) {
  // Sempre a data, mesmo sendo hoje: o botão "Hoje" fica logo ao lado, e os
  // dois dizendo a mesma palavra deixavam sem saber onde se estava.
  if (escala === 'dia') {
    const d = new Date(ancora + 'T12:00:00');
    return `${d.getDate()} ${MESES[d.getMonth()]}`;
  }
  if (escala === 'semana') return `${fmtData(de)} – ${fmtData(ate)}`;
  const [ano, mes] = ancora.split('-').map(Number);
  return `${MES_LONGO[mes - 1][0].toUpperCase()}${MES_LONGO[mes - 1].slice(1)} ${ano}`;
}


/**
 * A agenda da semana.
 *
 * **Os dias vão no eixo X, não os profissionais.** Com uma coluna por pessoa, a
 * tela só cabia um dia e a semana virava sete cliques; e o número de colunas
 * mudava conforme quem estava em jornada, então a agenda tinha uma largura
 * diferente a cada dia. Com os dias fixos, a quem pertence cada atendimento é
 * dito dentro do próprio bloco — cor e primeiro nome.
 */
function Agenda({ dados, acao, aviso, poderes, pedido, aoConsumirPedido, irPara }) {
  const { staff, servicos, clientes, agendamentos } = dados;
  const [ancora, setAncora] = useState(hojeISO());
  const [sel, setSel] = useState(null);
  const [novo, setNovo] = useState(pedido === 'novo');
  // Onde o atendimento foi solto, esperando a confirmação. Arrastar move o
  // dinheiro de dia e avisa a cliente — perto demais de um tapa na tela para
  // valer sem perguntar.
  const [remarcar, setRemarcar] = useState(null);
  // Excluir apaga o atendimento do caixa e do histórico da cliente — pergunta
  // antes, numa janelinha no meio da tela, que é o formato que faz parar.
  const [cancelando, setCancelando] = useState(null);
  // Reagendar pela gaveta: guarda o novo dia enquanto se escolhe, e a lista de
  // horários livres vem do mesmo motor que desenha a grade.
  const [reagendando, setReagendando] = useState(null);
  const [trocandoStatus, setTrocandoStatus] = useState(false);
  // Quanto receber agora. Vazio quer dizer "o que falta", que é o caso comum;
  // um valor menor é a entrada. Mora aqui e não na caixa de pagamento porque
  // a gaveta inteira é um render só.
  const [entrada, setEntrada] = useState('');
  /** Abrir outro atendimento zera o campo: valor digitado não se herda. */
  const abrirAtendimento = a => { setEntrada(''); setTrocandoStatus(false); setSel(a); };
  // O pedido vale para esta montagem só; `novo` já nasceu com ele acima.
  useEffect(() => { if (pedido) aoConsumirPedido(); }, []);

  // Como se está olhando. `aba` escolhe a forma (grade, lista, recepção) e
  // `escala` o tamanho do recorte. Recepção não tem escala: é sempre o dia, que
  // é a pergunta de quem está no balcão agora.
  const [aba, setAba] = useState(pedido === 'lista' ? 'lista' : 'calendario');
  const [escala, setEscala] = useState('dia');    // dia | semana | mes
  // Quem a dona está olhando. Lista vazia é a equipe toda. Funcionário não tem
  // a escolha — o servidor já entrega só a agenda dele.
  const [pessoas, setPessoas] = useState([]);

  const passo = dados.config.passoAgenda || 30;
  const hoje = hojeISO();
  const semana = useMemo(() => semanaDe(ancora), [ancora]);
  const escalaAtiva = aba === 'recepcao' ? 'dia' : escala;
  const { de, ate } = useMemo(
    () => faixaDaEscala(escalaAtiva, ancora, semana), [escalaAtiva, ancora, semana]
  );

  const daPessoa = a => pessoas.length === 0 || pessoas.includes(a.prof);
  const doPeriodo = agendamentos
    .filter(a => a.data >= de && a.data <= ate && a.status !== 'cancelado')
    .filter(daPessoa);
  // Bloqueio sem dono fecha a empresa toda: continua aparecendo mesmo com uma
  // pessoa escolhida, porque fecha a agenda dela também.
  const fechados = (dados.bloqueios || [])
    .filter(b => b.data >= de && b.data <= ate)
    .filter(b => pessoas.length === 0 || !b.profissionalId || pessoas.includes(b.profissionalId));
  const receita = doPeriodo.reduce((s, a) => s + a.valor, 0);
  // Ação sempre cai num dia que está à vista: no mês e na semana que contêm
  // hoje, cai em hoje; fora disso, no primeiro dia do recorte.
  const diaParaAcao = hoje >= de && hoje <= ate ? hoje : de;

  // A pessoa escolhida, quando é uma só — é o que destrava pintar a agenda
  // fechada. Com duas ou mais, não há "a jornada" da grade.
  const umaPessoa = pessoas.length === 1 ? staff.find(p => p.id === pessoas[0]) : null;

  // As colunas do dia: quem está escolhido, ou a equipe ativa inteira.
  const colunasDoDia = poderes.verDeTodos
    ? staff.filter(p => p.ativo && (pessoas.length === 0 || pessoas.includes(p.id)))
    : staff.filter(p => p.id === dados.eu?.profissionalId);

  // Forma funcional: o relógio da borda dispara de novo a cada 750ms, e com a
  // âncora do fecho ele voltaria sempre para a MESMA semana seguinte.
  const andar = passos => setAncora(atual => passoDaEscala(escalaAtiva, atual, passos));

  // Mexer no atendimento NÃO fecha a gaveta: trocar a situação e receber são
  // dois toques seguidos no mesmo atendimento, e fechar depois do primeiro
  // obrigava a achar o bloco de novo na grade. Quem redesenha é `aberto`, que
  // relê da lista recarregada.
  const mudarStatus = async (id, status) => {
    await acao(() => api.atualizarAgendamento(id, { status }), 'Situação atualizada');
  };
  /**
   * Receber é escrever quanto já entrou, no total — nunca um incremento.
   *
   * Clique duplo, retry de rede ou dois atendentes na mesma tela mandariam o
   * mesmo número de novo, e o número de novo é o mesmo estado. Com incremento,
   * seria cobrar duas vezes. Quem decide o status a partir do valor é o
   * servidor (`lib/pagamento.js`); daqui não vai `status` nenhum.
   *
   * Receber não conclui o atendimento. Sinal pago na marcação acontece dias
   * antes de a cliente sentar, e concluir por causa do dinheiro faria o
   * atendimento nascer atendido — quem conclui é o botão do fluxo.
   */
  const receber = async (id, total, forma) => {
    await acao(() => api.atualizarAgendamento(id, {
      pagamento: { recebido: Number(total.toFixed(2)), forma },
    }), 'Pagamento registrado');
    setEntrada('');
  };
  const desfazerPagamento = async id => {
    await acao(() => api.atualizarAgendamento(id, {
      pagamento: { status: 'aberto' },
    }), 'Pagamento desfeito');
    setEntrada('');
  };
  /** Trocar a forma de um atendimento já quitado não recebe nada de novo. */
  const trocarForma = async (id, forma) => {
    await acao(() => api.atualizarAgendamento(id, { pagamento: { forma } }), 'Forma atualizada');
  };
  /**
   * Cancelar é marcar `cancelado`, não apagar. O horário volta para a agenda e
   * o atendimento some do caixa, mas a linha fica: quem cancelou, quando, e de
   * qual estado para qual — é o que responde "essa cliente desmarcou de novo?".
   * Apagar de verdade continua existindo na rota, para engano de digitação.
   */
  const cancelar = async id => {
    await acao(() => api.atualizarAgendamento(id, { status: 'cancelado' }), 'Atendimento cancelado');
    setSel(null);
  };

  /**
   * Arrastar para remarcar, nas duas grades desta tela.
   *
   * A da semana anda de semana em semana na beirada; a do dia anda de dia em
   * dia — é a mesma `andar`, que já conhece a escala à vista. A geometria de
   * cada grade se resolve sozinha nos `data-dia` / `data-prof` das colunas,
   * e é por isso que um motor só serve as duas.
   */
  const arrastarNa = (grade, faixa, regua) => useArrastar({
    agendamentos, bloqueios: dados.bloqueios || [], servicos, staff,
    agora: { data: hoje, hora: toHora(new Date().getHours() * 60 + new Date().getMinutes()) },
    faixa, regua, grade, virarPagina: andar,
    aoSoltar: setRemarcar, aoTocar: abrirAtendimento, aviso,
  });
  // Cada grade tem a sua altura de hora, e a do dia ainda se estica para caber
  // um atendimento das 7h — a mesma `faixaDeHoras` que ela usa para desenhar.
  const naSemana = arrastarNa('.agenda', [H_INI, H_FIM], [PX_H, TOPO]);
  const noDia = arrastarNa('.eq-timeline', faixaDeHoras(doPeriodo), [34, 8]);
  // O rótulo flutuante ("onde vai cair, e por que não dá") é um só para a tela:
  // só uma grade está desenhada por vez, e só um dedo arrasta por vez.
  const arrasto = naSemana.arrasto || noDia.arrasto;

  return (
    <>
      <div className="ag-topo">
        <div className="ag-cabeca">
          <div>
            <h2>Agenda</h2>
            <div className="sub">{diaPorExtenso(ancora)}</div>
          </div>
          <div className="ag-nav">
            <button className="btn btn-g btn-s" onClick={() => setAncora(hoje)}>Hoje</button>
            <button className="fin-seta" onClick={() => andar(-1)}
                    aria-label="Anterior"><ChevronLeft size={16} /></button>
            <span className="ag-periodo">{rotuloDaEscala(escalaAtiva, ancora, de, ate)}</span>
            <button className="fin-seta" onClick={() => andar(1)}
                    aria-label="Seguinte"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="ag-controles">
          {/* Recepção é sempre o dia: oferecer semana e mês ali seria oferecer
              uma pergunta que a tela não responde. */}
          {aba !== 'recepcao' && (
            <div className="fin-seg" role="group" aria-label="Tamanho do período">
              {[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, r]) => (
                <button key={k} type="button" className={escala === k ? 'on' : ''}
                        aria-pressed={escala === k} onClick={() => setEscala(k)}>{r}</button>
              ))}
            </div>
          )}
          <SeletorPessoas staff={staff} valor={pessoas} aoMudar={setPessoas}
                          podeVerTodos={poderes.verDeTodos} multiplo />
          <div className="ag-acoes">
            {/* Bloquear tem uma casa só: a tela de Horários fechados, com o
                formulário já aberto no dia que se está olhando. */}
            <button className="btn btn-g btn-s"
                    onClick={() => irPara('bloqueios', { novo: true, data: diaParaAcao })}>
              <Ban size={16} /> Bloquear horário
            </button>
            <button className="btn btn-p btn-s" onClick={() => setNovo(true)}>
              <Plus size={16} /> Novo agendamento
            </button>
          </div>
        </div>

        <div className="ag-abas" role="tablist">
          {[['calendario', 'Calendário'], ['lista', 'Lista'], ['recepcao', 'Recepção']].map(([k, r]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k}
                    className={'ag-aba' + (aba === k ? ' on' : '')}
                    onClick={() => setAba(k)}>{r}</button>
          ))}
          <span className="ag-conta">
            {doPeriodo.length} {doPeriodo.length === 1 ? 'atendimento' : 'atendimentos'}
            {' · '}{brl(receita)}
          </span>
        </div>
      </div>

      {aba === 'lista' && (
        <Agendamentos dados={dados} acao={acao} poderes={poderes}
                      de={de} ate={ate} pessoas={pessoas} />
      )}

      {aba === 'recepcao' && (
        <Recepcao agendamentos={doPeriodo} clientes={clientes} servicos={servicos}
                  staff={staff} aoTocar={abrirAtendimento} />
      )}

      {aba === 'calendario' && escala === 'dia' && (
        <GradeDoDia colunas={colunasDoDia} agendamentos={doPeriodo}
                    clientes={clientes} servicos={servicos} staff={staff}
                    data={ancora} bloqueios={fechados.filter(b => b.data === ancora)}
                    mostrarFechado={umaPessoa}
                    arrasto={noDia.arrasto} aoPegar={noDia.aoPegar}
                    arrastado={agendamentos.find(x => x.id === noDia.arrasto?.id) || null} />
      )}

      {aba === 'calendario' && escala === 'mes' && (
        <GradeDoMes mes={ancora} agendamentos={doPeriodo} hoje={hoje} staff={staff}
                    aoEscolherDia={d => { setAncora(d); setEscala('dia'); }} />
      )}

      {aba === 'calendario' && escala === 'semana' && (
      <div className="agenda">
        {/* Legendas de hora em hora, centradas na própria linha. A grade é de
            meia em meia hora: é o passo em que a agenda é vendida, e sem ela
            não dá para ver a olho se um bloco começa às 10h ou às 10h30. */}
        <div className="horas">
          <div className="horas-topo" />
          <div className="horas-corpo" style={{ height: (H_FIM - H_INI) * PX_H + TOPO * 2 }}>
            {Array.from({ length: H_FIM - H_INI + 1 }, (_, i) => (
              <span key={i} className="hlabel" style={{ top: TOPO + i * PX_H }}>
                {String(H_INI + i).padStart(2, '0')}:00
              </span>
            ))}
          </div>
        </div>

        {/* A faixa que carrega na beirada. Enquanto o dedo fica ali ela enche,
            e a cada volta a semana vira — é o mesmo aviso que o celular dá
            quando se arrasta para o canto: sem ele, a agenda pula sozinha e
            parece defeito. */}
        {naSemana.arrasto?.lado && (
          <div className={'ag-borda ' + (naSemana.arrasto.lado < 0 ? 'esq' : 'dir')} aria-hidden="true">
            {naSemana.arrasto.lado < 0 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </div>
        )}

        <div className="semana">
          {semana.map(dia => {
            const daqui = doPeriodo.filter(a => a.data === dia);
            const blocos = emFaixas(daqui.map(a => ({
              a, ini: toMin(a.hora), fim: toMin(a.hora) + a.duracao,
            })));
            const emJornada = staff.filter(p => p.ativo && p.jornada[dow(dia)]).length;

            return (
              <div key={dia} className={'dia' + (dia === hoje ? ' hoje' : '')}>
                <div className="diahead">
                  <span className="diahead-nome">{DIAS[new Date(dia + 'T12:00:00').getDay()]}</span>
                  <span className="diahead-num">{dia.slice(8)}</span>
                  {emJornada === 0 && <span className="diahead-vazio">fechado</span>}
                </div>

                <div className="diabody" data-dia={dia}
                     style={{ height: (H_FIM - H_INI) * PX_H + TOPO * 2 }}>
                  {Array.from({ length: (H_FIM - H_INI) * 2 + 1 }, (_, i) => (
                    <div key={i} className={'linha' + (i % 2 ? ' meia' : '')}
                         style={{ top: TOPO + i * PX_H / 2 }} />
                  ))}

                  {/* Fora da jornada de quem está escolhida. Só com UMA
                      pessoa: com a equipe inteira na mesma coluna, a faixa
                      seria a interseção de jornadas diferentes — pintaria de
                      fechado o horário em que alguém atende. */}
                  {umaPessoa && fechadoNoDia({
                    profissional: umaPessoa, data: dia, deMin: H_INI * 60, ateMin: H_FIM * 60,
                  }).map(f => (
                    <div key={f.ini} className="fechado" title={f.motivo} aria-hidden="true"
                         style={{ top: TOPO + (f.ini - H_INI * 60) / MIN_POR_PX,
                                  height: (f.fim - f.ini) / MIN_POR_PX }} />
                  ))}

                  {/* Bloqueio entra ATRÁS do agendamento: quando os dois se
                      cruzam, o que importa ver é a cliente que já está marcada. */}
                  {fechados.filter(b => b.data === dia).map(b => {
                    const p = staff.find(x => x.id === b.profissionalId);
                    const top = TOPO + (toMin(b.horaIni) - H_INI * 60) / MIN_POR_PX;
                    const h = Math.max((toMin(b.horaFim) - toMin(b.horaIni)) / MIN_POR_PX, 16);
                    const meu = Boolean(b.profissionalId);
                    return (
                      <button key={b.id} className="bloqueio" style={{ top, height: h }}
                              title={meu ? `Liberar (${p?.nome || '—'})` : 'Fecha a empresa toda'}
                              disabled={!meu && !poderes.verDeTodos}
                              onClick={() => acao(() => api.removerBloqueio(b.id), 'Horário liberado')}>
                        <span>{b.motivo || 'Bloqueado'}{p ? ` · ${p.nome.split(' ')[0]}` : ''}</span>
                      </button>
                    );
                  })}

                  {/* A sombra é o próprio atendimento, esmaecido, e não um
                      contorno pontilhado: mostra a altura (meia hora a mais
                      muda o que cabe depois) e também o que é aquilo — de quem
                      é e qual serviço —, que é o que se confere antes de
                      largar. Sai de `agendamentos`, e não da semana à vista:
                      carregando alguém para outra semana, o de origem já não
                      está mais na tela. */}
                  {naSemana.arrasto?.data === dia && naSemana.arrasto.hora && (() => {
                    const a = agendamentos.find(x => x.id === naSemana.arrasto.id);
                    if (!a) return null;
                    const c = clientes.find(x => x.id === a.cliente);
                    const s = servicos.find(x => x.id === a.servico);
                    const p = staff.find(x => x.id === a.prof);
                    return (
                      <div className={'appt sombra' + (naSemana.arrasto.ok ? '' : ' nao')}
                           style={{
                             top: TOPO + (toMin(naSemana.arrasto.hora) - H_INI * 60) / MIN_POR_PX,
                             height: Math.max(naSemana.arrasto.dur / MIN_POR_PX - 2, 26),
                             left: 3, right: 3,
                             background: (p?.cor || '#999') + '1f',
                             borderLeftColor: p?.cor || '#999',
                           }}>
                        <b>{c?.nome.split(' ')[0]}</b>
                        <span className="t">{naSemana.arrasto.hora}</span> · {s?.nome}
                        <span className="appt-quem" style={{ color: p?.cor }}>{p?.nome.split(' ')[0]}</span>
                      </div>
                    );
                  })()}

                  {blocos.map(({ a, ini, fim, faixa, faixas }) => {
                    const c = clientes.find(x => x.id === a.cliente);
                    const s = servicos.find(x => x.id === a.servico);
                    const p = staff.find(x => x.id === a.prof);
                    const puxando = naSemana.arrasto?.id === a.id;
                    const larg = 100 / faixas;
                    return (
                      <button key={a.id}
                        className={classeDoBloco(a.status) + (puxando ? ' puxando' : '')}
                        style={{
                          top: TOPO + (ini - H_INI * 60) / MIN_POR_PX,
                          height: Math.max((fim - ini) / MIN_POR_PX - 2, 26),
                          left: `calc(${faixa * larg}% + 3px)`,
                          width: `calc(${larg}% - 6px)`,
                          background: (p?.cor || '#999') + '1f',
                          borderLeftColor: p?.cor || '#999',
                        }}
                        onPointerDown={e => naSemana.aoPegar(e, a)}>
                        <b>{c?.nome.split(' ')[0]}</b>
                        <span className="t">{a.hora}</span> · {s?.nome}
                        {/* Quem atende é dito aqui, já que a coluna virou o dia. */}
                        <span className="appt-quem" style={{ color: p?.cor }}>{p?.nome.split(' ')[0]}</span>
                        {a.pagamento.status === 'pago' && <span className="appt-pago">✓ pago</span>}
                        {a.adicionais.length > 0 && (
                          <span className="appt-mais">
                            + {a.adicionais.length === 1
                                 ? a.adicionais[0].nome
                                 : `${a.adicionais.length} adicionais`}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Onde vai cair, enquanto o dedo ainda está em cima — e, quando não dá,
          por que não. Descobrir o motivo só depois de soltar faz a pessoa
          tentar de novo no mesmo lugar. */}
      {arrasto?.hora && (
        <div className={'arrasto-aviso' + (arrasto.ok ? '' : ' nao')}>
          {arrasto.ok || arrasto.igual
            ? `${fmtData(arrasto.data)} às ${arrasto.hora}`
            : arrasto.motivo}
        </div>
      )}

      {remarcar && (
        <Remarcar alvo={remarcar} clientes={clientes} servicos={servicos} staff={staff}
                  acao={acao} aoFechar={() => setRemarcar(null)} />
      )}

      {/* Uma gaveta de cada vez: com o reagendar aberto, a do atendimento ficava
          atrás, invisível e ainda assim no caminho. */}
      {sel && !reagendando && (() => {
        // Relê da lista recarregada: mudar a situação com a gaveta aberta
        // precisa mudar o que está na tela, e o `sel` guardado é a foto de
        // quando se clicou. Se o atendimento sumiu, cai no que se tinha.
        const at = agendamentos.find(x => x.id === sel.id) || sel;
        const c = clientes.find(x => x.id === at.cliente);
        const s = servicos.find(x => x.id === at.servico);
        const p = staff.find(x => x.id === at.prof);
        // O dinheiro em três números, um só lugar: a caixa mostra, os botões
        // decidem, e nenhum dos dois recalcula por conta própria.
        const total = Number(at.valor || 0);
        const pago = Number(at.pagamento.recebido || 0);
        const falta = Math.max(0, Number((total - pago).toFixed(2)));
        const quitado = falta === 0;
        const pedido = entrada.trim() ? Number(entrada.replace(',', '.')) : falta;
        // O que o clique na forma vai receber: o campo, quando tem número
        // válido que cabe no que falta; o resto, quando está vazio.
        const vaiReceber = Number.isFinite(pedido) && pedido > 0 && pedido <= falta ? pedido : 0;

        const tplLembrete = dados.templates.find(t => t.chave === 'lembrete_dia');
        const msg = renderTemplate(tplLembrete.texto, {
          cliente: c.nome.split(' ')[0], hora: at.hora, endereco: dados.config.endereco,
          servico: s.nome, empresa: dados.config.nome, estudio: dados.config.nome, data: fmtData(at.data), profissional: p.nome.split(' ')[0], valor: brl(at.valor),
        });
        return (
          <Gaveta onClose={() => { setSel(null); setEntrada(''); }} titulo="Atendimento">
            <div className="eyebrow">{fmtDataLonga(at.data)} · {at.hora}</div>
            <h2 style={{ fontSize: 26, margin: '6px 0 16px' }}>{c?.nome}</h2>

            {/* O resumo em linhas, e não numa frase corrida: quem abre isto
                está conferindo um dado de cada vez — qual serviço, com quem,
                quanto — e frase obriga a ler tudo para achar um. */}
            <div className="at-status">
              <div>
                <span className="eyebrow">Status</span>
                <i className={'at-tag ' + FLUXO[at.status].tom}>{FLUXO[at.status].rotulo}</i>
              </div>
              <button className="btn btn-g btn-s" onClick={() => setTrocandoStatus(v => !v)}>
                {trocandoStatus ? 'Fechar' : 'Alterar'}
              </button>
            </div>

            {/* A lista inteira só abre a pedido: é para corrigir, não para o
                caminho normal. */}
            {trocandoStatus && (
              <div className="chips at-todos">
                {Object.entries(FLUXO).map(([k, f]) => (
                  <button key={k} className={'chip' + (at.status === k ? ' on' : '')}
                          onClick={() => mudarStatus(at.id, k)}>{f.rotulo}</button>
                ))}
              </div>
            )}

            <div className="at-resumo">
              <div><span>Serviço</span><b>{s?.nome}</b></div>
              <div><span>Duração</span><b>{at.duracao} min</b></div>
              <div><span>Profissional</span><b>{p?.nome}</b></div>
              <div><span>Valor</span><b className="mono">{brl(at.valor)}</b></div>
            </div>

            {/* O pagamento em contas fechadas: total, quanto entrou, quanto
                falta. Três linhas e não uma etiqueta porque "pagou 20 de 45" é
                a pergunta do balcão, e etiqueta só sabe responder sim ou não. */}
            <div className="at-pagamento">
              <div className="at-pag-topo">
                <span className="eyebrow">Pagamento</span>
                <i className={'at-tag ' + (quitado ? 'ok' : pago > 0 ? 'agora' : 'espera')}>
                  {quitado ? 'Pago' : pago > 0 ? 'Entrada' : 'A pagar'}
                </i>
              </div>
              <div><span>Valor total</span><b className="mono">{brl(total)}</b></div>
              <div><span>Pago</span><b className="mono">{brl(pago)}</b></div>
              <div><span>Falta receber</span><b className="mono">{brl(falta)}</b></div>

              {/* Vazio recebe o que falta — é o clique de sempre. O campo existe
                  para o outro caso: entrou parte agora, o resto na saída. */}
              {!quitado && (
                <label className="at-entrada">
                  <span>Receber agora</span>
                  <input inputMode="decimal" value={entrada} placeholder={brl(falta)}
                         onChange={e => setEntrada(e.target.value.replace(/[^\d,.]/g, ''))} />
                </label>
              )}

              <div className="chips at-formas">
                {['pix', 'cartao', 'dinheiro'].map(fm => (
                  <button key={fm} disabled={!quitado && !(vaiReceber > 0)}
                          className={'chip' + (pago > 0 && at.pagamento.forma === fm ? ' on' : '')}
                          onClick={() => (quitado && at.pagamento.forma === fm ? desfazerPagamento(at.id)
                            : quitado ? trocarForma(at.id, fm)
                            : receber(at.id, pago + vaiReceber, fm))}>{fm}</button>
                ))}
              </div>
              <p className="at-dica">
                {quitado ? 'Clique na forma marcada para desfazer o recebimento.'
                  : vaiReceber > 0 ? `Escolha a forma para registrar ${brl(vaiReceber)}.`
                  : 'Valor inválido — apague o campo para receber o que falta.'}
              </p>
            </div>

            {/* Uma ação por etapa: a seguinte. Faltou fica ao lado enquanto a
                cliente ainda pode não vir; depois de concluído não faz sentido. */}
            {FLUXO[at.status].proximo && (
              <div className="at-fluxo">
                <button className="btn btn-p" onClick={() => mudarStatus(at.id, FLUXO[at.status].proximo)}>
                  {FLUXO[at.status].acao}
                </button>
                {at.status !== 'em_atendimento' && (
                  <button className="btn btn-g" onClick={() => mudarStatus(at.id, 'falta')}>
                    Marcar falta
                  </button>
                )}
              </div>
            )}
            {/* Quem atende precisa saber o que foi comprado junto antes de
                começar — e o valor só fecha com o total quando os extras
                aparecem discriminados. */}
            {/* A ficha do atendimento. A cliente não a responde mais pelo site
                (LGPD — ver ARQUITETURA.md): é aqui que ela é perguntada, com a
                pessoa presente, e lida antes de começar. */}
            {/* `at.servico` e `at.cliente`, não `servicoId`/`clienteId`: o
                painel traduz os nomes do servidor em `painel-api.js`, e aqui
                dentro o agendamento já chega com os nomes curtos. */}
            <FichaRespondida agendamentoId={at.id} servicoId={at.servico}
                             clienteId={at.cliente} aviso={aviso} />

            {at.adicionais.length > 0 && (
              <div className="extras">
                <span className="eyebrow">Comprou junto</span>
                {at.adicionais.map(x => (
                  <div key={x.id} className="extras-li">
                    <span>{x.nome}</span>
                    <b className="mono">{brl(x.preco)}</b>
                  </div>
                ))}
              </div>
            )}
            {c?.obs && <div className="card" style={{ padding: 12, fontSize: 13, marginBottom: 16, background: '#FFFBEE', borderColor: '#EBDFAE' }}>📌 {c.obs}</div>}

            <div className="at-secao">
              <span className="eyebrow">Cliente</span>
              {c?.fone && (
                <a className="at-linha" href={`tel:${soDigitos(c.fone)}`}>
                  <Phone size={14} /> {fmtFone(c.fone)}
                </a>
              )}
              <a className="at-linha" href={waLink(c.fone, msg)} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={14} /> Avisar no WhatsApp
              </a>
            </div>

            <div className="at-acoes">
              <button className="btn btn-g" onClick={() => setReagendando({ a: at, data: at.data, hora: '' })}>
                <Repeat size={16} /> Reagendar
              </button>
              <button className="btn btn-g btn-erro" disabled={at.status === 'cancelado'}
                      onClick={() => setCancelando(at)}>
                <Ban size={16} /> {at.status === 'cancelado' ? 'Já cancelado' : 'Cancelar atendimento'}
              </button>
            </div>
          </Gaveta>
        );
      })()}

      {/* `diaParaAcao`, não `data`: essa variável não existe aqui, e a referência
          solta derrubava a Agenda inteira no clique — a tela sumia sem modal e
          sem erro visível. */}
      {novo && (
        <NovoAgendamento dados={dados} acao={acao} data={diaParaAcao}
                         fechar={() => setNovo(false)} aviso={aviso} />
      )}

      {/* Reagendar pela gaveta: o mesmo destino que o arrasto produz, para quem
          prefere escolher numa lista a arrastar na grade. Os horários vêm do
          motor que desenha a grade; quem decide de verdade é o servidor. */}
      {reagendando && (() => {
        const a = reagendando.a;
        const prof = staff.find(x => x.id === a.prof);
        const livres = prof ? horariosLivres(prof, reagendando.data, a.duracao, agendamentos, 0) : [];
        return (
          <Gaveta onClose={() => setReagendando(null)} titulo="Reagendar">
            <h2 style={{ fontSize: 24, marginBottom: 6 }}>Reagendar</h2>
            <p className="rm-quem">
              {clientes.find(x => x.id === a.cliente)?.nome} · {servicos.find(x => x.id === a.servico)?.nome}
              {' · '}hoje em {fmtData(a.data)} às {a.hora}
            </p>

            <Campo label="Novo dia">
              <CampoData valor={reagendando.data} min={hoje}
                         aoMudar={d => setReagendando(r => ({ ...r, data: d, hora: '' }))} />
            </Campo>

            <Campo label="Horário">
              {livres.length === 0
                ? <p className="rs-vazio">Sem horário livre nesse dia para {prof?.nome.split(' ')[0]}.</p>
                : <div className="chips">
                    {livres.map(h => (
                      <button key={h} type="button"
                              className={'chip slot' + (reagendando.hora === h ? ' on' : '')}
                              onClick={() => setReagendando(r => ({ ...r, hora: h }))}>{h}</button>
                    ))}
                  </div>}
            </Campo>

            <button className="btn btn-p" style={{ width: '100%', marginTop: 8 }}
                    disabled={!reagendando.hora}
                    onClick={async () => {
                      const { data, hora } = reagendando;
                      setReagendando(null);
                      setSel(null);
                      await acao(
                        () => api.atualizarAgendamento(a.id, { data, hora }),
                        `Remarcado para ${fmtData(data)} às ${hora}`
                      );
                    }}>
              {reagendando.hora ? `Remarcar para ${fmtData(reagendando.data)} às ${reagendando.hora}` : 'Escolha um horário'}
            </button>
          </Gaveta>
        );
      })()}

      {cancelando && (
        <Confirmar
          titulo="Cancelar este atendimento?"
          texto={`${clientes.find(c => c.id === cancelando.cliente)?.nome || 'A cliente'}, ${fmtData(cancelando.data)} às ${cancelando.hora}. O horário volta a ficar livre e o atendimento sai do caixa — o registro fica, com quem cancelou e quando.`}
          rotulo="Cancelar atendimento" perigo
          aoFechar={() => setCancelando(null)}
          aoConfirmar={async () => { const id = cancelando.id; setCancelando(null); await cancelar(id); }} />
      )}
    </>
  );
}

/**
 * O caminho de um atendimento, do dia marcado até o fim.
 *
 * Cada etapa mostra **uma** ação: a seguinte. A lista inteira de estados fica
 * atrás do "Alterar" — quem precisa dela está corrigindo alguma coisa, e
 * corrigir é o caso raro. Mostrar os seis botões o tempo todo fazia a pessoa
 * escolher entre seis quando só um fazia sentido naquele momento.
 */
const FLUXO = {
  agendado:       { rotulo: 'Agendado',       tom: 'espera',  proximo: 'confirmado',     acao: 'Confirmar' },
  confirmado:     { rotulo: 'Confirmado',     tom: 'ok',      proximo: 'em_atendimento', acao: 'Cliente chegou' },
  em_atendimento: { rotulo: 'Em atendimento', tom: 'agora',   proximo: 'concluido',      acao: 'Concluir' },
  concluido:      { rotulo: 'Concluído',      tom: 'feito' },
  falta:          { rotulo: 'Faltou',         tom: 'falta' },
  cancelado:      { rotulo: 'Cancelado',      tom: 'ruim' },
};
const ROTULO_STATUS = Object.fromEntries(Object.entries(FLUXO).map(([k, v]) => [k, v.rotulo]));
const TOM_STATUS = Object.fromEntries(Object.entries(FLUXO).map(([k, v]) => [k, v.tom]));

/**
 * Agendamento pelo balcão — o botão "Agendar" do Calendário e o atalho do Resumo.
 *
 * Vendia menos que o site: nada de adicionais, nada de combos. Quem marcava por
 * aqui lançava o valor na mão, e o que digitasse não batia com o que o site
 * cobraria pelo mesmo atendimento — duas verdades para a mesma venda.
 *
 * O que continua diferente de propósito: `forcar: true`. A marcação pelo balcão
 * pode furar a jornada, porque é manual e quem está ali sabe o que está fazendo.
 * O que ela **não** fura é conflito com outro atendimento — isso o servidor
 * recusa dos dois lados. Por que não é a tela do site: ver `ARQUITETURA.md`.
 */
function NovoAgendamento({ dados, acao, data, fechar, aviso }) {
  const { staff, clientes, agendamentos } = dados;
  // Só a que está no ar vende, no balcão como no site; o dia o servidor confere.
  const combos = (dados.combos || []).filter(c => c.situacao === 'ativa');

  // Extra que só se vende junto não é serviço principal — nem aqui.
  const vendaveis = dados.servicos.filter(s => s.ativo && !s.somenteAdicional);

  const [tipo, setTipo] = useState('servico');       // 'servico' | 'combo'
  const [f, setF] = useState({
    cliente: '', servico: vendaveis[0]?.id || '', combo: combos[0]?.id || '',
    prof: '', data, hora: '', extras: [],
  });
  const [ofertados, setOfertados] = useState([]);
  const [respostas, setRespostas] = useState({});
  const [ocupado, setOcupado] = useState(false);
  // Marcar numa data que já passou é legítimo — atendeu sem agendar e quer
  // registrar —, mas quase sempre é engano de digitação. Por isso pergunta, em
  // vez de bloquear: bloquear obrigaria a inventar outro caminho para o caso
  // real, e é assim que nasce planilha paralela.
  const [confirmarPassado, setConfirmarPassado] = useState(false);

  const svc = vendaveis.find(s => s.id === f.servico);
  const combo = combos.find(c => c.id === f.combo);
  const ehCombo = tipo === 'combo';

  // Quem pode executar: no combo, só quem faz o pacote inteiro.
  const profs = ehCombo
    ? staff.filter(p => combo?.profissionais?.includes(p.id))
    : staff.filter(p => svc?.profs.includes(p.id));
  const prof = staff.find(p => p.id === f.prof) || profs[0];

  // O que a empresa oferece de extra para este serviço. Vem do servidor: a
  // regra é a união de "extra deste serviço" com "extra desta categoria", e
  // refazê-la aqui seria uma segunda versão dela para divergir.
  useEffect(() => {
    if (ehCombo || !svc) return setOfertados([]);
    let valeu = true;
    api.ofertaDeAdicionais(svc.id)
      .then(r => { if (valeu) setOfertados(r.adicionais || []); })
      .catch(() => { if (valeu) setOfertados([]); });
    return () => { valeu = false; };
  }, [ehCombo, svc?.id]);

  const extras = dados.servicos.filter(s => f.extras.includes(s.id));
  const duracao = ehCombo
    ? (combo?.duracao || 0)
    : (svc ? svc.duracao + (svc.intervalo || 0) + extras.reduce((n, x) => n + x.duracao + (x.intervalo || 0), 0) : 0);
  const total = ehCombo
    ? (combo?.preco || 0)
    : (svc ? Number(svc.preco) + extras.reduce((n, x) => n + Number(x.preco), 0) : 0);

  const slots = prof && duracao ? horariosLivres(prof, f.data, duracao, agendamentos, 0) : [];

  const alternarExtra = id => setF(v => ({
    ...v,
    extras: v.extras.includes(id) ? v.extras.filter(x => x !== id) : [...v.extras, id],
    hora: '',   // extra muda a duração, e duração muda o que cabe
  }));

  const trocarTipo = t => {
    setTipo(t);
    setF(v => ({ ...v, prof: '', hora: '', extras: [] }));
  };

  const salvar = async () => {
    setOcupado(true);
    const ok = await acao(
      () => (ehCombo
        ? api.agendarCombo({ clienteId: f.cliente, comboId: combo.id, profissionalId: prof.id, data: f.data, hora: f.hora })
        : api.criarAgendamento({
            cliente: f.cliente, servico: svc.id, prof: prof.id,
            data: f.data, hora: f.hora, adicionaisIds: f.extras, forcar: true,
            respostas,
          })),
      ehCombo ? 'Promoção agendada' : 'Agendamento criado'
    );
    if (ok) fechar(); else setOcupado(false);
  };

  const ehPassado = Boolean(f.data) && f.data < hojeISO();
  const tentarSalvar = () => {
    if (ehPassado && !confirmarPassado) return setConfirmarPassado(true);
    salvar();
  };

  return (
    <Gaveta onClose={fechar} titulo="Novo agendamento">
      <h2 style={{ fontSize: 24, marginBottom: 18 }}>Novo agendamento</h2>

      {combos.length > 0 && (
        <div className="chips" style={{ marginBottom: 16 }}>
          {[['servico', 'Serviço'], ['combo', 'Promoção']].map(([k, rotulo]) => (
            <button key={k} type="button" className={'chip' + (tipo === k ? ' on' : '')}
                    onClick={() => trocarTipo(k)}>{rotulo}</button>
          ))}
        </div>
      )}

      {/* Escrever e filtrar, em vez de rolar a lista inteira: com trezentas
          clientes um <select> vira uma parede de nomes. */}
      <Campo label="Cliente">
        <SeletorCliente clientes={clientes} valor={f.cliente}
                        aoMudar={id => setF(v => ({ ...v, cliente: id }))} />
      </Campo>

      {ehCombo ? (
        <Campo label="Promoção">
          <select value={f.combo}
                  onChange={e => setF(v => ({ ...v, combo: e.target.value, prof: '', hora: '' }))}>
            {combos.map(c => (
              <option key={c.id} value={c.id}>
                {c.nome} — {brl(c.preco)} (economiza {brl(c.economia)})
              </option>
            ))}
          </select>
          {combo && (
            <span className="add-ajuda" style={{ marginTop: 5, display: 'block' }}>
              {combo.servicos.map(s => s.nome).join(' + ')} · a mesma pessoa faz tudo,
              em sequência.
            </span>
          )}
        </Campo>
      ) : (
        <>
          <Campo label="Serviço">
            <select value={f.servico}
                    onChange={e => setF(v => ({ ...v, servico: e.target.value, prof: '', hora: '', extras: [] }))}>
              {vendaveis.map(s => <option key={s.id} value={s.id}>{s.nome} — {brl(s.preco)}</option>)}
            </select>
          </Campo>

          {ofertados.length > 0 && (
            <Campo label="Incluir junto">
              <div className="chips">
                {ofertados.map(id => {
                  const x = dados.servicos.find(s => s.id === id);
                  if (!x) return null;
                  return (
                    <button key={id} type="button"
                            className={'chip chip-cat' + (f.extras.includes(id) ? ' on' : '')}
                            onClick={() => alternarExtra(id)}>
                      {x.nome} <span className="chip-n">{brl(x.preco)}</span>
                    </button>
                  );
                })}
              </div>
            </Campo>
          )}
        </>
      )}

      <div className="mrow">
        <Campo label="Profissional">
          <select value={prof?.id || ''}
                  onChange={e => setF(v => ({ ...v, prof: e.target.value, hora: '' }))}>
            {profs.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo label="Data">
          <CampoData valor={f.data}
                     aoMudar={d => { setConfirmarPassado(false); setF(v => ({ ...v, data: d, hora: '' })); }} />
        </Campo>
      </div>

      {profs.length === 0 && (
        <p className="add-ajuda">
          {ehCombo
            ? 'Ninguém faz todos os serviços desta promoção. Vincule alguém em Serviços.'
            : 'Ninguém está habilitado neste serviço.'}
        </p>
      )}

      <Campo label="Horário">
        {slots.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              Sem horário livre nesse dia para {prof?.nome.split(' ')[0] || 'ninguém'}.
            </p>
          : <div className="chips">
              {slots.map(h => (
                <button key={h} className={'chip slot' + (f.hora === h ? ' on' : '')}
                        onClick={() => setF(v => ({ ...v, hora: h }))}>{h}</button>
              ))}
            </div>}
      </Campo>

      {/* A ficha que o serviço pede. Sem isto, um serviço com anamnese
          obrigatória seria impossível de marcar pelo balcão: o servidor exige a
          resposta em todo agendamento, e é assim que tem de ser. */}
      {!ehCombo && (
        <Ficha servicoId={svc?.id} clienteId={f.cliente} valor={respostas}
               aoMudar={(formId, lista) => setRespostas(v => ({ ...v, [formId]: lista }))} />
      )}

      {/* O total e a duração, calculados — é o número que o balcão digitava na
          mão e errava. */}
      {duracao > 0 && (
        <div className="encaixe-conta">
          <span>{duracao} min</span>
          <b className="mono">{brl(total)}</b>
        </div>
      )}

      {/* A pergunta aparece no lugar do botão, e não numa janela em cima da
          janela: no celular um modal sobre o outro esconde o que se estava
          conferindo. Diz o que vai acontecer de verdade — o fechamento
          automático trata como feito e pago o que já passou da hora. */}
      {confirmarPassado ? (
        <div className="ag-passado">
          <b><TriangleAlert size={15} /> {dataPorExtensoBR(f.data)} já passou.</b>
          <p>
            Criar assim mesmo? Serve para registrar quem foi atendida sem ter
            agendado — o atendimento entra no histórico como feito e pago.
          </p>
          <div className="ag-passado-botoes">
            <button className="btn btn-g btn-s" type="button"
                    onClick={() => setConfirmarPassado(false)}>Voltar</button>
            <button className="btn btn-p btn-s" type="button" disabled={ocupado}
                    onClick={salvar}>
              {ocupado ? 'Criando…' : 'Sim, registrar'}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-p" style={{ width: '100%', marginTop: 8 }}
                disabled={ocupado || !f.cliente || !f.hora || !prof} onClick={tentarSalvar}>
          {ocupado ? 'Criando…' : ehCombo ? 'Agendar promoção' : 'Criar agendamento'}
        </button>
      )}
    </Gaveta>
  );
}

const MESES_BR = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** '2026-09-25' → '25 de setembro de 2026'. Por extenso porque é um aviso. */
const dataPorExtensoBR = iso => {
  const [a, m, d] = (iso || '').split('-').map(Number);
  return MESES_BR[m - 1] ? `${d} de ${MESES_BR[m - 1]} de ${a}` : iso;
};

/**
 * O histórico de anamneses da cliente, na ficha dela.
 *
 * **Não carrega junto com a ficha.** Abrir o cadastro para conferir o telefone
 * não pode baixar o histórico clínico de alguém — quem quer ler a anamnese
 * pede, e esse pedido fica registrado no servidor (ver `routes/clientes.js`).
 * O botão existe para que isso seja um ato, e não um efeito colateral.
 *
 * Antes disso, ler a ficha de saúde de uma cliente exigia lembrar em qual dia
 * ela foi respondida e abrir aquele atendimento no calendário. Ficha que
 * ninguém consegue achar não protege ninguém.
 */
function FichasDaCliente({ cliente, aviso }) {
  const [fichas, setFichas] = useState(null);
  const [carregando, setCarregando] = useState(false);

  // Trocar de cliente esquece o que estava aberto: sem isto, a anamnese de uma
  // apareceria por um instante na ficha da seguinte.
  useEffect(() => { setFichas(null); }, [cliente.id]);

  const abrir = async () => {
    setCarregando(true);
    try { setFichas(await api.fichasDaCliente(cliente.id)); }
    catch (e) { aviso?.(e.message); }
    finally { setCarregando(false); }
  };

  if (fichas === null) {
    return (
      <button className="btn btn-g btn-s" style={{ marginTop: 16 }}
              disabled={carregando} onClick={abrir}>
        <ClipboardList size={14} /> {carregando ? 'Abrindo…' : 'Ver fichas de saúde'}
      </button>
    );
  }

  if (!fichas.length) {
    return (
      <p style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
        Nenhuma ficha respondida — nem por ela, nem pela equipe.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Fichas de saúde · da mais recente
      </div>
      {fichas.map(f => (
        <div key={f.id} className="extras" style={{ marginBottom: 10 }}>
          <span className="eyebrow">
            {f.formulario}
            {/* A data importa: resposta de dois anos atrás não vale o mesmo
                que a de ontem, e sem ela ninguém sabe qual está lendo. */}
            {f.atendimento && ` · ${fmtDataLonga(f.atendimento.data)} · ${f.atendimento.servico}`}
          </span>
          {f.respostas.map((r, i) => (
            <div key={i} className="extras-li">
              <span>{r.rotulo}</span>
              <b>{formatarResposta(r.valor)}</b>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A ficha do atendimento: o que já foi respondido, e o formulário para
 * responder o que falta.
 *
 * **É aqui que a anamnese é preenchida**, desde que ela saiu do site
 * (2026-09-23): dado de saúde é sensível na LGPD, e quem pergunta é a
 * profissional com a cliente na cadeira. Antes disso, a ficha só existia se a
 * pessoa tivesse respondido sozinha na internet, o que era o problema.
 *
 * Carregada sob demanda, e não junto da agenda: trazê-la na listagem colocaria
 * a ficha de saúde de todo mundo no navegador de quem só queria ver os
 * horários do dia.
 */
function FichaRespondida({ agendamentoId, servicoId, clienteId, aviso }) {
  const [fichas, setFichas] = useState(null);
  const [temFormulario, setTemFormulario] = useState(false);
  const [respostas, setRespostas] = useState({});
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let valeu = true;
    api.respostasDoAgendamento(agendamentoId)
      .then(r => { if (valeu) { setFichas(r); setAbrindo(false); setRespostas({}); } })
      .catch(() => { if (valeu) setFichas([]); });
    return () => { valeu = false; };
  }, [agendamentoId]);

  // Só oferece preencher se o serviço PEDE ficha. Antes o botão aparecia em
  // todo atendimento e, em serviço sem formulário, abria um espaço vazio com
  // "Gravar ficha" — botão que promete uma tela que não existe.
  useEffect(() => {
    if (!servicoId) return setTemFormulario(false);
    let valeu = true;
    api.formulariosDoServico(servicoId)
      .then(fs => { if (valeu) setTemFormulario(fs.length > 0); })
      .catch(() => { if (valeu) setTemFormulario(false); });
    return () => { valeu = false; };
  }, [servicoId]);

  const gravar = async () => {
    setSalvando(true);
    try {
      setFichas(await api.responderFicha(agendamentoId, respostas));
      setAbrindo(false);
      setRespostas({});
    } catch (e) { aviso?.(e.message); }
    finally { setSalvando(false); }
  };

  if (fichas === null) return null;

  return (
    <>
      {fichas.map(f => (
        <div key={f.id} className="extras" style={{ marginBottom: 14 }}>
          <span className="eyebrow">{f.formulario}</span>
          {f.respostas.map((r, i) => (
            <div key={i} className="extras-li">
              <span>{r.rotulo}</span>
              <b>{formatarResposta(r.valor)}</b>
            </div>
          ))}
        </div>
      ))}

      {abrindo ? (
        <div style={{ marginBottom: 14 }}>
          <Ficha servicoId={servicoId} clienteId={clienteId} valor={respostas}
                 aoMudar={(formId, lista) => setRespostas(r => ({ ...r, [formId]: lista }))} />
          <div className="chips">
            <button className="btn btn-p btn-s" disabled={salvando} onClick={gravar}>
              {salvando ? 'Gravando…' : 'Gravar ficha'}
            </button>
            <button className="btn btn-g btn-s" onClick={() => setAbrindo(false)}>Cancelar</button>
          </div>
        </div>
      ) : temFormulario && (
        // "Responder de novo" e não "editar": resposta dada não se reescreve
        // (REVOKE UPDATE na migration 012) — corrigir é acrescentar a versão
        // nova, e as duas ficam no histórico com a data de cada uma.
        <button className="btn btn-g btn-s" style={{ marginBottom: 14 }}
                onClick={() => setAbrindo(true)}>
          <ClipboardList size={14} /> {fichas.length ? 'Responder de novo' : 'Preencher a ficha'}
        </button>
      )}
    </>
  );
}

const formatarResposta = v =>
  v === true ? 'sim' : v === false ? 'não' : Array.isArray(v) ? v.join(', ') : String(v);

/* ── Clientes ── */
function Clientes({ dados, acao, aviso }) {
  const { clientes, agendamentos, servicos, config, templates } = dados;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);

  const enriquecidos = useMemo(() => clientes.map(c => {
    const meus = agendamentos.filter(a => a.cliente === c.id && a.status !== 'cancelado');
    const passados = meus.filter(a => a.data <= hojeISO()).sort((a, b) => b.data.localeCompare(a.data));
    const gasto = meus.filter(a => a.pagamento.status === 'pago').reduce((s, a) => s + a.valor, 0);
    const ultima = passados[0]?.data;
    return { ...c, visitas: passados.length, gasto, ultima, diasSem: ultima ? diasEntre(ultima, hojeISO()) : null };
  }).sort((a, b) => a.nome.localeCompare(b.nome)), [clientes, agendamentos]);

  const filtrados = enriquecidos.filter(c => c.nome.toLowerCase().includes(q.toLowerCase()) || soDigitos(c.fone).includes(soDigitos(q)));

  return (
    <>
      <div className="head">
        <div><h2>Clientes</h2><div className="sub">{clientes.length} cadastradas · cadastro feito uma vez, no primeiro agendamento</div></div>
        <button className="btn btn-p btn-s" onClick={() => setEdit({ nome: '', fone: '', nasc: '', end: '', obs: '' })}><Plus size={16} /> Nova cliente</button>
      </div>
      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 380 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--muted)' }} />
        <input placeholder="Buscar por nome ou WhatsApp" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>
      <div className="card list">
        {filtrados.map(c => (
          <div key={c.id} className="li">
            <div className="avatar" style={{ background: c.diasSem > 60 ? '#B08' : 'var(--ink2)' }}>{iniciais(c.nome)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nm">{c.nome}</div>
              <div className="mt">
                <span className="mono">{fmtFone(c.fone)}</span>
                <span>{c.visitas} visitas</span>
                <span>{brl(c.gasto)}</span>
                {c.ultima && <span style={{ color: c.diasSem > 60 ? '#A32A4E' : 'inherit' }}>há {c.diasSem}d</span>}
              </div>
            </div>
            <button className="btn btn-g btn-s" onClick={() => setSel(c)}>Ficha</button>
            <a className="btn btn-wa btn-s" href={waLink(c.fone, `Oi ${c.nome.split(' ')[0]}! `)} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /></a>
          </div>
        ))}
        {filtrados.length === 0 && <div style={{ padding: 34, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Nenhuma cliente com esse nome ou número.</div>}
      </div>

      {sel && (() => {
        const hist = agendamentos.filter(a => a.cliente === sel.id).sort((a, b) => b.data.localeCompare(a.data));
        return (
          <Modal onClose={() => setSel(null)} wide>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
              <div className="avatar" style={{ width: 52, height: 52, fontSize: 18, background: 'var(--ink2)' }}>{iniciais(sel.nome)}</div>
              <div>
                <h2 style={{ fontSize: 26 }}>{sel.nome}</h2>
                <div style={{ fontSize: 13, color: 'var(--muted)' }} className="mono">{fmtFone(sel.fone)}</div>
              </div>
            </div>
            <div className="stats" style={{ marginBottom: 18 }}>
              <div className="card stat"><span className="eyebrow">Visitas</span><span className="v">{sel.visitas}</span></div>
              <div className="card stat"><span className="eyebrow">Total gasto</span><span className="v">{brl(sel.gasto)}</span></div>
              <div className="card stat"><span className="eyebrow">Aniversário</span><span className="v" style={{ fontSize: 20 }}>{sel.nasc ? fmtDataLonga(sel.nasc).slice(0, 5) : '—'}</span></div>
            </div>
            <div className="card" style={{ padding: 14, fontSize: 13.5, lineHeight: 1.7, marginBottom: 16 }}>
              <div><MapPin size={13} style={{ verticalAlign: -2 }} /> {sel.end || 'Endereço não informado'}</div>
              {sel.obs && <div style={{ marginTop: 4 }}>📌 {sel.obs}</div>}
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Histórico</div>
            <div className="card list" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {hist.map(a => {
                const s = servicos.find(x => x.id === a.servico);
                return (
                  <div key={a.id} className="li" style={{ padding: '10px 14px' }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--muted)', width: 84 }}>{fmtDataLonga(a.data)}</span>
                    <span style={{ flex: 1, fontSize: 14 }}>{s?.nome}</span>
                    <span className="mono" style={{ fontSize: 13 }}>{brl(a.valor)}</span>
                    {a.status === 'falta' && <span className="tag" style={{ background: '#F3E6E6', color: 'var(--erro)' }}>faltou</span>}
                  </div>
                );
              })}
              {hist.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Ainda sem atendimentos.</div>}
            </div>
            <FichasDaCliente cliente={sel} aviso={aviso} />

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <a className="btn btn-wa" href={waLink(sel.fone, `Oi ${sel.nome.split(' ')[0]}! `)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> WhatsApp</a>
              <button className="btn btn-g" onClick={() => { setEdit(sel); setSel(null); }}><Pencil size={16} /> Editar cadastro</button>
            </div>
          </Modal>
        );
      })()}

      {edit && <EditarCliente c={edit} acao={acao} fechar={() => setEdit(null)} aviso={aviso} />}
    </>
  );
}

function EditarCliente({ c, acao, fechar, aviso }) {
  const [f, setF] = useState({ nome: c.nome, fone: c.fone, nasc: c.nasc || '', end: c.end || '', obs: c.obs || '' });
  const salvar = async () => {
    const ok = await acao(() => api.salvarCliente({ ...c, ...f, fone: soDigitos(f.fone) }), 'Cadastro salvo');
    if (ok) fechar();
  };
  return (
    <Modal onClose={fechar}>
      <h2 style={{ fontSize: 24, marginBottom: 18 }}>{c.id ? 'Editar cadastro' : 'Nova cliente'}</h2>
      <Campo label="Nome completo"><input value={f.nome} onChange={e => setF(v => ({ ...v, nome: e.target.value }))} /></Campo>
      <div className="mrow">
        <Campo label="WhatsApp"><input value={fmtFone(f.fone)} onChange={e => setF(v => ({ ...v, fone: soDigitos(e.target.value) }))} /></Campo>
        <Campo label="Nascimento">
          <CampoData valor={f.nasc} aoMudar={d => setF(v => ({ ...v, nasc: d }))} />
        </Campo>
      </div>
      <Campo label="Endereço"><input value={f.end} onChange={e => setF(v => ({ ...v, end: e.target.value }))} /></Campo>
      <Campo label="Observações"><textarea rows={2} value={f.obs} onChange={e => setF(v => ({ ...v, obs: e.target.value }))} placeholder="Alergias, preferências, cuidados" /></Campo>
      <button className="btn btn-p" style={{ width: '100%' }} disabled={f.nome.trim().length < 3} onClick={salvar}>Salvar</button>
    </Modal>
  );
}


/* ── CRM / WhatsApp ── */
function CRM({ dados, acao, aviso, fila, recarregarFila }) {
  const [sub, setSub] = useState('fila');
  const [edit, setEdit] = useState(null);
  const { templates, clientes } = dados;
  const pendentes = fila.itens;

  const enviar = async (m) => {
    window.open(m.link, '_blank', 'noopener');
    try { await api.marcarEnviada(m.id); } catch { /* ignora */ }
    recarregarFila();
  };
  const pular = async (id) => {
    try { await api.pularMensagem(id); } catch { /* ignora */ }
    recarregarFila();
  };

  return (
    <>
      <div className="head">
        <div><h2>WhatsApp</h2><div className="sub">Mensagens automáticas e campanhas para a base de clientes</div></div>
        <div className="chips">
          <button className={'chip' + (sub === 'fila' ? ' on' : '')} onClick={() => setSub('fila')}>Fila de hoje ({pendentes.length})</button>
          <button className={'chip' + (sub === 'auto' ? ' on' : '')} onClick={() => setSub('auto')}>Automações</button>
          <button className={'chip' + (sub === 'camp' ? ' on' : '')} onClick={() => setSub('camp')}>Campanhas</button>
        </div>
      </div>

      {sub === 'fila' && (
        <>
          <div className="card" style={{ padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.55, background: '#F3F0F7', borderColor: '#D9D1EC' }}>
            <b>Como funciona no sistema real:</b> essas mensagens saem sozinhas pela API oficial do WhatsApp Business, nos horários programados.
            Aqui na demonstração cada uma tem um botão que abre a conversa já com o texto pronto, pra você conferir o tom antes de automatizar.
          </div>
          {pendentes.length === 0
            ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Fila zerada. Nada para enviar hoje.</div>
            : pendentes.map(f => (
              <div key={f.id} className="card" style={{ padding: 16, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div className="avatar" style={{ background: 'var(--uv)', width: 34, height: 34 }}><Bell size={16} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{f.clienteNome}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.titulo} · <span className="mono">{fmtFone(f.fone)}</span> · programada {f.agendadoPara.slice(11)}</div>
                  </div>
                  <button className="btn btn-wa btn-s" onClick={() => enviar(f)}>
                    <Send size={14} /> Enviar
                  </button>
                  <button className="btn btn-g btn-s" onClick={() => pular(f.id)}>Pular</button>
                </div>
                <div className="bubble" style={{ background: '#F4F0F1' }}>{f.texto}</div>
              </div>
            ))}
        </>
      )}

      {(sub === 'auto' || sub === 'camp') && (
        <div style={{ display: 'grid', gap: 12 }}>
          {templates.filter(t => t.tipo === (sub === 'auto' ? 'auto' : 'campanha')).map(t => (
            <div key={t.id} className="card auto">
              <div className="auto-l">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <h3 style={{ fontSize: 19, flex: 1 }}>{t.titulo}</h3>
                  <Switch on={t.ativo} onChange={() => acao(() => api.salvarTemplate(t.id, { ativo: !t.ativo }))} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={13} /> {t.quando}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  <button className="btn btn-g btn-s" onClick={() => setEdit(t)}><Pencil size={14} /> Editar texto</button>
                  {t.tipo === 'campanha' && (
                    <button className="btn btn-d btn-s" onClick={() => setEdit({ ...t, disparo: true })}>
                      <Megaphone size={14} /> Disparar para {clientes.length} clientes
                    </button>
                  )}
                </div>
              </div>
              <div className="auto-r">
                <div className="eyebrow">Prévia</div>
                <div className="bubble">{t.texto}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (edit.disparo
        ? <Disparo t={edit} dados={dados} fechar={() => setEdit(null)} recarregarFila={recarregarFila} aviso={aviso} />
        : <EditarTemplate t={edit} acao={acao} fechar={() => setEdit(null)} aviso={aviso} />)}
    </>
  );
}

function EditarTemplate({ t, acao, fechar, aviso }) {
  const [txt, setTxt] = useState(t.texto);
  const VARS = ['cliente', 'servico', 'profissional', 'data', 'hora', 'valor', 'estudio', 'endereco', 'link', 'dias'];
  const ref = useRef(null);
  const inserir = v => {
    const el = ref.current; const p = el.selectionStart;
    setTxt(txt.slice(0, p) + `{${v}}` + txt.slice(el.selectionEnd));
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = p + v.length + 2; }, 0);
  };
  return (
    <Modal onClose={fechar} wide>
      <h2 style={{ fontSize: 24, marginBottom: 4 }}>{t.titulo}</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>{t.quando}</p>
      <Campo label="Mensagem">
        <textarea ref={ref} rows={9} value={txt} onChange={e => setTxt(e.target.value)} style={{ lineHeight: 1.6 }} />
      </Campo>
      <Campo label="Inserir informação da cliente">
        <div className="chips">{VARS.map(v => <button key={v} className="chip btn-s mono" style={{ fontSize: 12 }} onClick={() => inserir(v)}>{'{' + v + '}'}</button>)}</div>
      </Campo>
      <button className="btn btn-p" style={{ width: '100%' }} onClick={async () => { await acao(() => api.salvarTemplate(t.id, { texto: txt }), 'Mensagem salva'); fechar(); }}>
        Salvar mensagem
      </button>
    </Modal>
  );
}

function Disparo({ t, dados, fechar, recarregarFila, aviso }) {
  const { clientes, config, agendamentos, servicos } = dados;
  const [sel, setSel] = useState(clientes.map(c => c.id));
  const toggle = id => setSel(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
  const texto = c => renderTemplate(t.texto, {
    cliente: c.nome.split(' ')[0], empresa: config.nome, estudio: config.nome, endereco: config.endereco,
    data: fmtData(hojeISO()), hora: '15:00', servico: servicos[0].nome, valor: brl(servicos[0].preco), link: 'g.page/estudiolume', profissional: '', dias: '',
  });
  return (
    <Modal onClose={fechar} wide>
      <h2 style={{ fontSize: 24, marginBottom: 4 }}>{t.titulo}</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Escolha quem recebe. {sel.length} de {clientes.length} selecionadas.</p>
      <div className="card list" style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
        {clientes.map(c => (
          <div key={c.id} className="li" style={{ padding: '10px 14px' }}>
            <button className={'chip' + (sel.includes(c.id) ? ' on' : '')} style={{ width: 34, height: 34, padding: 0, justifyContent: 'center' }} onClick={() => toggle(c.id)}>
              {sel.includes(c.id) ? <Check size={15} /> : ''}
            </button>
            <span style={{ flex: 1, fontSize: 14 }}>{c.nome}</span>
            <a className="btn btn-wa btn-s" href={waLink(c.fone, texto(c))} target="_blank" rel="noopener noreferrer"><Send size={14} /></a>
            {!c.optin && <span className="tag" style={{ background: '#EEE', color: '#777' }}>sem opt-in</span>}
          </div>
        ))}
      </div>
      <button className="btn btn-p" style={{ width: '100%', marginBottom: 12 }}
        onClick={async () => {
          try {
            const r = await api.dispararCampanha(t.chave, sel);
            aviso(`${r.enfileiradas} mensagens na fila${r.ignoradas ? ` · ${r.ignoradas} ignoradas` : ''}`);
            recarregarFila(); fechar();
          } catch (e) { aviso(e.message); }
        }}>
        <Megaphone size={16} /> Colocar {sel.length} na fila
      </button>
      <div className="card" style={{ padding: 13, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
        Quem não deu opt-in fica de fora automaticamente. Com a API oficial, campanha exige template aprovado pela Meta na categoria marketing.
      </div>
    </Modal>
  );
}

