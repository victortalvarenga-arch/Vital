import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rota } from '../lib/rota.js';

export const uploads = Router();

export const PASTA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../uploads'
);

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

    // Uma pasta por empresa: imagem de uma nunca fica ao lado da de outra, e
    // apagar tudo de um cliente que saiu vira apagar uma pasta.
    const destino = path.join(PASTA, req.tenantId);
    await fs.promises.mkdir(destino, { recursive: true });

    const rotulo = String(uso || 'img').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'img';
    const nome = `${rotulo}-${crypto.randomBytes(8).toString('hex')}.${extensao}`;
    await fs.promises.writeFile(path.join(destino, nome), bytes);

    res.status(201).json({ url: `/uploads/${req.tenantId}/${nome}`, bytes: bytes.length });
  })
);
