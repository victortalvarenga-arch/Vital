import { ArrowLeft } from 'lucide-react';
import './inicio.css';

/**
 * Termos de uso (`#termos`) e política de privacidade da Vital (`#privacidade`).
 *
 * Os dois falam do que existe HOJE: sem cobrança, sem pagamento online, sem
 * atendente por IA ligado, e com apagar a empresa feito a pedido (não há botão
 * para isso — ver ROADMAP, "Dados pessoais"). Quem muda uma dessas coisas muda
 * o texto junto.
 *
 * A Vital aparece aqui como controladora dos dados das empresas que se
 * cadastram, e como operadora dos dados das clientes delas — a política de
 * quem agenda mora no site de cada empresa (`site/Privacidade.jsx`).
 *
 * Revisão jurídica pendente, e a identificação formal da Vital (razão social e
 * CNPJ) entra quando existir — ver ROADMAP, "Importante para produção".
 */

const ATUALIZADO_EM = '27 de outubro de 2026';
const EMAIL = 'vital.automations@gmail.com';
const Email = () => <a href={`mailto:${EMAIL}`}>{EMAIL}</a>;

const TERMOS = {
  titulo: 'Termos de uso',
  intro: 'Estes termos valem para a empresa que cria uma conta na Vital e para quem usa o painel em nome dela.',
  secoes: [
    ['O que é a Vital', <>
      <p>A Vital é um sistema de agendamento: um site onde as clientes da empresa marcam horário, um painel
        para a equipe organizar a agenda, as clientes e o caixa, e mensagens prontas para o WhatsApp.</p>
    </>],
    ['A sua conta', <>
      <p>Quem cria a conta informa dados verdadeiros e é responsável pela senha e por quem recebe acesso ao
        painel. O dono da conta decide o que cada pessoa da equipe pode ver.</p>
    </>],
    ['Uso permitido', <>
      <p>Não é permitido usar a Vital para nada ilegal, para mandar mensagem a quem não quer receber, nem para
        publicar foto ou dado de outra pessoa sem autorização. Fotos de antes e depois só com a autorização
        da cliente registrada no painel.</p>
    </>],
    ['Os dados das suas clientes', <>
      <p>A empresa é a responsável pelos dados das próprias clientes (controladora, na Lei Geral de Proteção
        de Dados). A Vital trata esses dados em nome da empresa (operadora), só para prestar o serviço, e não
        os usa para mais nada nem os vende.</p>
      <p>O site de cada empresa já traz uma política de privacidade para quem agenda. A empresa pode baixar
        as clientes e os agendamentos em planilha quando quiser.</p>
    </>],
    ['Preço', <>
      <p>Hoje a Vital não cobra pelo uso. Antes de qualquer cobrança, a empresa é avisada com antecedência e
        decide se continua.</p>
    </>],
    ['Funcionamento', <>
      <p>Fazemos o possível para o sistema ficar no ar o tempo todo e guardamos cópias de segurança do banco
        de dados, mas não há garantia de funcionamento sem interrupção. A Vital não responde pelo atendimento
        que a empresa presta às suas clientes.</p>
    </>],
    ['Encerrar a conta', <>
      <p>A empresa pode sair quando quiser. Antes, pode baixar os dados pelo painel. Para apagar a conta e
        tudo o que está nela, peça pelo e-mail <Email />.</p>
    </>],
    ['Mudanças e contato', <>
      <p>Se estes termos mudarem, avisamos pelo painel ou por e-mail antes de valer. Dúvidas: <Email />.</p>
    </>],
  ],
};

const PRIVACIDADE = {
  titulo: 'Política de privacidade da Vital',
  intro: 'Esta política explica como a Vital trata os dados de quem cria conta e usa o painel. Os dados de quem agenda no site de uma empresa seguem a política daquele site.',
  secoes: [
    ['Quais dados guardamos', <>
      <p>Da empresa: nome do negócio e o que ela faz. De quem usa o painel: nome, e-mail e senha — a senha é
        guardada só de forma cifrada, que nem nós conseguimos ler. Também guardamos o registro do que cada
        pessoa fez no painel e os chamados de suporte.</p>
      <p>Para proteger o cadastro contra robôs, a página pode usar a verificação da Cloudflare, e o número
        de tentativas por endereço de internet é contado por alguns minutos.</p>
    </>],
    ['Para que usamos', <>
      <ul>
        <li>Criar a conta e deixar entrar no painel.</li>
        <li>Recuperar a senha por e-mail.</li>
        <li>Responder chamados de suporte.</li>
        <li>Proteger o sistema contra uso indevido.</li>
      </ul>
    </>],
    ['Com quem compartilhamos', <>
      <p>Com as empresas que fazem o sistema funcionar: Fly.io (servidores) e Neon (banco de dados), os dois
        em São Paulo, Cloudflare (rede, imagens e anti-robô) e Resend (envio de e-mail). Algumas são
        estrangeiras, e por isso pode haver transferência de dados para fora do Brasil, sempre para prestar
        este serviço. Não vendemos dados.</p>
    </>],
    ['Os dados das clientes das empresas', <>
      <p>Nesses dados a Vital é operadora: trata em nome de cada empresa, só para o agendamento funcionar.
        Os dados de uma empresa ficam separados das outras no próprio banco de dados.</p>
    </>],
    ['Seus direitos', <>
      <p>Você pode pedir para ver, corrigir ou apagar os seus dados, e saber com quem foram compartilhados,
        pelo e-mail <Email />. Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
    </>],
  ],
};

export default function Legal({ qual }) {
  const doc = qual === 'termos' ? TERMOS : PRIVACIDADE;
  return (
    <div className="lp lp-legal">
      <div className="lp-in">
        <a className="lp-legal-voltar" href="#"><ArrowLeft size={16} /> Voltar</a>
        <h1>{doc.titulo}</h1>
        <p className="lp-legal-data">Atualizado em {ATUALIZADO_EM}</p>
        <p>{doc.intro}</p>
        {doc.secoes.map(([titulo, corpo]) => (
          <section key={titulo}>
            <h2>{titulo}</h2>
            {corpo}
          </section>
        ))}
      </div>
    </div>
  );
}
