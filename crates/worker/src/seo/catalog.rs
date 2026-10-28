//! Static catalog mirrored from the web app (Entenda topics, curated pautas) and the 27 UFs.
//! Sync with `apps/web/src/features/{entenda/temas.ts,legislativo/pautas.ts}` is enforced by tests.

pub struct Tema {
    pub slug: &'static str,
    pub titulo: &'static str,
    pub grupo: &'static str,
    pub resumo: &'static str,
    /// (título, texto)
    pub passos: &'static [(&'static str, &'static str)],
    pub detalhes: &'static [&'static str],
    /// (label, href)
    pub fontes: &'static [(&'static str, &'static str)],
}

pub struct Pauta {
    pub camara_id: u32,
    pub sigla: &'static str,
    pub numero: u32,
    pub ano: u32,
    pub apelido: &'static str,
    pub tema: &'static str,
    pub resumo: &'static str,
}

impl Pauta {
    /// "PL 2630/2020"
    pub fn rotulo(&self) -> String {
        format!("{} {}/{}", self.sigla, self.numero, self.ano)
    }
}

pub fn tema(slug: &str) -> Option<&'static Tema> {
    TEMAS.iter().find(|t| t.slug == slug)
}

pub fn pauta(camara_id: u64) -> Option<&'static Pauta> {
    PAUTAS.iter().find(|p| u64::from(p.camara_id) == camara_id)
}

/// Extra search phrasing per topic (pt-BR queries people actually type).
pub fn tema_keywords(slug: &str) -> &'static str {
    match slug {
        "emenda-de-relator" => "orçamento secreto",
        "emenda-pix" => "transferência especial",
        "o-que-e-emenda" => "emendas parlamentares",
        "troca-de-partido" => "janela partidária",
        "como-ler-uma-votacao" => "como votou cada deputado",
        _ => "",
    }
}

pub const UFS: [(&str, &str); 27] = [
    ("AC", "Acre"),
    ("AL", "Alagoas"),
    ("AP", "Amapá"),
    ("AM", "Amazonas"),
    ("BA", "Bahia"),
    ("CE", "Ceará"),
    ("DF", "Distrito Federal"),
    ("ES", "Espírito Santo"),
    ("GO", "Goiás"),
    ("MA", "Maranhão"),
    ("MT", "Mato Grosso"),
    ("MS", "Mato Grosso do Sul"),
    ("MG", "Minas Gerais"),
    ("PA", "Pará"),
    ("PB", "Paraíba"),
    ("PR", "Paraná"),
    ("PE", "Pernambuco"),
    ("PI", "Piauí"),
    ("RJ", "Rio de Janeiro"),
    ("RN", "Rio Grande do Norte"),
    ("RS", "Rio Grande do Sul"),
    ("RO", "Rondônia"),
    ("RR", "Roraima"),
    ("SC", "Santa Catarina"),
    ("SP", "São Paulo"),
    ("SE", "Sergipe"),
    ("TO", "Tocantins"),
];

pub fn uf_nome(uf: &str) -> Option<&'static str> {
    UFS.iter().find(|(s, _)| *s == uf).map(|(_, n)| *n)
}

pub const TEMAS: &[Tema] = &[
    Tema {
        slug: "o-que-e-emenda",
        titulo: "O que é uma emenda parlamentar",
        grupo: "Dinheiro",
        resumo: "É o pedaço do Orçamento da União que deputados e senadores podem direcionar para obras, serviços e cidades.",
        passos: &[("Governo propõe", "Todo ano o Executivo envia ao Congresso o projeto de lei do Orçamento (PLOA)."), ("Congresso emenda", "Parlamentares, bancadas estaduais e comissões apresentam emendas: “tire daqui, coloque ali”."), ("Lei aprovada", "O Orçamento aprovado (LOA) traz as emendas. Boa parte delas é de execução obrigatória."), ("Dinheiro chega", "O governo empenha, a obra ou compra acontece e o valor é pago ao município, estado ou entidade.")],
        detalhes: &["Emendas existem para que quem conhece a realidade local ajude a decidir gastos federais. A crítica mais comum é que elas pulverizam o orçamento e podem servir de moeda de troca política.", "Há quatro tipos principais: individual, de bancada, de comissão e de relator (esta última extinta como RP9 em 2022)."],
        fontes: &[("Constituição Federal, arts. 165 a 166 (orçamento e emendas)", "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art165"), ("EC 86/2015 (emendas individuais obrigatórias)", "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc86.htm"), ("Portal da Transparência — emendas parlamentares", "https://portaldatransparencia.gov.br/emendas")],
    },
    Tema {
        slug: "emenda-individual",
        titulo: "Emenda individual",
        grupo: "Dinheiro",
        resumo: "Cada deputado e senador tem uma cota anual para indicar, e o governo é obrigado a executá-la.",
        passos: &[("Cota igual", "Todos os parlamentares recebem o mesmo valor de cota, definido pela Constituição como percentual da receita."), ("Metade para saúde", "Pelo menos metade da cota individual precisa ir para ações e serviços públicos de saúde."), ("Execução obrigatória", "Desde a EC 86/2015 o governo não pode simplesmente deixar de pagar (salvo impedimento técnico)."), ("Duas formas", "Com finalidade definida (convênio, objeto específico) ou como transferência especial, a “Emenda Pix”.")],
        detalhes: &[],
        fontes: &[("Constituição Federal, arts. 165 a 166 (orçamento e emendas)", "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art165"), ("EC 86/2015 (emendas individuais obrigatórias)", "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc86.htm"), ("Portal da Transparência — emendas parlamentares", "https://portaldatransparencia.gov.br/emendas")],
    },
    Tema {
        slug: "emenda-pix",
        titulo: "Emenda Pix",
        grupo: "Dinheiro",
        resumo: "Transferência especial: o dinheiro cai direto na conta da prefeitura ou do estado, sem convênio e sem objeto definido na origem.",
        passos: &[("Parlamentar indica", "Escolhe o município ou estado que vai receber, dentro da sua cota individual."), ("Transferência direta", "A União repassa o valor para a conta do ente, sem convênio nem plano de trabalho prévio (EC 105/2019)."), ("Ente decide o uso", "A prefeitura ou o estado aplica o recurso; pelo menos 70% devem ir para investimento."), ("Fiscalização", "Como o dinheiro vira recurso do ente, a fiscalização é feita principalmente por tribunais de contas locais.")],
        detalhes: &["Por que é polêmica: críticos — incluindo órgãos de controle — apontam que fica difícil rastrear em que o dinheiro foi gasto. Defensores dizem que reduz burocracia e acelera obras em cidades pequenas.", "Em 2024 o STF (relator Flávio Dino, no âmbito da ADPF 854) passou a exigir plano de trabalho, conta específica e identificação do objeto. A Lei Complementar 210/2024 incorporou regras de transparência."],
        fontes: &[("EC 105/2019 (cria a transferência especial, a “Emenda Pix”)", "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc105.htm"), ("Constituição Federal, art. 166-A (transferência especial)", "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art166a"), ("STF — ADPF 854 (orçamento secreto; rastreabilidade das emendas)", "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=ADPF&numeroProcesso=854"), ("Lei Complementar 210/2024 (regras de transparência para emendas)", "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp210.htm"), ("Portal da Transparência — emendas parlamentares", "https://portaldatransparencia.gov.br/emendas")],
    },
    Tema {
        slug: "emenda-de-bancada",
        titulo: "Emenda de bancada",
        grupo: "Dinheiro",
        resumo: "Os parlamentares de um mesmo estado decidem juntos projetos estruturantes para o estado.",
        passos: &[("Bancada se reúne", "Deputados e senadores de cada UF votam quais projetos apoiar."), ("Projetos maiores", "Costumam ser obras e equipamentos de impacto regional."), ("Execução obrigatória", "Desde a EC 100/2019, parte das emendas de bancada também é obrigatória.")],
        detalhes: &[],
        fontes: &[("Constituição Federal, arts. 165 a 166 (orçamento e emendas)", "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art165"), ("EC 100/2019 (emendas de bancada obrigatórias)", "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc100.htm"), ("Portal da Transparência — emendas parlamentares", "https://portaldatransparencia.gov.br/emendas")],
    },
    Tema {
        slug: "emenda-de-comissao",
        titulo: "Emenda de comissão",
        grupo: "Dinheiro",
        resumo: "Apresentada por comissões temáticas da Câmara e do Senado (saúde, educação, agricultura…).",
        passos: &[("Comissão aprova", "A comissão vota as emendas da sua área."), ("Execução discricionária", "Não é obrigatória: o governo pode executar ou não."), ("Cresceu após 2022", "Com o fim do RP9, parte desse espaço migrou para emendas de comissão, alvo de cobrança por mais transparência sobre quem indicou cada valor.")],
        detalhes: &[],
        fontes: &[("Constituição Federal, arts. 165 a 166 (orçamento e emendas)", "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art165"), ("STF — ADPF 854 (orçamento secreto; rastreabilidade das emendas)", "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=ADPF&numeroProcesso=854"), ("Lei Complementar 210/2024 (regras de transparência para emendas)", "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp210.htm")],
    },
    Tema {
        slug: "emenda-de-relator",
        titulo: "Emenda de relator (RP9)",
        grupo: "Dinheiro",
        resumo: "O “orçamento secreto”: emendas registradas em nome do relator-geral, sem mostrar quem de fato pediu cada valor.",
        passos: &[("2020–2022", "O relator-geral do Orçamento concentrou bilhões no identificador RP9."), ("Sem autoria real", "Os parlamentares que indicavam os recursos não apareciam nos sistemas públicos."), ("STF decide", "Em dezembro de 2022 o STF julgou o RP9 inconstitucional (ADPFs 850, 851 e 854)."), ("O que mudou", "A EC 126/2022 redistribuiu os valores; desde 2024 o STF cobra rastreabilidade também de outras emendas.")],
        detalhes: &["Segundo o STF, o modelo violava princípios de transparência e impessoalidade. Os defensores argumentavam que se tratava de instrumento legítimo de negociação orçamentária."],
        fontes: &[("STF — ADPF 850 (orçamento secreto)", "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=ADPF&numeroProcesso=850"), ("STF — ADPF 851 (orçamento secreto)", "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=ADPF&numeroProcesso=851"), ("STF — ADPF 854 (orçamento secreto; rastreabilidade das emendas)", "https://portal.stf.jus.br/processos/listarProcessos.asp?classe=ADPF&numeroProcesso=854"), ("EC 126/2022 (PEC da Transição; redistribui recursos após o fim do RP9)", "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc126.htm"), ("Portal da Transparência — emendas parlamentares", "https://portaldatransparencia.gov.br/emendas")],
    },
    Tema {
        slug: "ciclo-do-dinheiro",
        titulo: "Ciclo do dinheiro",
        grupo: "Dinheiro",
        resumo: "Da promessa ao cofre: empenho, liquidação, pagamento e restos a pagar.",
        passos: &[("Empenho", "O governo reserva o valor. É a promessa formal de pagar."), ("Liquidação", "O governo confere se a obra, compra ou serviço foi entregue."), ("Pagamento", "O dinheiro sai do Tesouro para o favorecido."), ("Restos a pagar", "O que foi empenhado e não pago no ano passa para os anos seguintes — ou é cancelado.")],
        detalhes: &[],
        fontes: &[("Lei 4.320/1964 (empenho, liquidação e pagamento)", "https://www.planalto.gov.br/ccivil_03/leis/l4320.htm"), ("LDO 2025 — Lei 15.080/2024 (Lei de Diretrizes Orçamentárias)", "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/L15080.htm"), ("Portal da Transparência — emendas parlamentares", "https://portaldatransparencia.gov.br/emendas")],
    },
    Tema {
        slug: "o-que-esta-aberto",
        titulo: "O que está aberto",
        grupo: "Dinheiro",
        resumo: "Dinheiro de emendas já empenhado (prometido) que ainda não foi pago nem cancelado.",
        passos: &[("Empenhado", "Valor reservado para a emenda."), ("Menos pago", "Tiramos o que foi pago no ano e os restos a pagar já pagos."), ("Menos cancelado", "Tiramos os restos a pagar cancelados."), ("= Em aberto", "O que sobra ainda pode virar pagamento: é dinheiro comprometido, mas não entregue.")],
        detalhes: &["Saldo em aberto não é irregularidade: obras levam tempo. Mas saldos antigos merecem atenção, porque podem indicar obra parada."],
        fontes: &[("Lei 4.320/1964 (empenho, liquidação e pagamento)", "https://www.planalto.gov.br/ccivil_03/leis/l4320.htm"), ("Portal da Transparência — emendas parlamentares", "https://portaldatransparencia.gov.br/emendas")],
    },
    Tema {
        slug: "como-ler-uma-votacao",
        titulo: "Como ler uma votação",
        grupo: "Congresso",
        resumo: "Placar, votos nominais, orientação de bancada e por que às vezes não há registro de voto.",
        passos: &[("Simbólica ou nominal", "Na simbólica o presidente vê o plenário; só na nominal cada voto fica registrado."), ("Orientação", "Líderes orientam a bancada (Sim, Não, Liberado, Obstrução)."), ("Votos", "Sim, Não, Abstenção, Obstrução ou ausência. Ausente não é o mesmo que votar contra."), ("Quórum", "Leis ordinárias precisam de maioria simples; PEC precisa de 3/5 em dois turnos em cada Casa.")],
        detalhes: &[],
        fontes: &[("Constituição Federal, arts. 59 a 69 (processo legislativo)", "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art59"), ("Dados Abertos da Câmara (votações e votos)", "https://dadosabertos.camara.leg.br/swagger/api.html"), ("Dados Abertos do Senado", "https://legis.senado.leg.br/dadosabertos/docs/")],
    },
    Tema {
        slug: "tipos-de-proposicao",
        titulo: "Tipos de proposição",
        grupo: "Congresso",
        resumo: "PL, PLP, PEC, MPV e PDL: o que cada sigla quer dizer.",
        passos: &[("PL", "Projeto de lei ordinária: maioria simples."), ("PLP", "Projeto de lei complementar: maioria absoluta, para temas que a Constituição exige."), ("PEC", "Proposta de emenda à Constituição: 3/5 dos votos, dois turnos, nas duas Casas; não passa por sanção."), ("MPV", "Medida provisória: editada pelo Presidente, vale na hora e perde efeito se não for aprovada em até 120 dias."), ("PDL", "Projeto de decreto legislativo: competência exclusiva do Congresso (ex.: sustar atos do Executivo).")],
        detalhes: &[],
        fontes: &[("Constituição Federal, arts. 59 a 69 (processo legislativo)", "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art59")],
    },
    Tema {
        slug: "como-uma-lei-nasce",
        titulo: "Como uma lei nasce",
        grupo: "Congresso",
        resumo: "Da apresentação à publicação: Câmara, Senado, sanção ou veto.",
        passos: &[("Apresentação", "Parlamentar, Presidente, tribunais ou cidadãos (iniciativa popular) apresentam o projeto."), ("Comissões", "Comissões analisam mérito e constitucionalidade; algumas decidem sem ir ao plenário."), ("Câmara e Senado", "Uma Casa aprova e envia à outra (revisora). Se mudar, volta para a primeira."), ("Sanção ou veto", "O Presidente tem 15 dias úteis. O Congresso pode derrubar o veto."), ("Publicação", "A lei é publicada no Diário Oficial e passa a valer na data prevista.")],
        detalhes: &[],
        fontes: &[("Constituição Federal, arts. 59 a 69 (processo legislativo)", "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art59")],
    },
    Tema {
        slug: "mandatos",
        titulo: "Mandatos",
        grupo: "Congresso",
        resumo: "Deputado tem mandato de 4 anos; senador, de 8. Suplentes assumem quando o titular se afasta.",
        passos: &[("Deputados", "513, eleitos a cada 4 anos pelo sistema proporcional."), ("Senadores", "81 (3 por UF), mandato de 8 anos, renovação de 1/3 e 2/3 alternada."), ("Legislatura", "Período de 4 anos de trabalho do Congresso (a 57ª vai de 2023 a 2027)."), ("Suplentes", "Assumem quando o titular vira ministro, se licencia ou perde o mandato.")],
        detalhes: &[],
        fontes: &[("Constituição Federal, arts. 44 a 47 (Câmara e Senado)", "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art44")],
    },
    Tema {
        slug: "troca-de-partido",
        titulo: "Troca de partido e janela partidária",
        grupo: "Congresso",
        resumo: "Deputados só podem trocar de partido sem perder o mandato em situações previstas, como a janela partidária.",
        passos: &[("Fidelidade", "Nos cargos proporcionais (deputados), o mandato pertence ao partido."), ("Janela", "Nos 30 dias antes do prazo de filiação para a eleição seguinte, a troca é permitida (Lei 9.096/1995, art. 22-A)."), ("Justa causa", "Fora da janela, só com justa causa (ex.: desvio do programa, perseguição) ou fusão do partido."), ("Senadores", "Eleitos pelo sistema majoritário, segundo o STF não perdem o mandato ao trocar de partido.")],
        detalhes: &[],
        fontes: &[("Lei 9.096/1995, art. 22-A (janela partidária)", "https://www.planalto.gov.br/ccivil_03/leis/l9096.htm"), ("EC 97/2017 (fidelidade partidária e janela)", "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc97.htm"), ("Dados Abertos da Câmara (votações e votos)", "https://dadosabertos.camara.leg.br/swagger/api.html")],
    },
];
pub const PAUTAS: &[Pauta] = &[
    Pauta { camara_id: 2196833, sigla: "PEC", numero: 45, ano: 2019, apelido: "Reforma tributária", tema: "Economia", resumo: "Substitui cinco tributos sobre consumo (PIS, Cofins, IPI, ICMS e ISS) por um IVA dual: CBS (federal) e IBS (estados e municípios)." },
    Pauta { camara_id: 2430143, sigla: "PLP", numero: 68, ano: 2024, apelido: "Regulamentação da reforma tributária", tema: "Economia", resumo: "Detalha as regras do IBS, da CBS e do Imposto Seletivo, incluindo cesta básica, regimes específicos e devolução de imposto (cashback)." },
    Pauta { camara_id: 2357053, sigla: "PLP", numero: 93, ano: 2023, apelido: "Arcabouço fiscal", tema: "Economia", resumo: "Cria o novo regime fiscal que substituiu o teto de gastos, ligando o crescimento da despesa ao da receita e a metas de resultado primário." },
    Pauta { camara_id: 2422697, sigla: "PL", numero: 914, ano: 2024, apelido: "Programa Mover / “taxa das blusinhas”", tema: "Economia", resumo: "Cria incentivos para a indústria automotiva de baixo carbono. Durante a tramitação, recebeu o trecho que passou a tributar compras internacionais de até US$ 50." },
    Pauta { camara_id: 2487436, sigla: "PL", numero: 1087, ano: 2025, apelido: "Isenção do IR até R$ 5 mil", tema: "Economia", resumo: "Amplia a faixa de isenção do Imposto de Renda da pessoa física e cria uma tributação mínima para rendas mais altas." },
    Pauta { camara_id: 2341862, sigla: "PEC", numero: 32, ano: 2022, apelido: "PEC da Transição", tema: "Economia", resumo: "Autorizou gastos acima do teto em 2023 para programas sociais, aprovada entre a eleição e a posse do novo governo." },
    Pauta { camara_id: 2256735, sigla: "PL", numero: 2630, ano: 2020, apelido: "PL das Fake News", tema: "Internet", resumo: "Propõe regras de transparência e responsabilidade para plataformas digitais e serviços de mensagens." },
    Pauta { camara_id: 2487262, sigla: "PL", numero: 2338, ano: 2023, apelido: "Marco da inteligência artificial", tema: "Internet", resumo: "Estabelece regras para desenvolvimento e uso de sistemas de inteligência artificial, com classificação por grau de risco." },
    Pauta { camara_id: 345311, sigla: "PL", numero: 490, ano: 2007, apelido: "Marco temporal das terras indígenas", tema: "Direitos e meio ambiente", resumo: "Restringe a demarcação de terras indígenas às áreas ocupadas em 5/10/1988, entre outras mudanças no Estatuto do Índio." },
    Pauta { camara_id: 257161, sigla: "PL", numero: 2159, ano: 2021, apelido: "Lei geral do licenciamento ambiental", tema: "Direitos e meio ambiente", resumo: "Unifica regras de licenciamento ambiental e cria modalidades simplificadas, como a licença por adesão e compromisso." },
    Pauta { camara_id: 2434493, sigla: "PL", numero: 1904, ano: 2024, apelido: "Aborto após 22 semanas", tema: "Direitos e meio ambiente", resumo: "Equipara ao crime de homicídio simples o aborto realizado após 22 semanas de gestação, inclusive nos casos hoje permitidos em lei." },
    Pauta { camara_id: 2270800, sigla: "PEC", numero: 3, ano: 2021, apelido: "PEC das prerrogativas (“PEC da Blindagem”)", tema: "Instituições", resumo: "Amplia proteções a parlamentares, exigindo autorização da Casa para abertura de processo criminal contra eles." },
];

#[cfg(test)]
mod tests {
    use super::*;

    const TEMAS_TS: &str = include_str!("../../../../apps/web/src/features/entenda/temas.ts");
    const PAUTAS_TS: &str = include_str!("../../../../apps/web/src/features/legislativo/pautas.ts");

    fn quoted_after<'a>(src: &'a str, key: &str) -> Vec<&'a str> {
        src.match_indices(key)
            .filter_map(|(i, _)| {
                let rest = &src[i + key.len()..];
                rest.split('"').next()
            })
            .collect()
    }

    #[test]
    fn temas_match_web_app() {
        let web = quoted_after(TEMAS_TS, "slug: \"");
        let ours: Vec<&str> = TEMAS.iter().map(|t| t.slug).collect();
        assert_eq!(ours, web);
        for t in TEMAS {
            assert!(TEMAS_TS.contains(t.resumo), "{}", t.slug);
            assert!(!t.passos.is_empty() && !t.fontes.is_empty(), "{}", t.slug);
        }
    }

    #[test]
    fn pautas_match_web_app() {
        let web: Vec<u32> = PAUTAS_TS
            .match_indices("camaraId: ")
            .filter_map(|(i, _)| {
                let rest = &PAUTAS_TS[i + 10..];
                rest.split(',').next()?.trim().parse().ok()
            })
            .collect();
        let ours: Vec<u32> = PAUTAS.iter().map(|p| p.camara_id).collect();
        assert_eq!(ours, web);
        assert_eq!(
            pauta(2256735).map(|p| p.rotulo()),
            Some("PL 2630/2020".into())
        );
    }

    #[test]
    fn ufs_are_unique() {
        let mut s: Vec<&str> = UFS.iter().map(|u| u.0).collect();
        s.sort_unstable();
        s.dedup();
        assert_eq!(s.len(), 27);
        assert_eq!(uf_nome("BA"), Some("Bahia"));
    }
}
