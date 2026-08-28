import 'dotenv/config';
import { app } from './app.js';
import { iniciarBanco } from './db.js';
import { iniciarJobs } from './jobs/mensagens.js';

const porta = process.env.PORT || 3333;

// As migrations rodam antes de aceitar requisição: subir a API contra um banco
// com esquema velho é pior do que não subir.
iniciarBanco()
  .then(() => {
    app.listen(porta, () => {
      // A URL carrega a senha do banco; nunca imprima inteira.
      const alvo = (process.env.DATABASE_URL || '').replace(/:[^:@/]*@/, ':***@');
      console.log(`
  Estúdio Agenda · API em http://localhost:${porta}`);
      console.log(`  Banco: ${alvo || '(DATABASE_URL não definida)'}`);
      console.log('  Painel protegido por login (argon2 + sessão em cookie).');
      iniciarJobs();
    });
  })
  .catch(erro => {
    console.error(`
  Não foi possível preparar o banco: ${erro.message}
`);
    process.exit(1);
  });
