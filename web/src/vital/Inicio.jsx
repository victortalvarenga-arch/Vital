import { useState } from 'react';
import {
  ArrowDown, ArrowRight, Ban, CalendarCheck, CalendarDays, Check, ChevronDown, Clock,
  Heart, LayoutDashboard, Lock, MapPin, MessageCircle, Plus, Sparkles,
  Star, Tag, Users, Wallet,
} from 'lucide-react';
import { FormCadastro, Pronto } from './Cadastro.jsx';
import foto from './cuidado.jpg';
import './inicio.css';

/**
 * A página de apresentação da Vital — o que se vê ao abrir o domínio raiz.
 *
 * Pouca palavra e muito desenho, de propósito: cada seção é um título curto e
 * uma imagem do produto. Explicação longa mora no painel, onde ela é útil.
 *
 * A foto da abertura (`cuidado.jpg`) é de banco de imagem, genérica e sem marca
 * de ninguém: https://unsplash.com/photos/oTHJHz47Ht4, licença Unsplash (uso
 * comercial livre, sem crédito obrigatório).
 *
 * A abertura copia o desenho de uma referência que o dono trouxe, menos as
 * provas que a Vital ainda não tem: "2.000 negócios", nota 4,9, logos de
 * clientes e "7 dias grátis" (não existe plano nem cobrança). No lugar de cada
 * uma entrou um fato do mesmo tamanho — ver PRODUCT.md, "Evidence on Hand". O resto é desenho em HTML do que o produto faz de
 * verdade, não print: print envelhece a cada mudança de tela, e foto de cliente
 * real não entra (ver CLAUDE.md). Os negócios dos exemplos são inventados.
 *
 * Regra do texto: só se promete o que existe. Mensagem de WhatsApp é "pronta
 * para enviar", não "enviada sozinha" (o envio automático é o Bloco 12), e
 * pagamento online não aparece porque não existe.
 */
export default function Inicio() {
  const [pronto, setPronto] = useState(null);

  if (pronto) return <Pronto dados={pronto} />;

  return (
    <div className="lp">
      <Aviso />
      <Topo />
      <main>
        <Abertura />
        <Ramos />
        <Painel />
        <SiteDaMarca />
        <ComoAgenda />
        <SemDesencontro />
        <Completo />
        <Vinculo />
        <Comecar aoCriar={setPronto} />
        <Duvidas />
        <Chamada />
      </main>
      <Rodape />
    </div>
  );
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

/* Faixa de cima. Na referência era "7 dias grátis"; a Vital ainda não tem
   plano nem cobrança, então o que se oferece é o que já é verdade. */
function Aviso() {
  return (
    <div className="lp-aviso">
      <span><b>Um minuto</b> para colocar sua agenda no ar</span>
      <a href="#criar">Começar agora <ArrowRight size={13} /></a>
    </div>
  );
}

function Topo() {
  return (
    <header className="lp-topo">
      <div className="lp-topo-in">
        <a href="#" className="lp-topo-marca" aria-label="Vital, início"><Marca /></a>
        <nav className="lp-nav">
          <a href="#como-funciona">Como funciona</a>
          <a href="#seu-site">Recursos</a>
          <a href="#agendamento">Para o seu negócio</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>
        <a className="lp-btn lp-btn-p" href="#criar">Começar agora <ArrowRight size={15} /></a>
      </div>
    </header>
  );
}

function Rotulo({ children }) {
  return <p className="lp-rotulo">{children}</p>;
}

function Cabeca({ rotulo, titulo, centro }) {
  return (
    <div className={'lp-cab' + (centro ? ' lp-cab-centro' : '')}>
      <Rotulo>{rotulo}</Rotulo>
      <h2>{titulo}</h2>
    </div>
  );
}

/* ── abertura ── */

function Abertura() {
  return (
    <section className="lp-abertura lp-in">
      <div className="lp-abertura-texto">
        <span className="lp-selo"><i /> Para clínicas, estúdios e salões</span>
        <h1>Pare de perder clientes no <em>WhatsApp.</em></h1>
        <p className="lp-lead">
          Transforme mensagens em horários preenchidos: sua cliente agenda
          sozinha, a qualquer hora — mesmo quando você está atendendo.
        </p>
        <div className="lp-acoes">
          <a className="lp-btn lp-btn-p lp-btn-g" href="#criar">Começar agora <ArrowRight size={17} /></a>
          <a className="lp-ver" href="#como-funciona"><span><ArrowDown size={15} /></span> Ver a Vital por dentro</a>
        </div>
        <ul className="lp-garantias">
          <li><Check size={12} /> Sem cartão de crédito</li>
          <li><Check size={12} /> Pronta no mesmo dia</li>
        </ul>
      </div>

      <div className="lp-cena" aria-hidden="true">
        <div className="lp-arco" />
        <img className="lp-cena-foto" src={foto} alt="" />
        <Molecula className="lp-mol lp-mol-a" />
        <Molecula className="lp-mol lp-mol-b" />
        <div className="lp-flutua lp-flutua-ag">
          <span className="lp-flutua-ico"><Check size={14} /></span>
          <span><small>Novo agendamento</small><b>Limpeza de pele</b><em>Hoje, 14:30 · com Luísa</em></span>
        </div>
        <div className="lp-flutua lp-flutua-fat">
          <small>Recebido no mês</small>
          <b>R$ 18.420</b>
          <em>↗ 24% sobre o mês anterior</em>
          <span className="lp-barras">{[34, 42, 38, 52, 50, 66, 88].map((h, i) => <i key={i} style={{ height: h + '%' }} />)}</span>
        </div>
      </div>
    </section>
  );
}

/** O enfeite de pontos ligados da referência. */
function Molecula({ className }) {
  return (
    <svg className={className} width="40" height="40" viewBox="0 0 40 40">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M20 20 L8 9 M20 20 L33 12 M20 20 L12 33 M20 20 L31 31" />
      </g>
      <g fill="currentColor">
        <circle cx="20" cy="20" r="4" /><circle cx="8" cy="9" r="3.5" /><circle cx="33" cy="12" r="3.5" />
        <circle cx="12" cy="33" r="3.5" /><circle cx="31" cy="31" r="3" />
      </g>
    </svg>
  );
}

/* Na referência, uma faixa de logos de clientes. A Vital ainda não tem
   cliente para mostrar, então a faixa mostra para quem ela é feita. */
function Ramos() {
  return (
    <section className="lp-ramos">
      <div className="lp-ramos-in lp-in">
        <small>Feita para quem vive de agenda</small>
        <span className="r1">estética</span>
        <span className="r2">SALÃO</span>
        <span className="r3">barbearia</span>
        <span className="r4">Clínica</span>
        <span className="r5">estúdio</span>
      </div>
    </section>
  );
}

/* ── painel ── */

const COLUNAS = [
  { nome: 'Marina', itens: [['09:00', 'Ana Souza', 'Limpeza de pele', 'ok'], ['11:00', 'Júlia Martins', 'Design de sobrancelha', 'ag']] },
  { nome: 'Lúcia', itens: [['09:30', 'Carla Dias', 'Massagem relaxante', 'em'], ['14:00', 'Bia Rocha', 'Limpeza de pele', 'ag']] },
  { nome: 'Rafa', itens: [['10:00', 'Paula Lima', 'Drenagem', 'ok'], ['13:00', null, 'Almoço', 'fecha']] },
];

function Painel() {
  return (
    <section className="lp-sec lp-in" id="como-funciona">
      <Cabeca rotulo="O painel" titulo="O dia inteiro, num olhar." />

      <div className="lp-janela" aria-hidden="true">
        <aside className="lp-janela-menu">
          <Marca />
          {[[LayoutDashboard, 'Resumo'], [CalendarDays, 'Agenda', true], [Users, 'Clientes'], [Wallet, 'Financeiro'], [MessageCircle, 'Mensagens']].map(([I, n, on]) => (
            <span key={n} className={on ? 'on' : ''}><I size={14} /> {n}</span>
          ))}
        </aside>
        <div className="lp-janela-corpo">
          <div className="lp-janela-topo">
            <div><b>Seu dia, em ordem</b><small>Quinta-feira, 22 de outubro</small></div>
            <span className="lp-chips"><i className="on">Dia</i><i>Semana</i><i>Mês</i></span>
          </div>
          <div className="lp-numeros">
            <span><small>Agendados hoje</small><b>9</b></span>
            <span><small>Recebido</small><b>R$ 640</b></span>
            <span><small>A receber</small><b>R$ 410</b></span>
            <span><small>Equipe</small><b>3 pessoas</b></span>
          </div>
          <div className="lp-grade">
            {COLUNAS.map(c => (
              <div key={c.nome} className="lp-coluna">
                <span className="lp-coluna-nome"><i>{c.nome[0]}</i>{c.nome}</span>
                {c.itens.map(([h, quem, o, st]) => (
                  <div key={h} className={'lp-card-ag ' + st}>
                    <small>{h}</small>
                    <b>{quem || o}</b>
                    {quem && <span>{o}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="lp-selos">
        <li><CalendarDays size={15} /> Agenda da equipe</li>
        <li><Users size={15} /> Fichas das clientes</li>
        <li><Wallet size={15} /> Caixa e comissão</li>
        <li><Lock size={15} /> Cada um vê o que é seu</li>
      </ul>
    </section>
  );
}

/* ── site ── */

const MODELOS = [
  ['Bandeja', '#F4EFE8', '#B9826B'],
  ['Quadro', '#1F2328', '#E8C468'],
  ['Caderneta', '#E9DCC4', '#6E4B2A'],
  ['Clínica', '#F5F5F2', '#5E7A6E'],
];

function SiteDaMarca() {
  return (
    <section className="lp-sec lp-in" id="seu-site">
      <Cabeca rotulo="Seu site" titulo="Não parece um sistema. Parece a sua marca." />

      <div className="lp-dois">
        <div className="lp-site" aria-hidden="true">
          <div className="lp-site-barra"><i /><i /><i /><span>studioaurora.vital.app</span></div>
          <div className="lp-site-capa">
            <span className="lp-site-nome">Studio Aurora</span>
            <p>Um tempo só para você.</p>
          </div>
          <div className="lp-site-servicos">
            <span><i /><b>Limpeza de pele</b><small>60 min · R$ 180</small></span>
            <span><i /><b>Design de sobrancelha</b><small>40 min · R$ 70</small></span>
          </div>
          {/* Sem nota nem depoimento inventado: o PRODUCT.md não deixa fabricar
              prova, nem em desenho. */}
          <div className="lp-site-estrelas"><Star size={13} fill="currentColor" /> Avaliações do Google</div>
        </div>

        <div>
          <ul className="lp-lista">
            <li><Check size={16} /> Seu logo, sua cor, seu endereço</li>
            <li><Check size={16} /> Feito para o celular</li>
            <li><Check size={16} /> Antes e depois, com autorização</li>
            <li><Check size={16} /> Google e Instagram, atualizados sozinhos</li>
          </ul>
          <div className="lp-modelos">
            {MODELOS.map(([n, f, c]) => (
              <div key={n} className="lp-modelo">
                <span className="lp-modelo-amostra" style={{ background: f }}><i style={{ background: c }} /><i style={{ background: c, opacity: .45 }} /></span>
                <small>{n}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── agendamento ── */

function ComoAgenda() {
  const pontos = [
    [MapPin, 'O serviço e a unidade'],
    [Users, 'A profissional, ou qualquer uma'],
    [Clock, 'Só horários livres de verdade'],
    [Lock, 'Sem senha: basta o WhatsApp'],
  ];
  return (
    <section className="lp-verde">
      <div className="lp-in">
        <Cabeca centro rotulo="Agendamento" titulo="Ela marca sozinha. A qualquer hora." />
        <div className="lp-agenda">
          <div className="lp-fone" aria-hidden="true">
            <div className="lp-fone-tela">
              <div className="lp-fone-capa"><span>Barbearia Norte</span></div>
              <p className="lp-fone-titulo">Qual o melhor momento para você?</p>
              <small className="lp-fone-ctx">Corte + barba · 50 min · com Diego</small>
              <div className="lp-dias">
                {[['seg', 19], ['ter', 20], ['qua', 21], ['qui', 22], ['sex', 23]].map(([d, n]) => (
                  <span key={n} className={n === 21 ? 'on' : ''}><small>{d}</small>{n}</span>
                ))}
              </div>
              <div className="lp-horas">
                {['09:00', '10:30', '11:20', '14:00', '15:40', '17:10'].map(h => (
                  <span key={h} className={h === '10:30' ? 'on' : ''}>{h}</span>
                ))}
              </div>
              <span className="lp-fone-btn">Confirmar</span>
            </div>
          </div>
          <ul className="lp-pontos">
            {pontos.map(([I, t]) => (
              <li key={t}><span className="lp-ico"><I size={17} /></span>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function SemDesencontro() {
  return (
    <section className="lp-escuro">
      <div className="lp-dois lp-in">
        <div>
          <Rotulo>Disponibilidade</Rotulo>
          <h2>Uma vaga. Uma reserva. Nenhum desencontro.</h2>
          <ul className="lp-lista clara">
            <li><Check size={16} /> Nunca dois no mesmo horário</li>
            <li><Check size={16} /> Almoço, folga e feriado fechados</li>
            <li><Check size={16} /> Antecedência mínima para marcar</li>
          </ul>
        </div>
        <div className="lp-respeita" aria-hidden="true">
          <div className="lp-linha-ag"><b>10:00</b><span>Reservado por Ana<small>Hidratação · 60 min</small></span><CalendarCheck size={16} /></div>
          <div className="lp-linha-ag fechado"><b>12:00</b><span>Horário fechado<small>Almoço da equipe</small></span><Ban size={16} /></div>
          <div className="lp-linha-ag livre"><b>15:30</b><span>Livre<small>Aparece no site</small></span><Check size={16} /></div>
        </div>
      </div>
    </section>
  );
}

/* ── adicionais e promoções ── */

function Completo() {
  return (
    <section className="lp-sec lp-in">
      <Cabeca rotulo="Adicionais e promoções" titulo="Mais completo. Igualmente simples." />
      <div className="lp-dois lp-dois-igual">
        <article className="lp-cartao">
          <h3>Um extra na hora de marcar</h3>
          <div className="lp-extra" aria-hidden="true">
            <div><span><b>Corte feminino</b><small>60 min</small></span><b>R$ 120</b></div>
            <div className="lp-extra-add"><Plus size={14} /><span>Hidratação<small>+ 20 min</small></span><b>+ R$ 45</b></div>
            <div className="lp-extra-total"><span>80 min no total</span><b>R$ 165</b></div>
          </div>
        </article>
        <article className="lp-cartao lp-terra">
          <h3>Ofertas com tudo às claras</h3>
          <div className="lp-promo" aria-hidden="true">
            <div className="lp-promo-topo"><span><Tag size={14} /> Pacote Dia da Noiva</span><em>Economize R$ 60</em></div>
            <div className="lp-promo-preco"><s>R$ 380</s><b>R$ 320</b></div>
            <small><Sparkles size={13} /> Terças e quartas · 8 vagas</small>
          </div>
        </article>
      </div>
    </section>
  );
}

/* ── WhatsApp ── */

function Vinculo() {
  const msgs = [
    [CalendarCheck, 'Confirmação', 'Oi, Renata! Sua consulta está marcada para quinta, às 14:00. Até lá!'],
    [Clock, 'Lembrete', 'Passando para lembrar: amanhã às 14:00 te esperamos.'],
    [Heart, 'Saudade', 'Faz um tempinho que você não vem. Que tal agendar o seu retorno?'],
  ];
  return (
    <section className="lp-sec lp-in">
      <Cabeca rotulo="WhatsApp" titulo="O atendimento termina. O vínculo, não." />
      <div className="lp-tres">
        {msgs.map(([I, r, m]) => (
          <article key={r} className="lp-cartao">
            <span className="lp-msg-rot"><I size={14} /> {r}</span>
            <p className="lp-balao">{m}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ── cadastro ── */

function Comecar({ aoCriar }) {
  const passos = [['01', 'Crie sua conta'], ['02', 'Dê a sua cara'], ['03', 'Abra sua agenda']];
  return (
    <section className="lp-sec lp-in" id="criar">
      <div className="lp-dois lp-comecar">
        <div>
          <Rotulo>Comece hoje</Rotulo>
          <h2>Um minuto para criar. O mesmo dia para começar.</h2>
          <ol className="lp-passos">
            {passos.map(([n, t]) => <li key={n}><span>{n}</span>{t}</li>)}
          </ol>
        </div>
        <FormCadastro aoCriar={aoCriar} />
      </div>
    </section>
  );
}

/* ── dúvidas ── */

const DUVIDAS = [
  ['Preciso falar com alguém para começar?', 'Não. Você se cadastra e configura tudo pelo painel.'],
  ['Minha cliente precisa criar uma conta?', 'Não. Ela agenda só com o WhatsApp, sem senha.'],
  ['Serve para o meu ramo?', 'Se você trabalha com horário marcado, sim. O sistema usa as suas palavras: “pacientes”, “clientes”, “barbeiros”.'],
  ['A cliente paga pelo site?', 'Ainda não. O pagamento é no atendimento, e o painel registra entrada e restante.'],
  ['Os meus dados ficam comigo?', 'Sim. Você exporta tudo para planilha quando quiser.'],
];

function Duvidas() {
  const [aberta, setAberta] = useState(-1);
  return (
    <section className="lp-sec lp-in" id="duvidas">
      <div className="lp-dois lp-duvidas">
        <div>
          <Rotulo>Dúvidas</Rotulo>
          <h2>Tudo mais claro.</h2>
        </div>
        <div className="lp-faq">
          {DUVIDAS.map(([p, r], i) => (
            <div key={p} className={'lp-faq-item' + (aberta === i ? ' on' : '')}>
              <button type="button" aria-expanded={aberta === i} onClick={() => setAberta(aberta === i ? -1 : i)}>
                {p} <ChevronDown size={17} />
              </button>
              {aberta === i && <p>{r}</p>}
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
        <a className="lp-btn lp-btn-claro lp-btn-g" href="#criar">Criar minha conta <ArrowRight size={17} /></a>
        <Estrela className="lp-chamada-folha" size={240} />
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="lp-rodape">
      <div className="lp-rodape-in lp-in">
        <Marca />
        <nav>
          <a href="#como-funciona">Como funciona</a>
          <a href="#duvidas">Dúvidas</a>
          <a href="#equipe">Sou da equipe Vital</a>
        </nav>
      </div>
    </footer>
  );
}
