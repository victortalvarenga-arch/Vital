import { useState } from 'react';
import { ChevronLeft, ChevronRight, Instagram, Star } from 'lucide-react';
import { Revela } from './App.jsx';

/**
 * Seções extras do modelo Clínica — a referência (inspiraestetica.com.br)
 * tem equipe, mapa, Instagram, antes/depois e avaliações; os outros três
 * modelos não pediram nenhuma delas, então ficam neste arquivo à parte em
 * vez de inchar App.jsx com algo que só um modelo usa.
 *
 * Nenhuma delas inventa conteúdo. Equipe e mapa usam dado real (profissionais
 * cadastrados, endereço da empresa). Antes/depois e avaliações não têm dado
 * nenhum para mostrar hoje — o produto é pré-lançamento, sem cliente real —
 * então o mecanismo existe e funciona, mas o conteúdo é um estado vazio
 * honesto, nunca uma foto ou um depoimento de mentira. Ver PRODUCT.md,
 * "Evidence on Hand".
 */

/* ── equipe ── */

export function SecaoEquipe({ profissionais }) {
  if (!profissionais?.length) return null;
  return (
    <section className="bloco bloco-cheio">
      <div className="env-largo">
        <Revela><h2 className="bloco-titulo">Quem cuida de você</h2></Revela>
        <div className="equipe-grade">
          {profissionais.map((p, i) => (
            <Revela key={p.id} className={`atraso-${Math.min(i, 5)}`}>
              <article className="equipe-item">
                <span className="equipe-foto" style={p.cor ? { background: `${p.cor}1F`, color: p.cor } : undefined}>
                  {p.nome.trim()[0].toUpperCase()}
                </span>
                <h4>{p.nome}</h4>
                {p.funcao && <p>{p.funcao}</p>}
              </article>
            </Revela>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── antes e depois ──
   O controle é um <input type="range"> de verdade, não um enfeite — dá pra
   arrastar com teclado, mouse ou dedo. Os dois lados são só um rótulo e uma
   cor lavada, nunca uma foto: nada aqui pode parecer um caso real. */

export function SecaoAntesDepois() {
  const [pos, setPos] = useState(50);
  return (
    <section className="bloco bloco-marca">
      <div className="env-largo">
        <Revela>
          <div className="secao-cab">
            <h2 className="bloco-titulo">Antes e depois</h2>
            <span className="em-breve">Em breve</span>
          </div>
        </Revela>
        <Revela>
          <div className="ad-slider" style={{ '--pos': `${pos}%` }}>
            <div className="ad-lado ad-antes"><span>Antes</span></div>
            <div className="ad-lado ad-depois"><span>Depois</span></div>
            <div className="ad-alca" style={{ left: `${pos}%` }} aria-hidden="true">
              <ChevronLeft size={12} /><ChevronRight size={12} />
            </div>
            <input type="range" min={0} max={100} value={pos}
                   onChange={e => setPos(+e.target.value)}
                   className="ad-controle" aria-label="Arrastar para comparar antes e depois" />
          </div>
        </Revela>
        <p className="ad-legenda">
          Fotos reais de clientes, sempre com autorização, entram aqui assim que o primeiro caso estiver pronto para mostrar.
        </p>
      </div>
    </section>
  );
}

/* ── avaliações ──
   Sem carrossel de mentira sobre zero avaliação real. */

export function SecaoAvaliacoes() {
  return (
    <section className="bloco">
      <div className="env-largo">
        <Revela><h2 className="bloco-titulo">Avaliações</h2></Revela>
        <Revela>
          <div className="vazio-cartao">
            <Star size={22} strokeWidth={1.5} aria-hidden="true" />
            <p>As avaliações de clientes aparecem aqui assim que o negócio começar a receber.</p>
          </div>
        </Revela>
      </div>
    </section>
  );
}

/* ── instagram ──
   Link de verdade para o perfil real — nunca um grid fingindo mostrar posts
   que o site não tem acesso a carregar. */

export function SecaoInstagram({ negocio }) {
  if (!negocio.instagram) return null;
  const arroba = negocio.instagram.replace('@', '');
  return (
    <section className="bloco bloco-marca">
      <div className="env-largo insta-painel">
        <Instagram size={28} strokeWidth={1.6} aria-hidden="true" />
        <div className="insta-txt">
          <h2 className="bloco-titulo" style={{ marginBottom: 4 }}>@{arroba}</h2>
          <p>Acompanhe o dia a dia do estúdio no Instagram.</p>
        </div>
        <a className="b b-p" href={`https://instagram.com/${arroba}`} target="_blank" rel="noreferrer">
          Seguir no Instagram
        </a>
      </div>
    </section>
  );
}

/* ── mapa ──
   Embed do Google Maps sem chave de API — só o endereço da própria empresa,
   nunca uma localização inventada. */

export function SecaoMapa({ negocio }) {
  if (!negocio.endereco) return null;
  return (
    <section className="bloco">
      <div className="env-largo">
        <Revela><h2 className="bloco-titulo">Como chegar</h2></Revela>
        <Revela>
          <div className="mapa-caixa">
            <iframe
              title="Localização no mapa"
              src={`https://www.google.com/maps?q=${encodeURIComponent(negocio.endereco)}&output=embed`}
              loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        </Revela>
      </div>
    </section>
  );
}
