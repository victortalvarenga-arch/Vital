import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, subirApi, apagarEmpresa } from './ambiente.js';

/**
 * O percurso inteiro de uma empresa nova, do cadastro ao primeiro atendimento.
 *
 * Todo outro arquivo de teste parte de um cenário pronto; este parte do nada,
 * como um cliente de verdade. Foi feito à mão em 2026-10-10 e achou três falhas
 * que a suíte não via: o link do painel depois do cadastro, o site aceitando
 * data passada e profissional que não faz o serviço. Virou teste para o
 * caminho não se quebrar de novo sem ninguém notar.
 *
 * Um teste só, em passos: cada passo depende do anterior, como na vida.
 */

const SENHA = 'senha-do-percurso-1';
let db, api, dates, idEmpresa;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  dates = await import('../src/lib/dates.js');
});

after(async () => {
  if (idEmpresa) await apagarEmpresa(idEmpresa);
  const { esquecerCacheDeEmpresas } = await import('../src/lib/tenant.js');
  esquecerCacheDeEmpresas();
  await api.fechar();
  await db.pool.end();
});

/**
 * O primeiro dia útil a partir de `desde`. Encadeado, e não "hoje + N": numa
 * quinta, hoje+2 e hoje+3 caem os dois na segunda, e o teste marcava a
 * promoção em cima do atendimento — só falhava em certos dias da semana.
 */
function diaUtil(desde) {
  let d = desde;
  while ([0, 6].includes(dates.diaSemana(d))) d = dates.addDias(d, 1);
  return d;
}

test('uma empresa nova, do cadastro ao primeiro atendimento', async () => {
  const passo = (n, ok, detalhe) => assert.ok(ok, `passo ${n}: ${detalhe}`);
  // Dois dias à frente: fora da antecedência, dentro da jornada.
  const DIA = diaUtil(dates.addDias(dates.hoje(), 2));
  const DIA_DA_PROMOCAO = diaUtil(dates.addDias(DIA, 1));
  const SEMANAL = Object.fromEntries([1, 2, 3, 4, 5].map(d => [d, ['09:00', '18:00']]));

  // 1. Cadastro pela página da Vital.
  const cad = await api.noHost('localhost:5173')('POST', '/api/cadastro', {
    nome: 'Percurso Estúdio Íris', ramo: 'Estética', responsavel: 'Ana Percurso',
    email: 'ana@percurso.test', senha: SENHA,
  });
  passo(1, cad.status === 201, JSON.stringify(cad.corpo));
  idEmpresa = cad.corpo.empresa.id;
  const slug = cad.corpo.empresa.endereco;
  passo(1, cad.corpo.painel === `http://${slug}.localhost:5173/painel.html`, `link do painel: ${cad.corpo.painel}`);

  // 2. Entra no painel, no endereço da empresa.
  const host = `${slug}.vital.test`;
  const dona = await api.entrar('ana@percurso.test', SENHA, { host });
  const site = api.noHost(host);
  let estado = (await dona('GET', '/api/estado')).corpo;
  passo(2, estado.config.configurado === false, 'nasce sem configurar (o assistente aparece)');
  passo(2, estado.templates.length > 0, 'nasce com os textos de WhatsApp');
  passo(2, estado.servicos.length === 0 && estado.profissionais.length === 0, 'nasce sem catálogo de ninguém');

  // 3. O assistente: nome, ramo, a primeira pessoa e o primeiro serviço.
  await dona('PUT', '/api/config', { nome: 'Percurso Estúdio Íris', ramo: 'Estética', configurado: true });
  const ana = (await dona('POST', '/api/profissionais', { nome: 'Ana Percurso', jornada: SEMANAL, ativo: true })).corpo.id;
  const limpeza = (await dona('POST', '/api/servicos', {
    nome: 'Limpeza de pele', categoria: '', preco: 150, duracao: 60, ativo: true, profissionais: [ana],
  })).corpo;
  passo(3, limpeza.categoria === '', 'serviço sem categoria fica sem categoria');

  // 4. Mais gente e mais serviço, como a dona faria depois.
  const bia = (await dona('POST', '/api/profissionais', {
    nome: 'Bia Percurso', jornada: SEMANAL, ativo: true, comissao: 40, fone: '(47) 99999-0001',
  })).corpo.id;
  const design = (await dona('POST', '/api/servicos', {
    nome: 'Design de sobrancelha', categoria: 'Sobrancelhas', preco: 60, duracao: 30, ativo: true, profissionais: [ana, bia],
  })).corpo;
  await dona('PUT', '/api/config', {
    whatsapp: '47999990000', endereco: 'Rua das Flores, 100', cidade: 'Joinville', marca: { template: 'clinica' },
  });

  // 5. O site.
  const vitrine = (await site('GET', '/api/publico/vitrine')).corpo;
  passo(5, vitrine.servicos.length === 2, 'os dois serviços na vitrine');
  passo(5, !JSON.stringify(vitrine).includes('99999-0001') && !JSON.stringify(vitrine).includes('47999990001'), 'telefone da equipe não vaza');
  passo(5, !vitrine.servicos.some(s => 'comissao' in s), 'comissão não vaza');
  passo(5, vitrine.negocio.horarios.length > 0, 'horário de atendimento sai da jornada');

  const mes = (await site('GET', `/api/publico/dias-livres?servicoId=${limpeza.id}&mes=${DIA.slice(0, 7)}`)).corpo;
  passo(5, mes.dias.includes(DIA), `o calendário oferece ${DIA}`);
  passo(5, !mes.dias.some(d => d < dates.hoje()), 'o calendário não oferece passado');

  // 6. A cliente agenda.
  const agendar = extra => site('POST', '/api/publico/agendar', {
    fone: '(47) 98888-1111', nome: 'Carla Percurso', nascimento: '1990-05-20',
    servicoId: limpeza.id, profissionalId: ana, data: DIA, hora: '10:00', formaPagamento: 'local', ...extra,
  });
  const ag = await agendar({ obs: 'Pele sensível' });
  passo(6, ag.status === 201, JSON.stringify(ag.corpo));
  const ag1 = ag.corpo.agendamento.id;
  passo(6, (await agendar({ fone: '47977772222', nome: 'Dani Percurso' })).status === 409, 'o mesmo horário não é vendido duas vezes');
  passo(6, (await agendar({ hora: '10:30' })).status === 409, 'sobrepor pelo meio também não');
  passo(6, (await agendar({ data: dates.addDias(dates.hoje(), -2) })).status === 409, 'data passada é recusada');
  passo(6, (await agendar({ profissionalId: bia, hora: '14:00' })).status === 409, 'quem não faz o serviço é recusada');
  const horas = (await site('GET', `/api/publico/horarios?servicoId=${limpeza.id}&profissionalId=${ana}&data=${DIA}`)).corpo.horarios;
  passo(6, !horas.includes('10:00') && !horas.includes('10:30'), 'o horário vendido some da grade');

  // 7. O painel recebe.
  estado = (await dona('GET', '/api/estado')).corpo;
  passo(7, estado.agendamentos.some(a => a.id === ag1 && a.origem === 'site'), 'o agendamento do site aparece no painel');
  passo(7, estado.clientes.some(c => c.fone === '47988881111'), 'telefone guardado só com dígitos');
  await dona('POST', '/api/mensagens/fila/gerar');
  const fila = (await dona('GET', '/api/mensagens/fila')).corpo;
  const confirmacao = (fila.itens || fila).find(m => (m.agendamentoId || m.appointmentId) === ag1);
  passo(7, confirmacao, 'a confirmação de WhatsApp vai para a fila');
  passo(7, !/undefined|null|\{\{/.test(confirmacao.texto) && confirmacao.texto.includes('Carla'), `texto sem variável quebrada: ${confirmacao.texto}`);

  // 8. O atendimento acontece e é pago em duas vezes.
  for (const status of ['confirmado', 'em_atendimento', 'concluido']) {
    const r = await dona('PUT', `/api/agendamentos/${ag1}`, { status });
    passo(8, r.status === 200 && r.corpo.status === status, `status → ${status}`);
  }
  passo(8, (await dona('PUT', `/api/agendamentos/${ag1}`, { pagamento: { forma: 'pix', recebido: 50 } })).corpo.pagamento.status === 'parcial', 'entrada');
  passo(8, (await dona('PUT', `/api/agendamentos/${ag1}`, { pagamento: { forma: 'pix', recebido: 150 } })).corpo.pagamento.status === 'pago', 'quitação');

  // 9. Almoço fechado some do site; promoção aparece e vende.
  await dona('POST', '/api/bloqueios', { profissionalId: ana, data: DIA, horaIni: '12:00', horaFim: '13:00', motivo: 'Almoço' });
  const tarde = (await site('GET', `/api/publico/horarios?servicoId=${limpeza.id}&profissionalId=${ana}&data=${DIA}`)).corpo.horarios;
  passo(9, !tarde.some(h => h >= '11:30' && h < '13:00'), 'o almoço some do site');
  const combo = (await dona('POST', '/api/combos', { nome: 'Dia de cuidado', servicosIds: [limpeza.id, design.id], preco: 180 })).corpo;
  passo(9, (await site('GET', '/api/publico/vitrine')).corpo.combos.some(c => c.id === combo.id), 'a promoção aparece no site');
  const venda = await site('POST', '/api/publico/agendar', {
    fone: '47966663333', nome: 'Elis Percurso', nascimento: '1992-03-03',
    comboId: combo.id, profissionalId: ana, data: DIA_DA_PROMOCAO, hora: '09:00', formaPagamento: 'local',
  });
  passo(9, venda.status === 201 && venda.corpo.agendamentos.length === 2, JSON.stringify(venda.corpo));

  // 10. A funcionária entra e vê só o que é dela.
  const acesso = await dona('POST', '/api/auth/usuarios', {
    nome: 'Bia Percurso', email: 'bia@percurso.test', senha: SENHA, papel: 'funcionario', profissionalId: bia,
  });
  passo(10, acesso.status === 201, JSON.stringify(acesso.corpo));
  const func = await api.entrar('bia@percurso.test', SENHA, { host });
  const delas = (await func('GET', '/api/estado')).corpo;
  passo(10, delas.agendamentos.every(a => a.profissionalId === bia), 'só a própria agenda');
  passo(10, delas.profissionais.find(p => p.id === ana).comissao === null, 'sem a taxa da colega');
  passo(10, (await func('PUT', `/api/agendamentos/${ag1}`, { status: 'cancelado' })).status === 403, 'não mexe na agenda da colega');
  passo(10, (await func('PUT', '/api/config', { nome: 'outro' })).status === 403, 'não muda o site');

  // 11. A dona leva os próprios dados.
  passo(11, (await dona('GET', '/api/exportar/clientes.csv')).status === 200, 'exporta clientes');
});
