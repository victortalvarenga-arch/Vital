import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * As publicações do Instagram que a vitrine devolve.
 *
 * `config.instagramPosts` é preenchida pela empresa (hoje) ou por um job (quando
 * a conexão com a conta existir), e a vitrine é pública. Três regras, todas do
 * lado do servidor porque o front se contorna: sem imagem não sai, mais de seis
 * não sai, e só saem as chaves escolhidas — campo novo na config não vaza para
 * a vitrine por descuido (regra do CLAUDE.md).
 */

let db, api, dona;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  ({ dono: dona } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

describe('publicações do Instagram na vitrine', () => {
  test('só o que tem imagem, no máximo seis, e só as chaves públicas', async () => {
    const r = await dona('PUT', '/api/config', {
      instagram: 'perfil_x',
      instagramPosts: [
        // A primeira tem tudo, mais uma chave que não é pública.
        { imagem: '/uploads/default/a.jpg', link: 'https://instagram.com/p/1', tipo: 'video', token: 'segredo' },
        // Estas duas não têm imagem: não há o que mostrar.
        { imagem: '', link: 'https://instagram.com/p/2' },
        { link: 'https://instagram.com/p/3' },
        // Sete com imagem: a grade tem lugar para seis, contando a primeira.
        ...Array.from({ length: 7 }, (_, i) => ({ imagem: `/uploads/default/${i}.jpg` })),
      ],
    });
    assert.equal(r.status, 200);

    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.equal(corpo.negocio.instagram, 'perfil_x');
    assert.equal(corpo.instagramPosts.length, 6, 'a grade é 3×2');
    assert.deepEqual(corpo.instagramPosts[0],
      { imagem: '/uploads/default/a.jpg', link: 'https://instagram.com/p/1', tipo: 'video' },
      'só imagem, link e tipo — nada além');
    assert.deepEqual(corpo.instagramPosts[1],
      { imagem: '/uploads/default/0.jpg', link: '', tipo: 'imagem' },
      'sem link vira texto vazio (o site abre o perfil); sem tipo é imagem');
    assert.ok(corpo.instagramPosts.every(p => p.imagem), 'nenhuma sem imagem passou');
  });

  test('tipo desconhecido vira imagem, nunca sai como veio', async () => {
    await dona('PUT', '/api/config', {
      instagramPosts: [{ imagem: '/uploads/default/a.jpg', tipo: 'carrossel' }],
    });
    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.equal(corpo.instagramPosts[0].tipo, 'imagem');
  });

  test('sem publicações a lista vem vazia — nunca inventada', async () => {
    await dona('PUT', '/api/config', { instagramPosts: [] });
    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.deepEqual(corpo.instagramPosts, []);
  });
});
