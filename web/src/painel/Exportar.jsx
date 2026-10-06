import { useState } from 'react';
import { CalendarDays, Download, ShieldCheck, Users } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * Exportar dados: a base da empresa em planilha, para ela guardar ou levar.
 *
 * Duas planilhas e não um pacote só: quem baixa quase sempre quer uma das duas
 * (a lista de clientes para uma campanha, a agenda para o contador), e um zip
 * no celular é um arquivo que a pessoa não consegue abrir.
 *
 * Só o dono vê esta tela, e a rota recusa os outros papéis. O que fica de fora
 * — a ficha de saúde — está dito na tela, para ninguém procurar a coluna.
 */

const ARQUIVOS = [
  {
    k: 'clientes', icone: Users, titulo: 'Clientes',
    texto: 'Nome, WhatsApp, e-mail, nascimento, endereço, observações, se aceita '
      + 'mensagens de marketing, visitas, faltas e quanto já pagou.',
  },
  {
    k: 'agendamentos', icone: CalendarDays, titulo: 'Agendamentos',
    texto: 'Todos os horários, do primeiro ao último, inclusive os cancelados: '
      + 'cliente, serviço, adicionais, profissional, situação, valor e pagamento.',
  },
];

export default function Exportar({ aviso }) {
  const [baixando, setBaixando] = useState(null);

  const baixar = async k => {
    setBaixando(k);
    try { await api.exportar(k); }
    catch (e) { aviso(e.message || 'Não deu para gerar a planilha.'); }
    finally { setBaixando(null); }
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Exportar dados</h2>
          <div className="sub">Seus dados em planilha, para guardar ou levar para onde quiser</div>
        </div>
      </div>

      <div className="ex-lista">
        {ARQUIVOS.map(({ k, icone: Icone, titulo, texto }) => (
          <div key={k} className="card ex-item">
            <div className="ex-titulo"><Icone size={18} aria-hidden="true" /> {titulo}</div>
            <p className="ex-texto">{texto}</p>
            <button className="btn btn-p ex-btn" onClick={() => baixar(k)} disabled={baixando !== null}>
              <Download size={16} /> {baixando === k ? 'Gerando…' : 'Baixar planilha'}
            </button>
          </div>
        ))}
      </div>

      <div className="ex-nota">
        <ShieldCheck size={16} aria-hidden="true" />
        <p>
          O arquivo abre no Excel e no Google Planilhas. As fichas de anamnese não
          entram: são dado de saúde, e continuam só na ficha de cada cliente.
          Cada download fica anotado no Registro, com quem baixou e quando.
        </p>
      </div>
    </>
  );
}
