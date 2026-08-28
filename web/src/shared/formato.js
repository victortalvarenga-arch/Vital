/**
 * Formatação de valores, compartilhada entre o site e o painel.
 *
 * Vive em `shared/` porque a mesma conta aparecia escrita duas vezes, com
 * comportamentos ligeiramente diferentes para valor ausente — e ausente tem
 * significado aqui: serviço "sob consulta" não mostra preço nenhum, e não
 * R$ 0,00, que diria à cliente que é de graça.
 *
 * Este módulo não fala com a API: pode ser importado pelo bundle público sem
 * arrastar credencial de painel junto.
 */

/** Número em reais. Ausente ou inválido devolve vazio, nunca "R$ 0,00". */
export const brl = v =>
  v == null || !Number.isFinite(Number(v))
    ? ''
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
