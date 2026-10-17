import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, TriangleAlert } from 'lucide-react';
import { api } from './api.js';

/**
 * Onde uma empresa se cadastra sozinha.
 *
 * A rota `POST /api/cadastro` existia e estava testada há um bloco inteiro, sem
 * nenhuma tela que a chamasse — ou seja, a Vital ainda cadastrava cliente na
 * mão. Este formulário é o que fecha essa distância. Mora dentro da página de
 * apresentação (`Inicio.jsx`), no fim da conversa de venda.
 *
 * Um formulário só, cinco campos. Cada passo a mais aqui é uma empresa a menos
 * do outro lado, e nada do que se pergunta depois é urgente: o assistente de
 * primeira configuração continua a conversa já dentro do painel dela.
 */
export function FormCadastro({ aoCriar }) {
  const [f, setF] = useState({ nome: '', ramo: '', responsavel: '', email: '', senha: '' });
  const [endereco, setEndereco] = useState(null);   // { slug, livre }
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const muda = patch => setF(v => ({ ...v, ...patch }));
  const robo = useTurnstile();

  // O endereço é conferido enquanto se digita o nome: descobrir que está tomado
  // depois de preencher a senha é o tipo de coisa que faz desistir.
  useEffect(() => {
    const nome = f.nome.trim();
    if (nome.length < 2) return setEndereco(null);
    const t = setTimeout(() => {
      api.enderecoLivre(nome).then(setEndereco).catch(() => setEndereco(null));
    }, 350);
    return () => clearTimeout(t);
  }, [f.nome]);

  const enviar = async e => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try { aoCriar(await api.cadastrar({ ...f, turnstile: robo.token })); }
    catch (erro) {
      setErro(erro.message);
      setOcupado(false);
      // O token é de uso único: a tentativa seguinte precisa de outro.
      robo.reiniciar();
    }
  };

  return (
    <section className="v-caixa">
      <form onSubmit={enviar}>
        <h2>Criar a minha agenda</h2>

        <div className="v-campo">
          <label htmlFor="v-nome">Nome do negócio</label>
          <input id="v-nome" required value={f.nome}
                 placeholder="Barbearia do João"
                 onChange={e => muda({ nome: e.target.value })} />
          {endereco && (
            <span className={'v-endereco' + (endereco.livre ? '' : ' tomado')}>
              {endereco.livre
                ? <><Check size={13} /> {endereco.slug}.vital.app está livre</>
                : <><TriangleAlert size={13} /> {endereco.slug}.vital.app já existe — o seu ganha um número no fim</>}
            </span>
          )}
        </div>

        <div className="v-campo">
          <label htmlFor="v-ramo">O que vocês fazem</label>
          <input id="v-ramo" value={f.ramo} placeholder="Barbearia, clínica, petshop…"
                 onChange={e => muda({ ramo: e.target.value })} />
          <span className="v-dica">Serve para o sistema usar as suas palavras. Dá para mudar depois.</span>
        </div>

        <div className="v-campo">
          <label htmlFor="v-resp">Seu nome</label>
          <input id="v-resp" required autoComplete="name" value={f.responsavel}
                 onChange={e => muda({ responsavel: e.target.value })} />
        </div>

        <div className="v-campo">
          <label htmlFor="v-email">Seu e-mail</label>
          <input id="v-email" type="email" required autoComplete="username" value={f.email}
                 onChange={e => muda({ email: e.target.value })} />
        </div>

        <div className="v-campo">
          <label htmlFor="v-senha">Senha</label>
          <input id="v-senha" type="password" required minLength={8}
                 autoComplete="new-password" value={f.senha}
                 onChange={e => muda({ senha: e.target.value })} />
          <span className="v-dica">Ao menos 8 caracteres.</span>
        </div>

        {robo.ligado && <div ref={robo.lugar} className="v-turnstile" />}

        {erro && <p className="v-erro"><TriangleAlert size={15} /> {erro}</p>}

        <button className="v-btn" type="submit" disabled={ocupado || (robo.ligado && !robo.token)}>
          {ocupado ? 'Criando…' : <>Criar minha agenda <ArrowRight size={17} /></>}
        </button>
      </form>
    </section>
  );
}

/**
 * O widget anti-robô do Cloudflare Turnstile, quando o servidor diz que está
 * ligado (`/api/cadastro/config`). O script da Cloudflare só é baixado nesse
 * caso: no desenvolvimento, sem chave, a página nem fala com a Cloudflare.
 *
 * Na maior parte das vezes a pessoa não vê desafio nenhum — o widget confere
 * sozinho e libera o botão. O token vale cinco minutos e uma vez só.
 */
function useTurnstile() {
  const [chave, setChave] = useState(null);
  const [token, setToken] = useState('');
  const lugar = useRef(null);
  const widget = useRef(null);

  useEffect(() => {
    api.configCadastro().then(r => setChave(r.turnstile)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!chave || !lugar.current) return;
    const desenhar = () => {
      if (widget.current != null || !window.turnstile) return;
      widget.current = window.turnstile.render(lugar.current, {
        sitekey: chave,
        language: 'pt-BR',
        // A página é clara; no automático, o widget seguia o tema escuro do
        // aparelho e virava uma faixa preta no meio do formulário.
        theme: 'light',
        callback: setToken,
        'expired-callback': () => setToken(''),
        'error-callback': () => setToken(''),
      });
    };
    if (window.turnstile) { desenhar(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = desenhar;
    document.head.appendChild(s);
  }, [chave]);

  const reiniciar = () => {
    setToken('');
    if (widget.current != null) window.turnstile?.reset(widget.current);
  };

  return { ligado: !!chave, token, lugar, reiniciar };
}

/**
 * O que aparece depois de criar.
 *
 * O cadastro não abre sessão de propósito: o cookie é preso ao host que o
 * emitiu, e o daqui não chegaria ao endereço da empresa. Por isso esta tela
 * entrega o endereço e manda entrar lá — com a senha que a pessoa acabou de
 * escolher.
 */
export function Pronto({ dados }) {
  return (
    <div className="v-pagina">
      <header className="v-topo"><span className="v-marca">Vital</span></header>
      <main className="v-conteudo v-conteudo-centro">
        <div className="v-caixa v-pronto">
          <div className="v-pronto-marca"><Check size={30} /></div>
          <h2>{dados.empresa.nome} está no ar.</h2>
          <p className="v-sub">
            Seu endereço é <b>{dados.empresa.endereco}</b>. Entre com o e-mail e a
            senha que você acabou de escolher — as primeiras perguntas vêm lá
            dentro.
          </p>
          <a className="v-btn" href={dados.painel}>
            Abrir o meu painel <ArrowRight size={17} />
          </a>
        </div>
      </main>
    </div>
  );
}
