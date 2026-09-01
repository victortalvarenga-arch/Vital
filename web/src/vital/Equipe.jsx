import { useCallback, useEffect, useState } from 'react';
import {
  Ban, Building2, Check, ExternalLink, LifeBuoy, LogIn, LogOut, PlayCircle, Reply, ScrollText, TriangleAlert,
} from 'lucide-react';
import { api } from './api.js';

/**
 * Back-office da Vital: quem são as empresas-cliente e como elas estão.
 *
 * O que esta tela **não** mostra, e nunca vai mostrar: dado de cliente de
 * nenhuma empresa. O servidor devolve só contagens — a função que as calcula
 * ignora o Row-Level Security de propósito, e o acordo de ela devolver número e
 * não linha é o que mantém o isolamento de pé por dentro daqui. Ver
 * `ARQUITETURA.md`.
 */
export default function Equipe() {
  const [sessao, setSessao] = useState(null);   // null = checando; false = fora

  useEffect(() => { api.eu().then(setSessao).catch(() => setSessao(false)); }, []);

  if (sessao === null) return <Centro><p className="v-fraco">Carregando…</p></Centro>;
  if (sessao === false) return <Entrar aoEntrar={setSessao} />;
  return <Painel sessao={sessao} aoSair={() => setSessao(false)} />;
}

const Centro = ({ children }) => (
  <div className="v-pagina"><main className="v-conteudo v-conteudo-centro">{children}</main></div>
);

/* ── entrar ─────────────────────────────────────────────────────────────── */

function Entrar({ aoEntrar }) {
  const [modo, setModo] = useState(null);
  const [f, setF] = useState({ nome: '', email: '', senha: '' });
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api.precisaConfigurar()
      .then(r => setModo(r.precisa ? 'primeiro' : 'login'))
      .catch(() => setModo('login'));
  }, []);

  const enviar = async e => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      aoEntrar(modo === 'primeiro'
        ? await api.primeiroAcesso(f)
        : await api.login(f.email, f.senha));
    } catch (erro) { setErro(erro.message); setOcupado(false); }
  };

  if (!modo) return <Centro><p className="v-fraco">Carregando…</p></Centro>;
  const primeiro = modo === 'primeiro';

  return (
    <Centro>
      <form className="v-caixa" onSubmit={enviar} style={{ maxWidth: 400 }}>
        <span className="v-marca" style={{ marginBottom: 10, display: 'block' }}>Vital</span>
        <h2>{primeiro ? 'Criar o acesso da equipe' : 'Equipe Vital'}</h2>
        <p className="v-sub" style={{ fontSize: 13.5 }}>
          {primeiro
            ? 'A plataforma ainda não tem ninguém. Quem criar agora vira administrador.'
            : 'Este acesso é o nosso, e não abre o painel de nenhuma empresa-cliente.'}
        </p>

        {primeiro && (
          <div className="v-campo">
            <label htmlFor="e-nome">Seu nome</label>
            <input id="e-nome" required autoComplete="name" value={f.nome}
                   onChange={e => setF(v => ({ ...v, nome: e.target.value }))} />
          </div>
        )}
        <div className="v-campo">
          <label htmlFor="e-email">E-mail</label>
          <input id="e-email" type="email" required autoComplete="username" value={f.email}
                 onChange={e => setF(v => ({ ...v, email: e.target.value }))} />
        </div>
        <div className="v-campo">
          <label htmlFor="e-senha">Senha</label>
          <input id="e-senha" type="password" required minLength={primeiro ? 8 : undefined}
                 autoComplete={primeiro ? 'new-password' : 'current-password'} value={f.senha}
                 onChange={e => setF(v => ({ ...v, senha: e.target.value }))} />
        </div>

        {erro && <p className="v-erro"><TriangleAlert size={15} /> {erro}</p>}

        <button className="v-btn" type="submit" disabled={ocupado}>
          <LogIn size={17} /> {ocupado ? 'Entrando…' : primeiro ? 'Criar e entrar' : 'Entrar'}
        </button>
      </form>
    </Centro>
  );
}

/* ── o painel ───────────────────────────────────────────────────────────── */

function Painel({ sessao, aoSair }) {
  const [empresas, setEmpresas] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [rastro, setRastro] = useState([]);
  const [aba, setAba] = useState('empresas');
  const [tickets, setTickets] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setEmpresas(await api.empresas());
      setResumo(await api.resumo());
      setRastro(await api.auditoria());
      setTickets(await api.tickets());
    } catch (e) { setErro(e.message); setEmpresas([]); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2600);
    return () => clearTimeout(t);
  }, [aviso]);

  const acao = async (fn, mensagem) => {
    try { await fn(); await carregar(); setAviso(mensagem); }
    catch (e) { setErro(e.message); }
  };

  const trocarStatus = async e => {
    const suspender = e.status === 'ativa';
    const motivo = suspender
      ? prompt(`Suspender "${e.nome}"?\n\nO site e o painel dela param de responder na hora. Nada é apagado.\n\nMotivo (fica registrado):`)
      : null;
    if (suspender && motivo === null) return;
    await acao(
      () => api.mudarStatus(e.id, suspender ? 'suspensa' : 'ativa', motivo),
      suspender ? 'Empresa suspensa' : 'Empresa reativada'
    );
  };

  const trocarPlano = async e => {
    const plano = prompt(`Plano de "${e.nome}":`, e.plano);
    if (!plano || plano === e.plano) return;
    await acao(() => api.mudarPlano(e.id, plano.trim()), 'Plano atualizado');
  };

  const abertos = tickets.filter(t => t.status !== 'fechado').length;

  const responder = async t => {
    const texto = prompt(`Responder "${t.assunto}"

de ${t.empresa} · ${t.autor}

${t.mensagem}

Sua resposta:`, t.resposta || '');
    if (texto === null || !texto.trim()) return;
    await acao(() => api.responderTicket(t.id, { resposta: texto.trim() }), 'Chamado respondido');
  };

  return (
    <div className="v-pagina">
      <header className="v-topo">
        <span className="v-marca">Vital</span>
        <nav className="v-abas">
          <button className={aba === 'empresas' ? 'on' : ''} onClick={() => setAba('empresas')}>
            <Building2 size={15} /> Empresas
          </button>
          <button className={aba === 'suporte' ? 'on' : ''} onClick={() => setAba('suporte')}>
            <LifeBuoy size={15} /> Suporte
            {/* O número é a fila, não o total: chamado fechado não pede nada. */}
            {abertos > 0 && <span className="v-badge">{abertos}</span>}
          </button>
          <button className={aba === 'rastro' ? 'on' : ''} onClick={() => setAba('rastro')}>
            <ScrollText size={15} /> Registro
          </button>
        </nav>
        <button className="v-topo-link" onClick={async () => { await api.sair(); aoSair(); }}>
          <LogOut size={15} /> {sessao.usuario.nome.split(' ')[0]}
        </button>
      </header>

      <main className="v-conteudo v-conteudo-largo">
        {resumo && aba === 'empresas' && (
          <div className="v-numeros">
            <Numero rotulo="Empresas ativas" valor={resumo.empresas.ativas}
                    nota={resumo.empresas.suspensas ? `${resumo.empresas.suspensas} suspensa(s)` : null} />
            <Numero rotulo="Clientes finais" valor={resumo.clientesFinais} />
            <Numero rotulo="Agendamentos no mês" valor={resumo.agendamentosNoMes} />
            {/* O número que diz se o produto pegou: quem se cadastrou e nunca
                usou cancela antes de virar cliente de verdade. */}
            <Numero rotulo="Nunca agendaram" valor={resumo.semNenhumAgendamento}
                    alerta={resumo.semNenhumAgendamento > 0} />
          </div>
        )}

        {aba === 'empresas' && (
          <>
            {empresas === null && <p className="v-fraco">Carregando…</p>}
            {empresas?.length === 0 && <p className="v-fraco">Nenhuma empresa cadastrada ainda.</p>}

            <div className="v-tabela">
              {empresas?.map(e => (
                <article key={e.id} className={'v-empresa' + (e.status !== 'ativa' ? ' off' : '')}>
                  <div className="v-empresa-id">
                    <h3>
                      {e.nome}
                      {e.status !== 'ativa' && <span className="v-tag">{e.status}</span>}
                    </h3>
                    <span className="v-endereco-linha">
                      {/* Os dois destinos que a gente de fato abre ao dar
                          suporte: o site que a cliente dela vê, e o painel em
                          que ela trabalha. Sem isto, era copiar o endereço à
                          mão e torcer para acertar o subdomínio. */}
                      <a className="v-link" href={e.url} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} /> site
                      </a>
                      <a className="v-link" href={`${e.url}/painel.html`} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} /> painel
                      </a>
                      <span>desde {e.desde}</span>
                    </span>
                  </div>

                  <dl className="v-empresa-numeros">
                    <div><dt>Clientes</dt><dd>{e.clientes}</dd></div>
                    <div><dt>Equipe</dt><dd>{e.profissionais}</dd></div>
                    <div><dt>Serviços</dt><dd>{e.servicos}</dd></div>
                    <div><dt>Agend./mês</dt><dd>{e.agendamentosNoMes}</dd></div>
                  </dl>

                  <div className="v-empresa-acoes">
                    <button className="v-plano" onClick={() => trocarPlano(e)}
                            disabled={!sessao.poderes.suspender} title="Mudar o plano">
                      {e.plano}
                    </button>
                    {sessao.poderes.suspender && (
                      <button className="v-acao" onClick={() => trocarStatus(e)}>
                        {e.status === 'ativa'
                          ? <><Ban size={14} /> Suspender</>
                          : <><PlayCircle size={14} /> Reativar</>}
                      </button>
                    )}
                  </div>

                  {!e.ultimoMovimento && (
                    <p className="v-empresa-nota">
                      <TriangleAlert size={13} /> Nunca teve um agendamento.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

        {aba === 'suporte' && (
          <div className="v-tabela">
            <p className="v-sub" style={{ fontSize: 13.5 }}>
              Chamados abertos pelas empresas de dentro do painel delas. Cada um
              já vem com o nome da empresa e de quem escreveu — não é preciso
              perguntar quem é.
            </p>
            {tickets.length === 0 && <p className="v-fraco">Nenhum chamado até agora.</p>}
            {tickets.map(t => (
              <div key={t.id} className={'v-ticket' + (t.status === 'fechado' ? ' fechado' : '')}>
                <div className="v-ticket-topo">
                  <b>{t.assunto}</b>
                  <span className={'v-ticket-estado ' + t.status}>{
                    { aberto: 'aguardando', respondido: 'respondido', fechado: 'fechado' }[t.status]
                  }</span>
                  <span className="v-fraco">{t.empresa} · {t.autor}</span>
                  <span className="v-ticket-quando">{new Date(t.criadoEm).toLocaleString('pt-BR')}</span>
                </div>
                <p className="v-ticket-msg">{t.mensagem}</p>
                {t.resposta && <p className="v-ticket-resposta">{t.resposta}</p>}
                <div className="v-ticket-acoes">
                  <button className="v-acao" onClick={() => responder(t)}>
                    <Reply size={14} /> {t.resposta ? 'Editar resposta' : 'Responder'}
                  </button>
                  {t.status !== 'fechado' && (
                    <button className="v-acao" onClick={() =>
                      acao(() => api.responderTicket(t.id, { status: 'fechado' }), 'Chamado fechado')}>
                      <Check size={14} /> Fechar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {aba === 'rastro' && (
          <div className="v-tabela">
            <p className="v-sub" style={{ fontSize: 13.5 }}>
              Toda ação nossa sobre uma empresa fica registrada, e o nascimento
              de cada empresa também. Abrir o dado de alguém para dar suporte é
              legítimo; fazer isso sem deixar rastro, não.
            </p>
            <p className="v-nota" style={{ marginBottom: 14 }}>
              Empresas anteriores a este painel não têm registro de criação — a
              data de entrada delas está na lista. Nada é inventado aqui.
            </p>
            {rastro.length === 0 && <p className="v-fraco">Nada registrado ainda.</p>}
            {rastro.map(l => (
              <div key={l.id} className="v-rastro">
                <span className="v-rastro-acao">{l.acao}</span>
                <span>{l.empresa || '—'}</span>
                {/* Empresa nascendo não tem "quem" da nossa equipe: quem fez
                    foi ela, pelo auto-cadastro. O `origem` diz por onde. */}
                <span className="v-fraco">{l.detalhe?.origem || l.usuario}</span>
                <span className="v-fraco">{new Date(l.quando).toLocaleString('pt-BR')}</span>
                {l.detalhe?.motivo && <span className="v-rastro-motivo">“{l.detalhe.motivo}”</span>}
              </div>
            ))}
          </div>
        )}
      </main>

      {aviso && <div className="v-toast"><Check size={16} /> {aviso}</div>}
      {erro && <div className="v-toast erro" onClick={() => setErro(null)}><TriangleAlert size={16} /> {erro}</div>}
    </div>
  );
}

const Numero = ({ rotulo, valor, nota, alerta }) => (
  <div className={'v-numero' + (alerta ? ' alerta' : '')}>
    <span className="v-numero-rotulo">{rotulo}</span>
    <strong>{valor}</strong>
    {nota && <span className="v-numero-nota">{nota}</span>}
  </div>
);
