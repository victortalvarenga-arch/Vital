import { ArrowLeft } from 'lucide-react';
import { soDigitos } from './datas.js';

/**
 * Política de privacidade do site da empresa, aberta em `#privacidade`.
 *
 * Quem decide o que fazer com os dados de quem agenda é a empresa — ela é a
 * controladora, na língua da LGPD; a Vital é a operadora, que trata em nome
 * dela. Por isso o texto fala com a voz da empresa e leva o nome e o WhatsApp
 * dela, vindos da vitrine.
 *
 * O texto descreve o que o sistema faz HOJE: o que o site pede (nome,
 * WhatsApp, recado, e o aniversário depois de confirmar), o login com Google
 * (opcional, o que vem dele e o que NÃO fazemos com o e-mail), o que fica
 * guardado no aparelho de quem agenda, que ficha de saúde não passa pelo site,
 * que a medição não guarda gente, e quem hospeda. Funcionalidade nova que mude
 * qualquer uma dessas frases (o atendente por IA, pagamento online) muda este
 * texto junto — e a data abaixo. Revisão jurídica pendente — ver ROADMAP,
 * "Importante para produção".
 */

export const ATUALIZADA_EM = '14 de novembro de 2026';

export default function Privacidade({ negocio }) {
  const nome = negocio.nome;
  const zap = soDigitos(negocio.whatsapp);
  const contato = zap
    ? <a href={`https://wa.me/55${zap}`} target="_blank" rel="noreferrer">pelo WhatsApp da {nome}</a>
    : <>diretamente com a {nome}</>;

  return (
    <main className="priv">
      <div className="env">
        <a className="priv-voltar" href="#"><ArrowLeft size={16} /> Voltar ao site</a>
        <h1>Política de privacidade</h1>
        <p className="priv-data">Atualizada em {ATUALIZADA_EM}</p>
        <p>Esta política explica como a {nome} trata os seus dados quando você agenda um horário por este site.</p>

        <h2>Quem cuida dos seus dados</h2>
        <p>
          A {nome} é a responsável pelos seus dados. O site e o sistema de agendamento são fornecidos pela
          Vital, que trata os dados em nome da {nome} e só para que o agendamento funcione.
        </p>

        <h2>Quais dados pedimos</h2>
        <p>
          Para agendar: seu nome e seu WhatsApp e, se você escrever, o recado do agendamento. Junto com
          eles ficam o serviço, a data e o horário que você escolheu, e o histórico dos seus atendimentos.
        </p>
        <p>
          Depois que o horário está confirmado, podemos perguntar o dia e o mês do seu aniversário. É
          opcional — você pode pular —, não pedimos o ano, e serve só para te mandar um parabéns.
        </p>
        <p>
          Não pedimos ficha de saúde por aqui. Quando o atendimento precisa de uma, ela é preenchida
          pessoalmente, com a profissional.
        </p>
        <p>
          Para saber em que etapa do agendamento as pessoas desistem, contamos as visitas com um número
          sorteado que é apagado quando você fecha a aba e nunca é ligado ao seu nome ou telefone. Não
          usamos cookies de propaganda nem de rastreamento.
        </p>

        <h2>Entrar com Google, se você quiser</h2>
        <p>
          O site tem um botão de entrar com a sua conta do Google. Ele é <strong>opcional</strong>:
          agendar informando só o WhatsApp continua funcionando do mesmo jeito, e é o que acontece se
          você não tocar nele.
        </p>
        <p>
          Se você entrar, recebemos da sua conta o <strong>nome, o e-mail e o identificador dela</strong> —
          e nada além disso. Não recebemos seu telefone, sua agenda nem seus contatos. O seu WhatsApp
          continua sendo pedido, porque é por ele que a confirmação chega.
        </p>
        <p>
          Guardamos o e-mail junto da sua ficha para reconhecer você quando voltar.
          <strong> Não enviamos e-mail para você</strong>: tudo o que a {nome} te manda vai pelo WhatsApp.
        </p>
        <p>
          Se o WhatsApp que você informar já tiver cadastro aqui, a sua conta <strong>não</strong> é ligada
          a ele na hora — alguém pode ter digitado um número que não é seu. O pedido fica guardado e a
          {' '}{nome} confirma antes.
        </p>
        <p>
          O Google só é acionado quando você chega nessa etapa do agendamento e toca no botão; até lá, o
          site não fala com ele. Ao tocar, o Google sabe que você está entrando neste site, e o que ele faz
          com isso é regido pela política de privacidade dele.
        </p>

        <h2>O que fica no seu aparelho</h2>
        <p>
          Depois de um agendamento, o seu WhatsApp fica guardado neste navegador para você não precisar
          digitá-lo da próxima vez. Ele fica <strong>só aqui, no seu aparelho</strong>: não é login, não
          dá acesso a nada e não é enviado para lugar nenhum por causa disso.
        </p>
        <p>
          Na hora de agendar, o número aparece encoberto — só o DDD e os quatro últimos — e o botão
          <strong> “Não sou eu · trocar número”</strong> apaga esse registro na hora. Limpar os dados do
          site pelo navegador também apaga.
        </p>

        <h2>Para que usamos</h2>
        <ul>
          <li>Marcar, remarcar e cancelar o seu horário.</li>
          <li>Confirmar e lembrar o horário pelo WhatsApp.</li>
          <li>Reconhecer você nos próximos agendamentos, sem pedir tudo de novo.</li>
          <li>
            Mandar novidades, promoções e mensagem de aniversário, só se você aceitou ao agendar. Para
            parar, é só pedir {contato}.
          </li>
        </ul>
        <p>
          O agendamento e os lembretes são feitos porque você pediu o serviço; novidades e promoções,
          porque você consentiu.
        </p>

        <h2>Com quem compartilhamos</h2>
        <p>
          Seus dados não são vendidos nem cedidos para propaganda. Para o sistema funcionar, eles ficam
          guardados em empresas que prestam serviço à Vital: Fly.io (servidores) e Neon (banco de dados),
          os dois em São Paulo, e Cloudflare (rede e imagens). Algumas dessas empresas são estrangeiras,
          e por isso pode haver transferência de dados para fora do Brasil, sempre para prestar este
          serviço. As mensagens de WhatsApp saem do WhatsApp da própria {nome}. Se você
          usar o botão de entrar com o Google, ele também fica sabendo que você entrou neste site —
          mas nada do seu agendamento é enviado para lá.
        </p>

        <h2>Por quanto tempo</h2>
        <p>
          Enquanto você for cliente da {nome} e pelo tempo que a lei exigir. Você pode pedir para apagar
          seus dados a qualquer momento.
        </p>

        <h2>Seus direitos</h2>
        <p>
          Você pode confirmar se temos dados seus, ver quais são, corrigir, pedir que sejam apagados,
          levar para outro lugar, saber com quem foram compartilhados e retirar o consentimento para
          novidades e promoções. Peça {contato}. Se não for atendida, você também pode reclamar à
          Autoridade Nacional de Proteção de Dados (ANPD).
        </p>

        <h2>Segurança</h2>
        <p>
          O site usa conexão criptografada, os dados de cada empresa ficam separados no banco de dados e o
          painel da equipe só abre com senha.
        </p>
      </div>
    </main>
  );
}
