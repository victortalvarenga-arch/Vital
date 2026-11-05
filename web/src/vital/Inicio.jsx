import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, CalendarCheck, Check, ChevronDown, Clock, Headset, Heart, Link2, ShieldCheck, User,
} from 'lucide-react';
import { FormCadastro, Pronto } from './Cadastro.jsx';
import telaAgenda from './telas/painel-agenda.webp';
import telaResumoCelular from './telas/painel-celular.webp';
import telaFinanceiro from './telas/painel-financeiro.webp';
import telaAgendar from './telas/site-agendar-celular.webp';
import telaEssencialDesk from './telas/site-essencial.webp';
import telaGaleriaDesk from './telas/site-galeria.webp';
import telaSerenaDesk from './telas/site-serena.webp';
import telaEssencial from './telas/site-essencial-celular.webp';
import telaGaleria from './telas/site-galeria-celular.webp';
import telaSerena from './telas/site-serena-celular.webp';
import './inicio.css';

/**
 * A página de apresentação da Vital — o que se vê ao abrir o domínio raiz.
 *
 * **As imagens são telas de verdade** (decisão do dono, 2026-11-02), não mais
 * desenhos em HTML: o painel, o site e o agendamento do "Studio Aurora", uma
 * empresa de estética inventada que existe só no banco de desenvolvimento.
 * Nem a Laura Faust (pessoa real, CLAUDE.md) nem a Barbearia do João (faria a
 * Vital parecer coisa de barbearia) servem para isso. As fotos são refeitas
 * por `web/scripts/vitrine/` — ver `telas/ORIGEM.md` — e a legenda da abertura
 * diz que o negócio é de exemplo.
 *
 * Regra do texto: só se promete o que existe. Nada de depoimento, nota, logo
 * de cliente ou número de uso (PRODUCT.md, "Evidence on Hand"). Mensagem de
 * WhatsApp é "pronta para enviar", não "enviada sozinha" (o envio automático é
 * o Bloco 12), e pagamento online não aparece porque não existe. A conta do
 * "horário vazio" usa os números que a pessoa digita, nunca uma estatística
 * nossa.
 */

/**
 * O preço da página. PROVISÓRIO: o dono ainda não decidiu o valor, e a Vital
 * ainda não cobra (ver ROADMAP.md). Trocar aqui troca em todo lugar da página.
 */
const PRECO = 89;

export default function Inicio() {
  const [pronto, setPronto] = useState(null);
  const abertura = useRef(null);
  const cadastro = useRef(null);
  const fixo = useBotaoFixo(abertura, cadastro);

  if (pronto) return <Pronto dados={pronto} />;

  return (
    <div className="lp">
      <a className="lp-pular" href="#criar">Pular para o cadastro</a>
      <Topo />
      <main>
        <Abertura refAbertura={abertura} />
        <Conta />
        <ComoFunciona />
        <SiteDaMarca />
        <Painel />
        <Vinculo />
        <Financeiro />
        <Equipe />
        <Preco />
        <Comecar refCadastro={cadastro} aoCriar={setPronto} />
        <Duvidas />
        <Chamada />
      </main>
      <Rodape />
      {/* No celular o botão de cadastro acompanha a leitura: some na abertura,
          que já tem o dela, e no próprio formulário. */}
      <a className={'lp-fixo' + (fixo ? ' on' : '')} href="#criar" aria-hidden={!fixo} tabIndex={fixo ? 0 : -1}>
        Criar minha agenda <ArrowRight size={17} />
      </a>
    </div>
  );
}

/** Mostra o botão fixo quando nem a abertura nem o cadastro estão à vista. */
function useBotaoFixo(abertura, cadastro) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const vistos = new Map();
    const obs = new IntersectionObserver(entradas => {
      entradas.forEach(e => vistos.set(e.target, e.isIntersecting));
      setVisivel(![...vistos.values()].some(Boolean));
    });
    [abertura.current, cadastro.current].forEach(el => { if (el) { vistos.set(el, true); obs.observe(el); } });
    return () => obs.disconnect();
  }, [abertura, cadastro]);
  return visivel;
}

/** A estrela de quatro pontas da marca. */
function Estrela({ size = 18, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 1c.6 5.8 2.2 9.4 11 11-8.8 1.6-10.4 5.2-11 11-.6-5.8-2.2-9.4-11-11 8.8-1.6 10.4-5.2 11-11z" />
    </svg>
  );
}

function Marca() {
  return <span className="lp-marca"><Estrela size={17} /> vital</span>;
}

const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/* ── molduras: as telas reais dentro de um navegador e de um celular ── */

function Navegador({ src, alt, endereco, largura = 1920, altura = 1230, carregar = 'lazy', className = '' }) {
  return (
    <figure className={'lp-navegador ' + className}>
      <div className="lp-navegador-barra" aria-hidden="true">
        <i /><i /><i /><span>{endereco}</span>
      </div>
      <img src={src} alt={alt} width={largura} height={altura} loading={carregar} decoding="async" />
    </figure>
  );
}

function Celular({ src, alt, carregar = 'lazy', className = '' }) {
  return (
    <figure className={'lp-celular ' + className}>
      <img src={src} alt={alt} width={780} height={1688} loading={carregar} decoding="async" />
    </figure>
  );
}

function Topo() {
  return (
    <header className="lp-topo">
      <div className="lp-topo-in">
        <a href="#" className="lp-topo-marca" aria-label="Vital, início"><Marca /></a>
        <nav className="lp-nav" aria-label="Seções">
          <a href="#como-funciona">Como funciona</a>
          <a href="#seu-site">Recursos</a>
          <a href="#preco">Preço</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>
        <a className="lp-btn lp-btn-p" href="#criar">Criar minha agenda</a>
      </div>
    </header>
  );
}

/* ── abertura ── */

function Abertura({ refAbertura }) {
  return (
    <section className="lp-abertura" ref={refAbertura}>
      <div className="lp-in lp-abertura-in">
        <div className="lp-abertura-texto">
          <h1>Pare de perder clientes no <em>WhatsApp.</em></h1>
          <p className="lp-lead">
            Sua cliente marca sozinha pelo seu site, a qualquer hora. Você abre o
            painel e vê o dia inteiro: quem vem, quem confirmou e quanto entrou.
          </p>
          <p className="lp-lead-2">Para estética, salão, barbearia e todo negócio que vive de horário marcado.</p>
          <div className="lp-acoes">
            <a className="lp-btn lp-btn-p lp-btn-g" href="#criar">Criar minha agenda <ArrowRight size={17} /></a>
            <a className="lp-link" href="#como-funciona">Ver como funciona</a>
          </div>
          <ul className="lp-garantias">
            <li><Check size={14} /> Sem cartão para começar</li>
            <li><Check size={14} /> No ar no mesmo dia</li>
            <li><Check size={14} /> {brl(PRECO)} por mês, tudo incluso</li>
          </ul>
        </div>

        <div className="lp-vitrine">
          <Navegador className="lp-vitrine-tela" src={telaAgenda} carregar="eager"
                     endereco="studioaurora.vital.app/painel"
                     alt="Agenda do dia no painel da Vital: três profissionais lado a lado, a cliente em atendimento marcada como Agora, as próximas como Próxima e os horários fechados em vermelho." />
          <Celular className="lp-vitrine-cel" src={telaAgendar} carregar="eager"
                   alt="Site de agendamento no celular: calendário do mês e os horários livres do dia escolhido." />
          <p className="lp-legenda">Telas reais da Vital. O Studio Aurora é um negócio de exemplo.</p>
        </div>
      </div>
    </section>
  );
}

/* ── a conta do horário vazio ── */

/**
 * Quanto a pessoa perde por mês com horário que não vira atendimento, com os
 * números DELA. Não há estatística nossa aqui de propósito: a Vital não tem
 * dado de uso para prometer redução de falta, e a conta convence melhor sendo
 * do próprio negócio. O que se afirma é só aritmética — quantos horários
 * recuperados pagam o plano.
 */
function Conta() {
  const [perdidos, setPerdidos] = useState(3);
  const [valor, setValor] = useState(120);
  const porMes = Math.round(perdidos * valor * 4.3 / 10) * 10;
  const pagam = Math.max(1, Math.ceil(PRECO / valor));

  return (
    <section className="lp-sec lp-conta" aria-labelledby="conta-t">
      <div className="lp-in lp-conta-in">
        <div className="lp-conta-texto">
          <h2 id="conta-t">Quanto custa um horário vazio?</h2>
          <p className="lp-texto">
            A cliente que esqueceu. A mensagem que você só viu às onze da noite. O
            horário que ficou parado porque ninguém confirmou. Faça a conta do seu
            negócio.
          </p>
          <ul className="lp-lista">
            <li><Check size={16} /> O site fica aberto 24 horas: ela marca quando lembra, não quando você responde.</li>
            <li><Check size={16} /> Confirmação e lembrete saem prontos para enviar no WhatsApp.</li>
            <li><Check size={16} /> Só aparece horário livre de verdade. Nada de encaixe que dá errado.</li>
          </ul>
        </div>

        <div className="lp-calc">
          <label className="lp-calc-campo">
            <span>Horários que ficam vazios por semana <b>{perdidos}</b></span>
            <input type="range" min={1} max={20} value={perdidos}
                   onChange={e => setPerdidos(Number(e.target.value))} />
          </label>
          <label className="lp-calc-campo">
            <span>Valor médio de um atendimento <b>{brl(valor)}</b></span>
            <input type="range" min={30} max={400} step={10} value={valor}
                   onChange={e => setValor(Number(e.target.value))} />
          </label>
          <div className="lp-calc-res" aria-live="polite">
            <span>Saem do seu caixa por mês</span>
            <b>{brl(porMes)}</b>
            <p>
              {pagam === 1
                ? 'Recuperar um desses horários por mês já paga a Vital.'
                : `Recuperar ${pagam} desses horários por mês já paga a Vital.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── como funciona ── */

function ComoFunciona() {
  const passos = [
    ['Crie a conta', 'Nome do negócio, e-mail e senha. Leva um minuto, e ninguém liga para você vender nada.'],
    ['Monte o seu site', 'Serviços, preços, equipe e horários. Escolha o modelo e a cor; o painel guia cada passo.'],
    ['Mande o link', 'Na bio do Instagram, no status, na conversa. A partir daí, a cliente marca sozinha.'],
  ];
  return (
    <section className="lp-sec lp-como" id="como-funciona" aria-labelledby="como-t">
      <div className="lp-in">
        <h2 id="como-t" className="lp-titulo">No ar hoje, sem falar com ninguém.</h2>
        <ol className="lp-passos">
          {passos.map(([t, d], i) => (
            <li key={t}>
              <span className="lp-passo-n" aria-hidden="true">{i + 1}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── site ── */

// Cada modelo foi fotografado com uma cor e uma foto próprias (ver
// `scripts/vitrine/capturar.mjs`), para a troca parecer troca de verdade.
const MODELOS = [
  { id: 'essencial', nome: 'Essencial', img: telaEssencial, desk: telaEssencialDesk, sobre: 'Claro e direto: foto grande e o agendamento logo na abertura.' },
  { id: 'galeria', nome: 'Galeria', img: telaGaleria, desk: telaGaleriaDesk, sobre: 'A sua foto de tela inteira, com letras finas em caixa-alta.' },
  { id: 'serena', nome: 'Serena', img: telaSerena, desk: telaSerenaDesk, sobre: 'Delicado: título em itálico entre duas fotos arredondadas.' },
];

function SiteDaMarca() {
  const [modelo, setModelo] = useState(0);
  const atual = MODELOS[modelo];
  const mover = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const prox = (i + (e.key === 'ArrowRight' ? 1 : MODELOS.length - 1)) % MODELOS.length;
    setModelo(prox);
    document.getElementById(`modelo-${MODELOS[prox].id}`)?.focus();
  };

  return (
    <section className="lp-sec lp-site" id="seu-site" aria-labelledby="site-t">
      {/* No celular a ordem é título, escolha, prévia e lista: a prévia fica
          logo embaixo das abas, e trocar de modelo mostra a troca sem rolar.
          Na tela larga a prévia ocupa a coluna da direita inteira. */}
      <div className="lp-in lp-site-grade">
        <div className="lp-site-texto">
          <h2 id="site-t">Um site com a sua cara, não com cara de sistema.</h2>
          <p className="lp-texto">
            Seu logo, sua cor, suas fotos e o seu endereço na internet. Escolha um
            modelo e troque quando quiser: serviços, equipe e preços vão junto.
          </p>
        </div>
        <div className="lp-modelos" role="tablist" aria-label="Modelos de site">
          {MODELOS.map((m, i) => (
            <button key={m.id} id={`modelo-${m.id}`} type="button" role="tab"
                    aria-selected={i === modelo} aria-controls="modelo-tela" tabIndex={i === modelo ? 0 : -1}
                    className={'lp-modelo' + (i === modelo ? ' on' : '')}
                    onClick={() => setModelo(i)} onKeyDown={e => mover(e, i)}>
              <b>{m.nome}</b>
              <span className="lp-modelo-sobre">{m.sobre}</span>
            </button>
          ))}
        </div>
        <div className="lp-site-telas" id="modelo-tela" role="tabpanel" aria-labelledby={`modelo-${atual.id}`}>
          <Navegador key={`d-${atual.id}`} className="lp-site-desk" src={atual.desk} largura={1920} altura={1200}
                     endereco="studioaurora.vital.app"
                     alt={`Site de um estúdio de estética no computador, no modelo ${atual.nome}.`} />
          <Celular key={atual.id} className="lp-site-cel" src={atual.img}
                   alt={`Site de um estúdio de estética no celular, no modelo ${atual.nome}.`} />
          <p className="lp-modelo-legenda" aria-live="polite">{atual.sobre}</p>
        </div>
        <ul className="lp-lista lp-site-lista">
          <li><Check size={16} /> Feito primeiro para o celular, onde quase todo agendamento acontece.</li>
          <li><Check size={16} /> A cliente não cria conta nem baixa app: marca só com o WhatsApp.</li>
          <li><Check size={16} /> Equipe, perguntas frequentes, antes e depois e Instagram: você liga o que quiser.</li>
        </ul>
      </div>
    </section>
  );
}

/* ── painel ── */

function Painel() {
  return (
    <section className="lp-sec lp-painel" id="painel" aria-labelledby="painel-t">
      <div className="lp-in">
        <h2 id="painel-t" className="lp-titulo">O dia inteiro numa tela. No balcão ou no celular.</h2>
        <div className="lp-painel-telas">
          <Navegador src={telaAgenda} endereco="studioaurora.vital.app/painel"
                     alt="Agenda do dia com uma coluna por profissional, a cliente da vez em destaque e a linha vermelha da hora atual." />
          <Celular className="lp-painel-cel" src={telaResumoCelular}
                   alt="Resumo do painel no celular: quem está sendo atendida agora, a próxima cliente e o botão Cliente chegou." />
        </div>
        <ul className="lp-pontos">
          <li>
            <h3>A próxima cliente em destaque</h3>
            <p>Com o botão do passo dela: confirmar, chegou, concluir. Sem caçar na agenda.</p>
          </li>
          <li>
            <h3>Arraste para remarcar</h3>
            <p>A grade não deixa marcar duas pessoas no mesmo horário, nem fora do expediente.</p>
          </li>
          <li>
            <h3>Fechado é fechado</h3>
            <p>Almoço, folga e feriado em vermelho na agenda. No seu site, eles nem aparecem.</p>
          </li>
          <li>
            <h3>A colega cobriu?</h3>
            <p>Troque quem atendeu em dois toques. A comissão vai para quem trabalhou.</p>
          </li>
        </ul>
      </div>
    </section>
  );
}

/* ── WhatsApp ── */

function Vinculo() {
  const msgs = [
    [CalendarCheck, 'Confirmação', 'Oi, Renata! Seu horário de drenagem está marcado para quinta, às 14:00. Posso confirmar?'],
    [Clock, 'Véspera', 'Passando para lembrar: amanhã às 14:00 a Lúcia te espera.'],
    [Heart, 'Saudade', 'Faz um tempinho que você não vem. Que tal reservar o seu retorno?'],
  ];
  return (
    <section className="lp-sec lp-faixa" aria-labelledby="whats-t">
      <div className="lp-in lp-dois lp-dois-inv">
        <div className="lp-dois-texto">
          <h2 id="whats-t">O atendimento termina. O vínculo continua.</h2>
          <p className="lp-texto">
            Confirmação, lembrete da véspera, aniversário e o “faz tempo que você
            não vem” saem prontos, com o nome da cliente e o horário dela. Você
            confere e envia com um toque, do seu próprio WhatsApp.
          </p>
          <p className="lp-nota">O envio automático, pelo número do seu negócio, está em desenvolvimento.</p>
        </div>
        <div className="lp-conversa" aria-label="Exemplos de mensagens">
          {msgs.map(([I, r, m]) => (
            <div key={r} className="lp-msg">
              <span className="lp-msg-rot"><I size={14} aria-hidden="true" /> {r}</span>
              <p className="lp-balao">{m}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── financeiro ── */

function Financeiro() {
  return (
    <section className="lp-sec" aria-labelledby="fin-t">
      <div className="lp-in lp-dois">
        <div className="lp-dois-texto">
          <h2 id="fin-t">Quanto entrou, quanto falta e quanto é de cada uma.</h2>
          <ul className="lp-lista">
            <li><Check size={16} /> Receita, lucro e a receber por dia, semana, mês ou ano.</li>
            <li><Check size={16} /> Comissão calculada atendimento por atendimento, em percentual ou valor fixo.</li>
            <li><Check size={16} /> Sinal e restante: a entrada fica registrada.</li>
            <li><Check size={16} /> Clientes e agenda exportados para planilha quando você quiser.</li>
          </ul>
        </div>
        <Navegador src={telaFinanceiro} endereco="studioaurora.vital.app/painel"
                   alt="Financeiro do ano: receita, lucro, a receber, ticket médio e o gráfico de receita por mês, separando lucro e comissões da equipe." />
      </div>
    </section>
  );
}

/* ── equipe ── */

function Equipe() {
  const papeis = [
    [ShieldCheck, 'Dona ou sócia', 'Tudo: agenda de todas, financeiro, site e quem entra no painel.'],
    [Headset, 'Recepção', 'Agenda de todas e as clientes, para marcar e receber. Sem ver o caixa nem comissões.'],
    [User, 'Profissional', 'A própria agenda, a própria produção e a própria comissão. Só isso.'],
  ];
  return (
    <section className="lp-sec lp-equipe" aria-labelledby="equipe-t">
      <div className="lp-in lp-dois lp-dois-inv">
        <div className="lp-dois-texto">
          <h2 id="equipe-t">Cada pessoa com a própria senha, vendo só o que é dela.</h2>
          <p className="lp-texto">
            <Link2 size={16} aria-hidden="true" className="lp-inline-ico" /> Convide por um link: ela abre, cria a
            senha e entra. A senha nunca passa pela sua mão.
          </p>
        </div>
        <ul className="lp-papeis">
          {papeis.map(([I, n, d]) => (
            <li key={n}>
              <span className="lp-papel-ico"><I size={18} aria-hidden="true" /></span>
              <div><h3>{n}</h3><p>{d}</p></div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── preço ── */

function Preco() {
  const itens = [
    'Site de agendamento com o seu endereço',
    'Agenda da equipe, no computador e no celular',
    'Cada profissional com acesso próprio',
    'Lembretes e campanhas prontos para o WhatsApp',
    'Financeiro, comissões e exportação para planilha',
    'Suporte pelo próprio painel',
  ];
  return (
    <section className="lp-sec lp-preco" id="preco" aria-labelledby="preco-t">
      <div className="lp-in lp-preco-in">
        <div className="lp-preco-texto">
          <h2 id="preco-t">Um plano. Tudo incluso.</h2>
          <p className="lp-texto">
            Sem tabela de recursos para comparar e sem pacote que trava o que você
            mais precisa. Custa menos que um horário vazio por mês.
          </p>
        </div>
        <div className="lp-plano">
          <p className="lp-plano-valor"><b>{brl(PRECO)}</b><span>por mês</span></p>
          <ul>
            {itens.map(i => <li key={i}><Check size={16} aria-hidden="true" /> {i}</li>)}
          </ul>
          <a className="lp-btn lp-btn-p lp-btn-g lp-btn-cheio" href="#criar">Criar minha agenda <ArrowRight size={17} /></a>
          <p className="lp-plano-nota">Sem cartão para começar.</p>
        </div>
      </div>
    </section>
  );
}

/* ── cadastro ── */

function Comecar({ refCadastro, aoCriar }) {
  return (
    <section className="lp-sec lp-comecar" id="criar" ref={refCadastro} aria-labelledby="criar-t">
      <div className="lp-in lp-dois">
        <div className="lp-dois-texto">
          <h2 id="criar-t">Crie a sua agenda agora.</h2>
          <p className="lp-texto">
            Leva um minuto. Depois, o painel continua com você: serviços, equipe,
            horários e a cara do seu site, um passo de cada vez.
          </p>
          <ul className="lp-lista">
            <li><Check size={16} /> <span>Seu endereço fica pronto na hora: <i>seunegocio.vital.app</i></span></li>
            <li><Check size={16} /> Nenhum cartão pedido</li>
          </ul>
        </div>
        <FormCadastro aoCriar={aoCriar} />
      </div>
    </section>
  );
}

/* ── dúvidas ── */

const DUVIDAS = [
  ['Quanto custa?', `${brl(PRECO)} por mês. O plano é um só, com tudo o que está nesta página.`],
  ['Preciso de cartão para começar?', 'Não. Você cria a conta e monta a agenda sem cadastrar cartão.'],
  ['Preciso falar com alguém para começar?', 'Não. Você se cadastra e configura tudo pelo painel, no seu tempo.'],
  ['Minha cliente precisa baixar app ou criar conta?', 'Não. Ela abre o link, escolhe o horário e informa o WhatsApp. Na próxima vez, o número basta.'],
  ['O lembrete sai sozinho no WhatsApp?', 'Hoje a Vital deixa cada mensagem pronta, com nome, horário e serviço, e você envia com um toque. O envio automático pelo número do seu negócio está em desenvolvimento.'],
  ['Serve para o meu ramo?', 'Se você trabalha com horário marcado, sim. O sistema usa as suas palavras: “pacientes”, “clientes”, “barbeiros”.'],
  ['Funciona no celular?', 'Sim. O site e o painel foram feitos primeiro para o celular; no computador, abrem no navegador.'],
  ['A cliente paga pelo site?', 'Ainda não. O pagamento é no atendimento, e o painel registra entrada e restante.'],
  ['Os meus dados ficam comigo?', 'Sim. Você exporta clientes e agenda para planilha quando quiser, e cada negócio fica isolado dos outros.'],
];

function Duvidas() {
  const [aberta, setAberta] = useState(-1);
  return (
    <section className="lp-sec" id="duvidas" aria-labelledby="duvidas-t">
      <div className="lp-in lp-dois lp-duvidas">
        <h2 id="duvidas-t">Perguntas que todo mundo faz.</h2>
        <div className="lp-faq">
          {DUVIDAS.map(([p, r], i) => (
            <div key={p} className={'lp-faq-item' + (aberta === i ? ' on' : '')}>
              <h3>
                <button type="button" aria-expanded={aberta === i} aria-controls={`faq-${i}`}
                        onClick={() => setAberta(aberta === i ? -1 : i)}>
                  {p} <ChevronDown size={18} aria-hidden="true" />
                </button>
              </h3>
              <p id={`faq-${i}`} hidden={aberta !== i}>{r}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Chamada() {
  return (
    <section className="lp-chamada">
      <div className="lp-in">
        <h2>Você cuida de quem chega. A Vital cuida do caminho.</h2>
        <a className="lp-btn lp-btn-claro lp-btn-g" href="#criar">Criar minha agenda <ArrowRight size={17} /></a>
        <Estrela className="lp-chamada-estrela" size={240} />
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="lp-rodape">
      <div className="lp-rodape-in lp-in">
        <Marca />
        <nav aria-label="Rodapé">
          <a href="#como-funciona">Como funciona</a>
          <a href="#preco">Preço</a>
          <a href="#duvidas">Dúvidas</a>
          <a href="#termos">Termos de uso</a>
          <a href="#privacidade">Privacidade</a>
          <a href="#equipe">Sou da equipe Vital</a>
        </nav>
      </div>
    </footer>
  );
}
