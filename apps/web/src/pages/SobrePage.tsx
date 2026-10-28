import { Audiencia, Card, ExternalLink, PageHeader, PrivacidadeControle, Section, Term } from "@/ui";
import { GLOSSARIO } from "@/ui";

const FONTES = [
  { n: "Portal da Transparência (CGU)", u: "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares", d: "Emendas parlamentares: autor, tipo, localidade, função, ação, valores empenhados, liquidados e pagos, favorecidos." },
  { n: "Câmara dos Deputados — Dados Abertos", u: "https://dadosabertos.camara.leg.br", d: "Deputados, proposições, votações, orientações de bancada, despesas da cota parlamentar." },
  { n: "Senado Federal — Dados Abertos", u: "https://legis.senado.leg.br/dadosabertos", d: "Senadores em exercício, matérias e votações." },
  { n: "IBGE — API de Localidades e Malhas", u: "https://servicodados.ibge.gov.br/api/docs", d: "Códigos e nomes de municípios e estados, malhas geográficas dos mapas." },
  { n: "TSE — Dados Abertos", u: "https://dadosabertos.tse.jus.br", d: "Prefeitos e vices eleitos, partidos." },
];

export default function SobrePage() {
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Sobre" title="Transparência que qualquer pessoa entende" subtitle="O emenda.pl reúne, cruza e explica os dados públicos sobre emendas parlamentares e o trabalho do Congresso." breadcrumbs={[{ label: "Início", to: "/" }, { label: "Sobre" }]} />

      <Section title="Missão">
        <p className="text-pretty leading-relaxed">Bilhões de reais em emendas são indicados todos os anos por deputados e senadores. Os dados são públicos, mas espalhados e difíceis de ler. Nosso objetivo é mostrar, de forma simples e verificável, <b>quem indicou, para onde foi, em que foi gasto e quanto foi pago</b> — e ligar isso a quem são os parlamentares e como votam.</p>
      </Section>

      <Section title="Metodologia">
        <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
          <li>Baixamos os arquivos oficiais de emendas do Portal da Transparência e normalizamos tipos (<Term k="emenda individual">individual</Term>, <Term k="emenda pix">Pix</Term>, <Term k="bancada">bancada</Term>, <Term k="comissão">comissão</Term>, <Term k="RP9">relator</Term>).</li>
          <li>Todos os valores são guardados em centavos inteiros para evitar erros de arredondamento.</li>
          <li>Somamos por ano, estado, município, autor, tipo e <Term k="função orçamentária">função</Term>; cada página mostra também a lista completa de registros, exportável em CSV.</li>
          <li>Ligamos municípios ao <Term k="código IBGE">código IBGE</Term> e autores aos cadastros da Câmara e do Senado pelo nome normalizado.</li>
          <li>Dados de parlamentares, proposições e votações vêm ao vivo das APIs oficiais, com cache.</li>
        </ol>
      </Section>

      <Section title="Fontes">
        <div className="grid gap-3 sm:grid-cols-2">
          {FONTES.map((f) => (
            <Card key={f.n} title={<ExternalLink href={f.u}>{f.n}</ExternalLink>}><p className="text-sm text-muted">{f.d}</p></Card>
          ))}
        </div>
      </Section>

      <Section title="Limitações">
        <ul className="list-disc space-y-2 pl-5 leading-relaxed">
          <li>Emendas Pix não informam a finalidade no momento da transferência; o uso real depende da prestação de contas do município.</li>
          <li>Emendas de relator (RP9) anteriores a 2023 frequentemente não identificam o parlamentar que pediu o recurso.</li>
          <li>O cruzamento por nome entre bases pode falhar em homônimos ou nomes alterados; sempre confira no link oficial.</li>
          <li><Term k="CPF mascarado">CPFs</Term> de pessoas físicas aparecem mascarados, como na fonte.</li>
          <li>Os dados são atualizados periodicamente e podem ter atraso em relação ao Portal.</li>
        </ul>
      </Section>

      <Section title="Glossário">
        <dl className="grid gap-3 sm:grid-cols-2">
          {Object.entries(GLOSSARIO).map(([k, v]) => (
            <div key={k} className="card p-4"><dt className="font-semibold">{k}</dt><dd className="mt-1 text-sm text-muted">{v}</dd></div>
          ))}
        </dl>
      </Section>

      <Section title="Privacidade" id="privacidade" tip="Como medimos a audiência e como desativar.">
        <div className="card space-y-4 p-5 leading-relaxed">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="font-semibold">O que coletamos</dt>
            <dd>Um cookie próprio <code className="rounded bg-surface-2 px-1">ep_vid</code> com um identificador aleatório. No servidor, ele é combinado com o dia e um segredo (hash diário) e só esse hash é usado. Não guardamos IP, nome, e-mail nem dados do navegador. Guardamos apenas totais agregados: online agora, visitantes por dia, semana e mês.</dd>
            <dt className="font-semibold">Para quê</dt>
            <dd>Mostrar a audiência pública do projeto. Sem terceiros, sem perfis individuais e sem compartilhamento de dados.</dd>
            <dt className="font-semibold">Base legal</dt>
            <dd>Legítimo interesse (LGPD art. 7º, IX), com teste de balanceamento (art. 10): finalidade legítima e concreta, dados mínimos e anonimizados, expectativa razoável de quem visita um site público, e direito de oposição fácil, a qualquer momento.</dd>
            <dt className="font-semibold">Retenção</dt>
            <dd>Cookie: até 12 meses. Hashes diários: apagados no dia seguinte. Presença "online": cerca de 5 minutos, só em memória. Contagens agregadas por dia: até ~400 dias.</dd>
            <dt className="font-semibold">Como desativar</dt>
            <dd>Use o botão abaixo (a escolha fica salva neste navegador) ou ative Do Not Track / Global Privacy Control: nesses casos nenhuma visita é enviada.</dd>
            <dt className="font-semibold">Controladora</dt>
            <dd>Júlia Klee — contato: <ExternalLink href="https://x.com/klee00z">@klee00z</ExternalLink> ou issue no <ExternalLink href="https://github.com/kleeedolinux/emenda.pl/issues">repositório</ExternalLink>.</dd>
            <dt className="font-semibold">Transparência</dt>
            <dd>Os números de audiência são públicos: veja o <a className="link" href="#audiencia">painel abaixo</a>.</dd>
          </dl>
          <PrivacidadeControle />
        </div>
      </Section>

      <Section title="Audiência" id="audiencia" tip="Números públicos de visitas, contados de forma anônima.">
        <Audiencia />
      </Section>

      <Section title="Licença e autoria">
        <p className="leading-relaxed">Software livre sob a licença <ExternalLink href="https://www.gnu.org/licenses/gpl-3.0.html">GPL-3.0</ExternalLink>. Criado por <ExternalLink href="https://x.com/klee00z">Júlia Klee (@klee00z)</ExternalLink>.</p>
        <ul className="mt-3 space-y-1">
          <li>Código: <ExternalLink href="https://github.com/kleeedolinux/emenda.pl">github.com/kleeedolinux/emenda.pl</ExternalLink></li>
          <li>Dados processados: <ExternalLink href="https://github.com/kleeedolinux/emenda-pl-data">github.com/kleeedolinux/emenda-pl-data</ExternalLink></li>
        </ul>
        <p className="mt-3 text-sm text-muted">Não é um site oficial do governo. Encontrou um erro? Abra uma issue no repositório.</p>
      </Section>
    </div>
  );
}
