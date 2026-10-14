import 'dotenv/config';
import { iniciarJobs } from './mensagens.js';

/**
 * Os jobs num processo próprio: `npm run jobs`.
 *
 * Opcional. Por padrão a API também roda os jobs, e a trava de
 * `lib/lideranca.js` garante que só um processo os rode de cada vez. Separar
 * vale quando a API tem mais de uma cópia ou quando um job pesado não pode
 * disputar com quem está agendando — aí a API sobe com `JOBS_NA_API=nao`.
 *
 * Não roda migration: quem migra é a API ao subir. Este processo só lê e
 * grava o que os jobs precisam.
 */
iniciarJobs();
