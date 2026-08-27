/**
 * Prepara uma imagem escolhida pela pessoa antes de subir.
 *
 * A foto que sai da câmera de um celular tem 4000px e 8 MB. Subir isso inteiro
 * gasta o pacote de dados de quem está cadastrando, enche o disco do servidor e
 * ainda deixa o site lento para a cliente final, que vai ver a mesma imagem
 * espremida em 60px. Reduzir aqui resolve os três de uma vez.
 *
 * Devolve data URL, que é o que a rota de upload espera.
 */
export async function prepararImagem(arquivo, { largura = 1600, qualidade = 0.82 } = {}) {
  if (!arquivo.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem.');
  }

  const bitmap = await criarBitmap(arquivo);
  const escala = Math.min(1, largura / bitmap.width);   // nunca aumenta
  const l = Math.round(bitmap.width * escala);
  const a = Math.round(bitmap.height * escala);

  const tela = document.createElement('canvas');
  tela.width = l;
  tela.height = a;
  const ctx = tela.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, l, a);
  bitmap.close?.();

  // PNG só quando há transparência a preservar (logo, tipicamente).
  const tipo = arquivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return tela.toDataURL(tipo, qualidade);
}

function criarBitmap(arquivo) {
  // createImageBitmap já respeita a orientação EXIF; sem isso, foto tirada
  // na vertical sobe deitada.
  if (window.createImageBitmap) {
    return createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não consegui ler a imagem.'));
    img.src = URL.createObjectURL(arquivo);
  });
}
