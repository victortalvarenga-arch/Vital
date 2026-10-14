import { useEffect, useState } from 'react';
import { KeyRound, LogIn, Mail, TriangleAlert } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * Porta do painel: login, o primeiro acesso quando a empresa ainda não tem
 * ninguém cadastrado, e a senha esquecida.
 *
 * O primeiro acesso é aberto de propósito e se fecha sozinho assim que existir
 * um usuário — é a única forma de a primeira pessoa entrar. Daí em diante, só
 * quem já está dentro convida.
 *
 * A tela diz **em qual empresa** você está entrando. Passou a importar quando
 * cada empresa ganhou endereço próprio: abrir o endereço errado e cair numa
 * empresa vazia, sem entender por que a tela pede para criar uma conta, virou
 * um erro fácil de cometer. E quem cair assim precisa de saída — daí o link
 * entre os dois modos, mesmo quando a empresa está sem ninguém.
 *
 * O link do e-mail de senha nova chega como `#redefinir=<token>`: no fragmento
 * e não na query, para o token não ir para log de servidor nem de proxy — o
 * navegador não envia o que vem depois do `#`.
 */
const tokenDoLink = () => {
  const m = /^#redefinir=([\w-]+)/.exec(window.location.hash);
  return m ? m[1] : null;
};

export default function Entrar({ aoEntrar }) {
  const [modo, setModo] = useState(null);        // 'login' | 'primeiro' | 'esqueci' | 'redefinir'
  const [vazia, setVazia] = useState(false);     // a empresa deste endereço não tem ninguém
  const [empresa, setEmpresa] = useState('');
  const [f, setF] = useState({ nome: '', email: '', senha: '' });
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [token] = useState(tokenDoLink);

  useEffect(() => {
    api.precisaConfigurar()
      .then(r => {
        setVazia(r.precisa); setEmpresa(r.empresa || '');
        setModo(token ? 'redefinir' : r.precisa ? 'primeiro' : 'login');
      })
      .catch(() => setModo(token ? 'redefinir' : 'login'));
  }, [token]);

  const irPara = m => { setErro(null); setAviso(null); setModo(m); };

  const enviar = async e => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      if (modo === 'esqueci') {
        const r = await api.esqueciSenha(f.email);
        setAviso(r.mensagem);
      } else if (modo === 'redefinir') {
        await api.redefinirSenha(token, f.senha);
        // O token já foi gasto: tirá-lo da barra evita que um recarregar volte
        // para uma tela que só vai dizer "link vencido".
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        setF(v => ({ ...v, senha: '' }));
        setModo('login');
        setAviso('Senha nova criada. Entre com ela.');
      } else {
        aoEntrar(modo === 'primeiro' ? await api.primeiroAcesso(f) : await api.login(f.email, f.senha));
        return;
      }
    } catch (erro) {
      setErro(erro.message);
    }
    setOcupado(false);
  };

  if (!modo) return <div className="p-centro"><p className="p-fraco">Carregando…</p></div>;

  const TITULOS = {
    login: 'Entrar no painel',
    primeiro: 'Criar o primeiro acesso',
    esqueci: 'Esqueci minha senha',
    redefinir: 'Criar uma senha nova',
  };
  const SUBS = {
    login: vazia
      ? 'Atenção: esta empresa ainda não tem ninguém cadastrado, então nenhuma senha vai funcionar aqui. Se a sua empresa já existe, ela fica em outro endereço.'
      : 'Use o e-mail e a senha cadastrados.',
    primeiro: 'Esta empresa ainda não tem ninguém cadastrado. Quem criar agora vira o dono.',
    esqueci: 'Informe o e-mail do seu acesso. Mandamos um link para criar uma senha nova.',
    redefinir: 'Escolha a senha nova. Ao salvar, os outros aparelhos conectados saem da conta.',
  };
  const BOTOES = {
    login: [LogIn, 'Entrar', 'Entrando…'],
    primeiro: [LogIn, 'Criar e entrar', 'Criando…'],
    esqueci: [Mail, 'Enviar o link', 'Enviando…'],
    redefinir: [KeyRound, 'Salvar senha nova', 'Salvando…'],
  };
  const [Icone, rotulo, rotuloOcupado] = BOTOES[modo];
  const pedeEmail = modo !== 'redefinir';
  const pedeSenha = modo !== 'esqueci';
  const senhaNova = modo === 'primeiro' || modo === 'redefinir';

  return (
    <div className="entrar">
      <form className="entrar-caixa" onSubmit={enviar}>
        <h1>{TITULOS[modo]}</h1>
        {empresa && <p className="entrar-empresa">{empresa}</p>}
        <p className="entrar-sub">{SUBS[modo]}</p>

        {modo === 'primeiro' && (
          <div className="mfield">
            <label htmlFor="nome">Seu nome</label>
            <input id="nome" autoComplete="name" required value={f.nome}
                   onChange={e => setF(v => ({ ...v, nome: e.target.value }))} />
          </div>
        )}

        {pedeEmail && (
          <div className="mfield">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="username" required value={f.email}
                   onChange={e => setF(v => ({ ...v, email: e.target.value }))} />
          </div>
        )}

        {pedeSenha && (
          <div className="mfield">
            <label htmlFor="senha">{modo === 'redefinir' ? 'Senha nova' : 'Senha'}</label>
            <input id="senha" type="password" required
                   autoComplete={senhaNova ? 'new-password' : 'current-password'}
                   minLength={senhaNova ? 8 : undefined}
                   value={f.senha}
                   onChange={e => setF(v => ({ ...v, senha: e.target.value }))} />
            {senhaNova && <span className="entrar-dica">Ao menos 8 caracteres.</span>}
          </div>
        )}

        {aviso && <p className="entrar-aviso" role="status">{aviso}</p>}
        {erro && (
          <p className="entrar-erro"><TriangleAlert size={15} /> {erro}</p>
        )}

        {/* Depois do envio, o botão some: mandar de novo na hora só gera um
            segundo link que invalida o primeiro, ainda a caminho. */}
        {!(modo === 'esqueci' && aviso) && (
          <button className="btn btn-p" type="submit" disabled={ocupado} style={{ width: '100%' }}>
            <Icone size={17} /> {ocupado ? rotuloOcupado : rotulo}
          </button>
        )}

        {modo === 'login' && !vazia && (
          <button className="entrar-troca" type="button" onClick={() => irPara('esqueci')}>
            Esqueci minha senha
          </button>
        )}
        {(modo === 'esqueci' || modo === 'redefinir') && (
          <button className="entrar-troca" type="button" onClick={() => irPara('login')}>
            Voltar para o login
          </button>
        )}

        {/* A troca só aparece enquanto a empresa está sem ninguém. Depois disso
            o primeiro acesso está fechado, e oferecê-lo seria oferecer um
            caminho que o servidor recusa. */}
        {vazia && (modo === 'login' || modo === 'primeiro') && (
          <button className="entrar-troca" type="button"
                  onClick={() => irPara(modo === 'primeiro' ? 'login' : 'primeiro')}>
            {modo === 'primeiro' ? 'Já tenho conta — quero entrar' : 'Criar o primeiro acesso desta empresa'}
          </button>
        )}
      </form>
    </div>
  );
}
