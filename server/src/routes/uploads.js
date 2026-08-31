import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rota } from '../lib/rota.js';
import { R2_ATIVO, subirParaR2 } from '../lib/r2.js';

export const uploads = Router();

export const PASTA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../uploads'
);

// Sem barra no fim — a chave completa (`<empresa>/<arquivo>`) é acrescentada
// na hora de montar a URL. Mesma variável que o seed já lê para as fotos do
// cenário de exemplo (ver seed.js).
const BASE_R2 = (process.env.UPLOADS_BASE_URL || '').replace(/\/+$/, '');
// As duas coisas precisam existir: credencial para gravar no bucket e URL
// pública para alguém ler de volta. Uma sem a outra é config pela metade —
// melhor cair no disco local com aviso do que subir para um bucket que
// ninguém consegue enxergar.
const R2_PRONTO = R2_ATIVO && !!BASE_R2;
if (R2_ATIVO && !BASE_R2) {
  console.warn('R2_* configurado mas UPLOADS_BASE_URL está vazia — uploads vão continuar em disco.');
}

/**
 * Recebe a imagem já redimensionada pelo navegador, como data URL em JSON.
 *
 * Por que não multipart: o navegador consegue reduzir a imagem antes de subir
 * (canvas), e é isso que a gente quer de qualquer jeito — a foto de 8 MB da
 * câmera não deve nem sair do celular. Recebendo o resultado como texto,
 * economiza uma dependência e o tamanho já chega controlado.
 *
 * O nome do arquivo é sempre gerado aqui. Nome vindo do cliente é caminho para
 * `../../` e para sobrescrever arquivo de outra empresa.
 */

const TIPOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const LIMITE = 3 * 1024 * 1024;   // 3 MB depois do redimensionamento

uploads.post(
  '/',
  express.json({ limit: '6mb' }),   // base64 infla ~33%; o limite real é o de baixo
  rota(async (req, res) => {
    const { arquivo, uso } = req.body || {};
    if (typeof arquivo !== 'string') {
      return res.status(400).json({ erro: 'envie o arquivo como data URL' });
    }

    const m = /^data:([\w/+-]+);base64,(.+)$/s.exec(arquivo);
    if (!m) return res.status(400).json({ erro: 'formato inválido' });

    const extensao = TIPOS[m[1]];
    if (!extensao) return res.status(415).json({ erro: 'use JPEG, PNG ou WebP' });

    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > LIMITE) {
      return res.status(413).json({ erro: 'imagem muito grande (máximo 3 MB)' });
    }

    const rotulo = String(uso || 'img').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'img';
    const nome = `${rotulo}-${crypto.randomBytes(8).toString('hex')}.${extensao}`;
    // Uma pasta por empresa nos dois destinos: imagem de uma nunca fica ao
    // lado da de outra, e apagar tudo de um cliente que saiu vira apagar uma
    // pasta (ou tudo sob o prefixo, no bucket).
    const chave = `${req.tenantId}/${nome}`;

    if (R2_PRONTO) {
      await subirParaR2(chave, bytes, m[1]);
      return res.status(201).json({ url: `${BASE_R2}/${chave}`, bytes: bytes.length });
    }

    // Sem R2 configurado: disco local, como sempre — o que faz `npm run dev`
    // funcionar sem nenhuma credencial de nuvem. Único ponto do produto que
    // ainda depende de disco persistir entre deploys (ver ROADMAP.md).
    const destino = path.join(PASTA, req.tenantId);
    await fs.promises.mkdir(destino, { recursive: true });
    await fs.promises.writeFile(path.join(destino, nome), bytes);
    res.status(201).json({ url: `/uploads/${chave}`, bytes: bytes.length });
  })
);
