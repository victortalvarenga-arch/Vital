import 'dotenv/config';
import { db, uid, setConfig, salvarVinculos } from './db.js';
import { hoje, addDias } from './lib/dates.js';
import { TEMPLATES_PADRAO } from './lib/templates.js';

/**
 * Popula o banco com um estúdio de exemplo. Rode com `npm run seed`.
 * É idempotente: se já houver serviços, não faz nada (use `npm run reset` para zerar).
 */

const jaTem = db.prepare('SELECT COUNT(*) n FROM services').get().n > 0;
if (jaTem && !process.argv.includes('--forcar')) {
  console.log('Banco já populado. Use `npm run reset` para recomeçar do zero.');
  process.exit(0);
}

const h = hoje();

setConfig({
  nome: 'Estúdio Lume',
  slogan: 'Estética & beleza · Joinville',
  fone: '47996195696',
  endereco: 'Rua Félix Heinzelmann, 320 — Joinville/SC',
  instagram: 'estudiolume',
  pixChave: 'contato@estudiolume.com.br',
  linkAvaliacao: 'https://g.page/estudiolume',
  whatsapp: '47996195696',
  mapa: 'https://maps.google.com/?q=Rua+Felix+Heinzelmann+320+Joinville',
  marca: {
    corPrimaria: '#A32A4E',
    corFundo: '#FFFFFF',
    corTexto: '#1A1A1A',
  },
  textos: {
    chamada: 'Agende seu horário',
    botaoAgendar: 'Agendar',
  },
  janelaDias: 30,            // quantos dias à frente o site deixa agendar
  antecedenciaHoras: 2,      // mínimo entre agora e o horário agendado
  passoAgenda: 30,           // granularidade da grade, em minutos
  horaLembreteVespera: '18:00',
  horasAvisoNoDia: 3,
  horaPosAtendimento: '11:00',
  horaCampanha: '10:00',
  diasAntesAniversario: 7,
  diasReativacao: 60,
});

const staff = [
  { id: 's1', nome: 'Laura Prado', funcao: 'Proprietária · Unhas', cor: '#A32A4E', comissao: 0, fone: '47996195696',
    jornada: { 1: ['09:00', '19:00'], 2: ['09:00', '19:00'], 3: ['09:00', '19:00'], 4: ['09:00', '19:00'], 5: ['09:00', '19:00'], 6: ['08:30', '14:00'] } },
  { id: 's2', nome: 'Bia Menezes', funcao: 'Cílios e sobrancelhas', cor: '#6A57C7', comissao: 40, fone: '47988887777',
    jornada: { 2: ['10:00', '19:00'], 3: ['10:00', '19:00'], 4: ['10:00', '19:00'], 5: ['10:00', '20:00'], 6: ['09:00', '15:00'] } },
  { id: 's3', nome: 'Karen Souza', funcao: 'Estética facial', cor: '#3E7D63', comissao: 45, fone: '47977776666',
    jornada: { 1: ['13:00', '19:00'], 3: ['13:00', '19:00'], 5: ['13:00', '19:00'] } },
];
const insStaff = db.prepare(
  `INSERT INTO staff (id,nome,funcao,fone,cor,comissao,jornada,ativo,criado_em) VALUES (?,?,?,?,?,?,?,1,?)`);
staff.forEach(p => insStaff.run(p.id, p.nome, p.funcao, p.fone, p.cor, p.comissao, JSON.stringify(p.jornada), h));

const servicos = [
  ['v1', 'Esmaltação em gel', 'Unhas', 'Esmaltação curada na cabine, durabilidade de 3 semanas.', 85, 75, ['s1']],
  ['v2', 'Alongamento em fibra', 'Unhas', 'Alongamento F1 com acabamento em gel.', 160, 150, ['s1']],
  ['v3', 'Manutenção de alongamento', 'Unhas', '', 110, 105, ['s1']],
  ['v4', 'Unhas tradicionais', 'Unhas', 'Cutilagem e esmaltação tradicional.', 45, 50, ['s1']],
  ['v5', 'Plástica dos pés', 'Unhas', 'Esfoliação, hidratação profunda e esmaltação.', 95, 70, ['s1']],
  ['v6', 'Extensão de cílios 5D', 'Olhar', 'Volume russo com fios tecnológicos.', 190, 135, ['s2']],
  ['v7', 'Manutenção de cílios', 'Olhar', 'Até 21 dias após a aplicação.', 100, 90, ['s2']],
  ['v8', 'Design de sobrancelha', 'Olhar', 'Mapeamento e modelagem com pinça.', 45, 35, ['s2']],
  ['v9', 'Design com henna', 'Olhar', '', 60, 45, ['s2']],
  ['v10', 'Limpeza de pele profunda', 'Facial', 'Extração, alta frequência e máscara calmante.', 180, 90, ['s3']],
  ['v11', 'Peeling de diamante', 'Facial', 'Renovação celular com microdermoabrasão.', 150, 60, ['s3']],
];
const insSvc = db.prepare(
  `INSERT INTO services (id,nome,categoria,descricao,preco,duracao,intervalo,ativo,ordem) VALUES (?,?,?,?,?,?,10,1,?)`);
servicos.forEach(([id, nome, cat, desc, preco, dur, profs], i) => {
  insSvc.run(id, nome, cat, desc, preco, dur, i);
  salvarVinculos(id, profs);
});

const clientes = [
  ['c1', 'Amanda Ribeiro', '47991234567', '1994-09-02', 'Rua das Palmeiras, 210 — Costa e Silva', 'Prefere tons nude.', -240],
  ['c2', 'Juliana Kruger', '47992345678', '1988-03-05', 'Av. Getúlio Vargas, 1180 — Anita Garibaldi', '', -180],
  ['c3', 'Patrícia Lemos', '47993456789', '1999-12-19', 'Rua Blumenau, 45 — América', 'Alergia a acetona.', -95],
  ['c4', 'Camila Fontes', '47994567890', '1991-06-11', 'Rua Iririú, 903 — Iririú', '', -400],
  ['c5', 'Renata Alves', '47995678901', '2001-01-27', 'Rua Dona Francisca, 2200 — Santo Antônio', '', -30],
  ['c6', 'Débora Nunes', '47996789012', '1985-08-30', 'Rua São Paulo, 77 — Bucarein', 'Sempre atrasa 10 min.', -520],
];
const insCli = db.prepare(
  `INSERT INTO clients (id,nome,fone,nascimento,endereco,obs,optin,criado_em) VALUES (?,?,?,?,?,?,1,?)`);
clientes.forEach(([id, nome, fone, nasc, end, obs, d]) => insCli.run(id, nome, fone, nasc, end, obs, addDias(h, d)));

const insAppt = db.prepare(
  `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,pag_status,pag_forma,origem,criado_em)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,'site',?)`);
const mk = (cli, svc, prof, dia, hora, status, pagStatus, forma) => {
  const s = db.prepare('SELECT * FROM services WHERE id=?').get(svc);
  insAppt.run(uid(), cli, svc, prof, addDias(h, dia), hora, s.duracao + s.intervalo, s.preco,
              status, pagStatus, forma, h);
};
mk('c1', 'v1', 's1', 0, '09:00', 'concluido', 'pago', 'pix');
mk('c2', 'v6', 's2', 0, '10:30', 'confirmado', 'pago', 'pix');
mk('c3', 'v4', 's1', 0, '11:00', 'confirmado', 'aberto', 'local');
mk('c5', 'v10', 's3', 0, '14:00', 'agendado', 'aberto', 'local');
mk('c4', 'v2', 's1', 0, '14:30', 'confirmado', 'pago', 'cartao');
mk('c6', 'v8', 's2', 0, '16:00', 'agendado', 'aberto', 'local');
mk('c1', 'v8', 's2', 1, '10:00', 'agendado', 'aberto', 'local');
mk('c3', 'v1', 's1', 1, '15:00', 'agendado', 'pago', 'pix');
mk('c2', 'v11', 's3', 1, '13:30', 'agendado', 'aberto', 'local');
mk('c5', 'v9', 's2', 2, '11:00', 'agendado', 'aberto', 'local');
mk('c1', 'v1', 's1', -21, '09:00', 'concluido', 'pago', 'pix');
mk('c4', 'v3', 's1', -28, '14:30', 'concluido', 'pago', 'cartao');
mk('c6', 'v8', 's2', -95, '16:00', 'concluido', 'pago', 'dinheiro');
mk('c2', 'v6', 's2', -40, '10:30', 'concluido', 'pago', 'pix');

const insTpl = db.prepare(
  `INSERT INTO templates (id,chave,titulo,quando,tipo,ativo,texto) VALUES (?,?,?,?,?,1,?)`);
TEMPLATES_PADRAO.forEach(t => insTpl.run(uid(), t.chave, t.titulo, t.quando, t.tipo, t.texto));

console.log(`Banco populado: ${servicos.length} serviços, ${staff.length} profissionais, ${clientes.length} clientes.`);
