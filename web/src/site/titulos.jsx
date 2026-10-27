/**
 * Os títulos de seção que a empresa escreve (Site da cliente → cada seção →
 * "Título"). Vazio, cada modelo usa o seu. Mora fora de `modelos/` porque a
 * Clínica também lê daqui.
 */
export const tituloProprio = (dados, chave) => String(dados?.textos?.titulos?.[chave] || '').trim();

/**
 * Título com a última palavra em itálico, para os modelos que destacam assim
 * (Serena, Clínica). Com um título escrito pela empresa não dá para saber que
 * palavra ela destacaria; a última é a regra que o modelo já segue.
 */
export function ComItalico({ texto }) {
  const partes = String(texto || '').trim().split(/\s+/);
  if (partes.length < 2) return <em>{partes[0]}</em>;
  return <>{partes.slice(0, -1).join(' ')} <em>{partes.at(-1)}</em></>;
}
