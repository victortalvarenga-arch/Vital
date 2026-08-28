import { useEffect, useState } from 'react';
import { LogIn, TriangleAlert } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * Porta do painel: login, e o primeiro acesso quando a empresa ainda não tem
 * ninguém cadastrado.
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
 */
export default function Entrar({ aoEntrar }) {
  const [modo, setModo] = useState(null);        // 'login' | 'primeiro'
  const [vazia, setVazia] = useState(false);     // a empresa deste endereço não tem ninguém
  const [empresa, setEmpresa] = useState('');
  const [f, setF] = useState({ nome: '', email: '', senha: '' });
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api.precisaConfigurar()
      .then(r => { setVazia(r.precisa); setEmpresa(r.empresa || ''); setModo(r.precisa ? 'primeiro' : 'login'); })
      .catch(() => setModo('login'));
  }, []);

  const trocarModo = () => {
    setErro(null);
    setModo(m => (m === 'primeiro' ? 'login' : 'primeiro'));
  };

  const enviar = async e => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const r = modo === 'primeiro'
        ? await api.primeiroAcesso(f)
        : await api.login(f.email, f.senha);
      aoEntrar(r);
    } catch (erro) {
      setErro(erro.message);
      setOcupado(false);
    }
  };

  if (!modo) return <div className="p-centro"><p className="p-fraco">Carregando…</p></div>;

  const primeiro = modo === 'primeiro';

  return (
    <div className="entrar">
      <form className="entrar-caixa" onSubmit={enviar}>
        <h1>{primeiro ? 'Criar o primeiro acesso' : 'Entrar no painel'}</h1>
        {empresa && <p className="entrar-empresa">{empresa}</p>}
        <p className="entrar-sub">
          {primeiro
            ? 'Esta empresa ainda não tem ninguém cadastrado. Quem criar agora vira o dono.'
            : vazia
              ? 'Atenção: esta empresa ainda não tem ninguém cadastrado, então nenhuma senha vai funcionar aqui. Se a sua empresa já existe, ela fica em outro endereço.'
              : 'Use o e-mail e a senha cadastrados.'}
        </p>

        {primeiro && (
          <div className="mfield">
            <label htmlFor="nome">Seu nome</label>
            <input id="nome" autoComplete="name" required value={f.nome}
                   onChange={e => setF(v => ({ ...v, nome: e.target.value }))} />
          </div>
        )}

        <div className="mfield">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" required value={f.email}
                 onChange={e => setF(v => ({ ...v, email: e.target.value }))} />
        </div>

        <div className="mfield">
          <label htmlFor="senha">Senha</label>
          <input id="senha" type="password" required
                 autoComplete={primeiro ? 'new-password' : 'current-password'}
                 minLength={primeiro ? 8 : undefined}
                 value={f.senha}
                 onChange={e => setF(v => ({ ...v, senha: e.target.value }))} />
          {primeiro && <span className="entrar-dica">Ao menos 8 caracteres.</span>}
        </div>

        {erro && (
          <p className="entrar-erro"><TriangleAlert size={15} /> {erro}</p>
        )}

        <button className="btn btn-p" type="submit" disabled={ocupado} style={{ width: '100%' }}>
          <LogIn size={17} /> {ocupado ? 'Entrando…' : primeiro ? 'Criar e entrar' : 'Entrar'}
        </button>

        {/* A troca só aparece enquanto a empresa está sem ninguém. Depois disso
            o primeiro acesso está fechado, e oferecê-lo seria oferecer um
            caminho que o servidor recusa. */}
        {vazia && (
          <button className="entrar-troca" type="button" onClick={trocarModo}>
            {primeiro ? 'Já tenho conta — quero entrar' : 'Criar o primeiro acesso desta empresa'}
          </button>
        )}
      </form>
    </div>
  );
}
