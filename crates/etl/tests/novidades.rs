//! v1/novidades.json + v1/novidades/<AAAAMM>.json — feed de eventos gerado diariamente.
// Valores em centavos escritos como reais_centavos (ex.: 1_234_00 = R$ 1.234,00).
#![allow(clippy::inconsistent_digit_grouping)]
use etl::novidades::{
    self, brl_curto, diff, ementa_curta, fontes, id_estavel, limita, mesclar, relevancia, Evento,
    Tipo, LIMITE_TEXTO,
};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

// ---------- utilidades ----------

fn tmp(nome: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let k = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let d = std::env::temp_dir().join(format!(
        "emenda-novidades-{nome}-{}-{k}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&d);
    d
}

fn grava(dir: &Path, arquivos: &[(&str, Value)]) {
    for (p, v) in arquivos {
        let f = dir.join("v1").join(p);
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        std::fs::write(f, serde_json::to_vec(v).unwrap()).unwrap();
    }
}

fn read(p: PathBuf) -> Value {
    serde_json::from_slice(&std::fs::read(&p).unwrap_or_else(|_| panic!("{p:?}"))).unwrap()
}

/// Fetch de teste: primeira chave contida na URL vence; sem chave -> erro.
struct Fx(Vec<(&'static str, Value)>);
impl fontes::Fetch for Fx {
    fn get(&self, url: &str) -> anyhow::Result<Value> {
        self.0
            .iter()
            .find(|(k, _)| url.contains(k))
            .map(|(_, v)| v.clone())
            .ok_or_else(|| anyhow::anyhow!("sem fixture: {url}"))
    }
}

fn janela() -> fontes::Janela {
    fontes::Janela {
        desde: "2026-10-21".into(),
        ate: "2026-10-28".into(),
        hoje: "2026-10-28".into(),
    }
}

fn valida(e: &Evento) {
    assert!(
        e.texto.chars().count() <= LIMITE_TEXTO,
        "{} chars: {}",
        e.texto.chars().count(),
        e.texto
    );
    assert!(!e.titulo.is_empty() && !e.fonte.is_empty(), "{e:?}");
    assert!(
        !e.texto.contains("….") && !e.texto.contains(".."),
        "{}",
        e.texto
    );
    // título = cabeça do texto (sem o emoji): o cartão mostra o título e o resto do texto
    let corpo = e.texto.split_once(' ').map(|x| x.1).unwrap_or("");
    assert!(
        corpo.starts_with(e.titulo.trim_end_matches('…')),
        "{} | {}",
        e.titulo,
        e.texto
    );
    assert!(e.relevancia <= 100);
    assert!(
        e.data.len() >= 10 && e.data.as_bytes()[4] == b'-',
        "{}",
        e.data
    );
    for en in &e.entidades {
        assert!(
            en.url.starts_with('/') || en.url.starts_with("https://"),
            "{en:?}"
        );
    }
}

// ---------- puros ----------

#[test]
fn id_estavel_e_deterministico() {
    let a = id_estavel(Tipo::Votacao, "2637101-42", "2026-10-27");
    assert_eq!(a, id_estavel(Tipo::Votacao, "2637101-42", "2026-10-27"));
    assert_ne!(a, id_estavel(Tipo::Votacao, "2637101-42", "2026-10-28"));
    assert_ne!(a, id_estavel(Tipo::Lei, "2637101-42", "2026-10-27"));
    assert!(a.starts_with("votacao-"), "{a}");
    assert_eq!(a.len(), "votacao-".len() + 16);
}

#[test]
fn brl_curto_ptbr() {
    for (c, s) in [
        (0, "R$ 0"),
        (99_00, "R$ 99"),
        (1_234_00, "R$ 1,2 mil"),
        (98_765_00, "R$ 98,8 mil"),
        (12_345_678_90, "R$ 12,3 mi"),
        (1_000_000_00, "R$ 1 mi"),
        (2_500_000_000_00, "R$ 2,5 bi"),
        (-5_000_00, "-R$ 5 mil"),
    ] {
        assert_eq!(brl_curto(c), s, "{c}");
    }
}

#[test]
fn limita_respeita_caracteres_unicode() {
    let longo = "ação ".repeat(100);
    let l = limita(&longo, 280);
    assert!(l.chars().count() <= 280);
    assert!(l.ends_with('…'));
    assert_eq!(limita("curto", 280), "curto");
    assert_eq!(limita("💸 abc", 5), "💸 abc");
    assert_eq!(limita("💸 abcdef", 5).chars().count(), 5);
}

#[test]
fn ementa_curta_corta_cauda_burocratica() {
    assert_eq!(
        ementa_curta("Altera a Lei nº 1, e dá outras providências.", 140),
        "Altera a Lei nº 1"
    );
    // quebras de linha da fonte viram espaço
    assert_eq!(
        ementa_curta("Altera o Código\nPenal.", 140),
        "Altera o Código Penal"
    );
    assert!(!ementa_curta(&"palavra ".repeat(60), 100).ends_with("…."));
    assert!(ementa_curta(&"palavra ".repeat(60), 100).chars().count() <= 100);
}

#[test]
fn relevancia_por_regra() {
    use relevancia as r;
    // votação: PEC > MPV > PL; nominal apertada sobe; tudo em 0..=100
    let pec = r::votacao("PEC", Some((320, 110)), true);
    let mpv = r::votacao("MPV", None, true);
    let pl = r::votacao("PL", None, true);
    let pl_apertado = r::votacao("PL", Some((250, 230)), true);
    assert!(pec > mpv && mpv > pl, "{pec} {mpv} {pl}");
    assert!(pl_apertado > pl);
    assert!(pec >= 70 && pl < 70);
    // lei: EC > LC > lei ordinária; EC sempre alta
    assert!(r::lei("EMC", "") > r::lei("LCP", "") && r::lei("LCP", "") > r::lei("LEI", ""));
    assert!(
        r::lei("EMC", "Altera o art. 7º") >= 90 && r::lei("LEI", "Altera a Lei nº 8.171") >= 60
    );
    // homenagens/denominações: baixa
    for honraria in [
        "Confere o título de Capital Nacional do Basquete ao Município de Franca.",
        "Denomina Ponte Heitor Miranda dos Santos o trecho brasileiro.",
        "Institui a Semana Nacional da Empresa Júnior.",
        "Institui o Dia Nacional do Pé de Moleque.",
        "Inscreve o nome de Fulano no Livro dos Heróis e Heroínas da Pátria.",
    ] {
        assert!(r::lei("LEI", honraria) < 50, "{honraria}");
    }
    // dinheiro: escala por faixa
    let tab = [
        (0, 40),
        (5_000_00, 40),
        (2_000_000_00, 50),
        (20_000_000_00, 60),
        (200_000_000_00, 70),
    ];
    for (v, esperado) in tab {
        assert_eq!(r::valor(40, v), esperado, "{v}");
    }
    assert_eq!(r::valor(95, i64::MAX / 2), 100);
    assert!(r::proposicao("PEC") > r::proposicao("MPV"));
    assert!(r::agenda(&["PEC", "PL"]) > r::agenda(&["PL"]));
    assert!(r::urgencia("PEC") > r::urgencia("PL"));
    assert!((0..=100).contains(&r::partido()) && (0..=100).contains(&r::gastos()));
}

// ---------- diff entre execuções (dados do branch `data`) ----------

fn feed(meses: Value) -> Value {
    json!({"ultimoMes": 202610, "meses": meses, "itens": []})
}

fn item(cod: &str, tipo: &str, autor: &str, mun: &str, valor: i64) -> Value {
    json!({"mes":202610,"codigoEmenda":cod,"autor":{"codigo":"7114","nome":autor},"tipo":tipo,
        "favorecido":{"nome":"PREFEITURA","documento":"1","tipo":"Pessoa Jurídica"},
        "municipio":{"ibge":"3106200","nome":mun,"uf":"MG"},"valor":valor})
}

fn parl(casa: &str, id: &str, nome: &str, partido: &str) -> Value {
    json!({"casa":casa,"id":id,"nome":nome,"partido":partido,"uf":"SP","emExercicio":true,"mandato":0,"porAno":{}})
}

fn snapshot_prev() -> PathBuf {
    let d = tmp("prev");
    grava(
        &d,
        &[
            (
                "feed.json",
                feed(json!([{"mes":202610,"n":2,"valor":1_000_000_00}])),
            ),
            (
                "feed/202610.json",
                json!({"mes":202610,"n":2,"valor":1_000_000_00,"itens":[item("A","individual","FULANO","Belo Horizonte",1_000_000_00)]}),
            ),
            ("pix.json", json!({"totais":{"pago":500_000_00}})),
            (
                "gastos/ranking.json",
                json!({"dadosAte":{"camara":"2026-10","senado":"2026-10"},"parlamentares":[
                    parl("camara","1","Fulano","PL"), parl("camara","2","Beltrana","PT"), parl("senado","9","Sicrano","MDB")]}),
            ),
        ],
    );
    d
}

fn snapshot_cur() -> PathBuf {
    let d = tmp("cur");
    grava(
        &d,
        &[
            ("meta.json", json!({"generatedAt":"2026-10-28T09:30:00Z"})),
            (
                "feed.json",
                feed(json!([{"mes":202610,"n":5,"valor":13_345_678_90}])),
            ),
            (
                "feed/202610.json",
                json!({"mes":202610,"n":5,"valor":13_345_678_90,"itens":[
                    item("A","individual","FULANO","Belo Horizonte",1_000_000_00),
                    item("B","bancada","BANCADA DE MINAS GERAIS","Uberlândia",9_000_000_00),
                    item("C","pix","FULANO","Contagem",2_345_678_90),
                    // a fonte às vezes traz nulos
                    {"mes":202610,"codigoEmenda":"D","autor":{"codigo":"1","nome":"X"},"tipo":"individual",
                        "favorecido":{"nome":"Y","documento":null,"tipo":null},"municipio":{"ibge":"1","nome":"Z","uf":null},"valor":1},
                ]}),
            ),
            ("pix.json", json!({"totais":{"pago":2_845_678_90}})),
            (
                "rankings.json",
                json!({"ultimoMes":202610,"janelas":[{"janela":"1m","desde":202610,"ate":202610,"valor":13_345_678_90,"pagamentos":5,
                    "tipos":[{"tipo":"pix","valor":2_345_678_90,"pagamentos":1}]}]}),
            ),
            (
                "gastos/ranking.json",
                json!({"dadosAte":{"camara":"2026-10","senado":"2026-10"},"parlamentares":[
                    parl("camara","1","Fulano","PL"), parl("camara","2","Beltrana","PSB"), parl("senado","9","Sicrano","MDB")]}),
            ),
            (
                "gastos/deputado/1.json",
                json!({"casa":"camara","id":"1","nome":"Fulano","partido":"PL","uf":"SP","itens":[
                    {"data":"2026-10-02","valor":999_999_00},{"data":"2026-09-10","valor":30_000_00},{"data":"2026-09-11","valor":10_000_00}]}),
            ),
            (
                "gastos/deputado/2.json",
                json!({"casa":"camara","id":"2","nome":"Beltrana","partido":"PSB","uf":"RJ","itens":[{"data":"2026-09-01","valor":35_000_00}]}),
            ),
            (
                "gastos/senador/9.json",
                json!({"casa":"senado","id":"9","nome":"Sicrano","partido":"MDB","uf":"BA","itens":[{"data":"2026-09","valor":50_000_00}]}),
            ),
        ],
    );
    d
}

const AGORA: &str = "2026-10-28T09:30:00Z";

#[test]
fn diff_pagamentos_pix_partido_gastos() {
    let prev = diff::carregar(&snapshot_prev());
    let cur = diff::carregar(&snapshot_cur());
    let ev = diff::eventos(Some(&prev), &cur, AGORA);
    ev.iter().for_each(valida);
    let de = |t: Tipo| ev.iter().filter(|e| e.tipo == t).collect::<Vec<_>>();

    let pg = de(Tipo::Pagamentos);
    assert_eq!(pg.len(), 1);
    assert_eq!(pg[0].data, AGORA);
    assert!(pg[0].texto.contains("R$ 12,3 mi"), "{}", pg[0].texto);
    assert!(
        pg[0].texto.contains("Bancada de Minas Gerais"),
        "{}",
        pg[0].texto
    );
    assert!(pg[0].texto.contains("Uberlândia"), "{}", pg[0].texto);
    assert!(pg[0]
        .entidades
        .iter()
        .any(|e| e.url == "/municipio/3106200"));
    assert_eq!(pg[0].numeros[0].valor, 12_345_678_90);

    let pix = de(Tipo::Pix);
    assert_eq!(pix.len(), 1);
    assert!(pix[0].texto.contains("R$ 2,3 mi"), "{}", pix[0].texto);
    assert!(pix[0].texto.contains("Contagem"), "{}", pix[0].texto);

    let pa = de(Tipo::Partido);
    assert_eq!(pa.len(), 1, "{pa:?}");
    assert!(
        pa[0].texto.contains("Beltrana") && pa[0].texto.contains("PT → PSB"),
        "{}",
        pa[0].texto
    );
    assert_eq!(pa[0].entidades[0].url, "/deputado/2");
    assert!(pa[0].entidades.iter().any(|e| e.url == "/partido/PSB"));

    // gastos: mês completo anterior a dadosAte (setembro); um por casa
    let g = de(Tipo::Gastos);
    assert_eq!(g.len(), 2, "{g:?}");
    let cam = g
        .iter()
        .find(|e| e.entidades[0].tipo == "deputado")
        .unwrap();
    assert!(
        cam.texto.contains("Fulano")
            && cam.texto.contains("R$ 40 mil")
            && cam.texto.contains("setembro/2026"),
        "{}",
        cam.texto
    );
    let sen = g.iter().find(|e| e.entidades[0].tipo == "senador").unwrap();
    assert_eq!(sen.entidades[0].url, "/senador/9");

    // ids estáveis entre execuções idênticas
    let ev2 = diff::eventos(Some(&prev), &cur, AGORA);
    assert_eq!(
        ev.iter().map(|e| &e.id).collect::<Vec<_>>(),
        ev2.iter().map(|e| &e.id).collect::<Vec<_>>()
    );
}

#[test]
fn diff_sem_mudanca_nao_gera_dinheiro_nem_partido() {
    let cur = diff::carregar(&snapshot_cur());
    let ev = diff::eventos(Some(&cur), &cur, AGORA);
    assert!(
        ev.iter()
            .all(|e| !matches!(e.tipo, Tipo::Pagamentos | Tipo::Pix | Tipo::Partido)),
        "{ev:?}"
    );
}

#[test]
fn bootstrap_sem_prev_resume_o_mes() {
    let cur = diff::carregar(&snapshot_cur());
    let ev = diff::eventos(None, &cur, AGORA);
    ev.iter().for_each(valida);
    let pg = ev.iter().find(|e| e.tipo == Tipo::Pagamentos).unwrap();
    assert!(
        pg.texto.contains("R$ 13,3 mi") && pg.texto.contains("outubro/2026"),
        "{}",
        pg.texto
    );
    let pix = ev.iter().find(|e| e.tipo == Tipo::Pix).unwrap();
    assert!(pix.texto.contains("R$ 2,3 mi"), "{}", pix.texto);
    assert!(ev.iter().all(|e| e.tipo != Tipo::Partido));
    assert_eq!(ev.iter().filter(|e| e.tipo == Tipo::Gastos).count(), 2);
}

#[test]
fn diretorio_ausente_nao_quebra() {
    let s = diff::carregar(Path::new("/nao/existe"));
    assert!(diff::eventos(None, &s, AGORA).is_empty());
}

// ---------- APIs (Câmara / Senado) ----------

fn votos(sim: usize, nao: usize) -> Value {
    let mut v: Vec<Value> = (0..sim).map(|_| json!({"tipoVoto":"Sim"})).collect();
    v.extend((0..nao).map(|_| json!({"tipoVoto":"Não"})));
    json!({ "dados": v })
}

fn prop(id: u64, sigla: &str, n: u32, ano: u32, ementa: &str) -> Value {
    json!({"dados":{"id":id,"siglaTipo":sigla,"numero":n,"ano":ano,"ementa":ementa}})
}

#[test]
fn camara_votacoes_e_urgencias() {
    let v = |id: &str, desc: &str, ap: Value| json!({"id":id,"data":"2026-10-27","dataHoraRegistro":"2026-10-27T21:41:06","siglaOrgao":"PLEN","descricao":desc,"aprovacao":ap});
    let fx = Fx(vec![
        ("/votacoes/100-5/votos", votos(320, 110)),
        ("/votacoes/200-3/votos", json!({"dados":[]})),
        ("/votacoes/300-8/votos", json!({"dados":[]})),
        ("/votacoes/400-2/votos", json!({"dados":[]})),
        ("/votacoes?", json!({"dados":[
            v("100-6","Aprovada a Redação Final.",json!(1)),
            v("100-5","Aprovada a Proposta de Emenda à Constituição nº 12, de 2025, em primeiro turno.",json!(1)),
            v("200-3","Rejeitado o Projeto de Lei nº 1.234, de 2025. Sim: 11; Não: 387; Total: 398.",json!(0)),
            v("300-8","Aprovado o Requerimento de Urgência (Art. 155 do RICD).",json!(1)),
            v("400-2","Mantido o texto.",Value::Null),
        ]})),
        ("/proposicoes/100", prop(100, "PEC", 12, 2025, "Altera o art. 7º da Constituição Federal, e dá outras providências.")),
        ("/proposicoes/200", prop(200, "PL", 1234, 2025, "Dispõe sobre drones.")),
        ("/proposicoes/300", prop(300, "REQ", 4337, 2026, "Requeremos URGÊNCIA para apreciação do Projeto de Lei nº 5902, de 2023, que ‘Altera o Código Penal’.")),
    ]);
    let ev = fontes::camara_votacoes(&fx, &janela()).unwrap();
    ev.iter().for_each(valida);
    let vot: Vec<_> = ev.iter().filter(|e| e.tipo == Tipo::Votacao).collect();
    assert_eq!(vot.len(), 2, "{vot:#?}");
    let pec = vot
        .iter()
        .find(|e| e.texto.contains("PEC 12/2025"))
        .unwrap();
    assert!(
        pec.texto.starts_with("🗳️ Câmara aprovou PEC 12/2025"),
        "{}",
        pec.texto
    );
    assert!(
        pec.texto.contains("320 × 110") && pec.texto.contains("Altera o art. 7º"),
        "{}",
        pec.texto
    );
    assert!(!pec.texto.contains("outras providências"));
    assert_eq!(pec.data, "2026-10-27T21:41:06-03:00");
    assert!(pec.entidades.iter().any(|e| e.url == "/votacao/100-5"));
    assert!(pec.entidades.iter().any(|e| e.url == "/proposicao/100"));
    assert!(pec.relevancia >= 70);
    let pl = vot
        .iter()
        .find(|e| e.texto.contains("PL 1234/2025"))
        .unwrap();
    assert!(
        pl.texto.contains("rejeitou") && pl.texto.contains("11 × 387"),
        "{}",
        pl.texto
    );

    let urg: Vec<_> = ev.iter().filter(|e| e.tipo == Tipo::Urgencia).collect();
    assert_eq!(urg.len(), 1);
    assert!(
        urg[0].texto.contains("urgência") && urg[0].texto.contains("PL 5902/2023"),
        "{}",
        urg[0].texto
    );
}

#[test]
fn camara_proposicoes_novas_pec_mpv() {
    let fx = Fx(vec![
        (
            "/proposicoes/10/autores",
            json!({"dados":[{"nome":"Ana","uri":"https://x/deputados/55"},{"nome":"Bia"},{"nome":"Caio"}]}),
        ),
        (
            "/proposicoes/20/autores",
            json!({"dados":[{"nome":"Poder Executivo"}]}),
        ),
        (
            "/proposicoes?",
            json!({"dados":[
                {"id":10,"siglaTipo":"PEC","numero":18,"ano":2026,"ementa":"Altera o art. 166 da Constituição.","dataApresentacao":"2026-10-21T15:39"},
                {"id":20,"siglaTipo":"MPV","numero":1397,"ano":2026,"ementa":"Abre crédito extraordinário.","dataApresentacao":"2026-10-21T00:00"},
            ]}),
        ),
    ]);
    let ev = fontes::camara_proposicoes(&fx, &janela()).unwrap();
    ev.iter().for_each(valida);
    assert_eq!(ev.len(), 2);
    let pec = ev.iter().find(|e| e.texto.contains("PEC 18/2026")).unwrap();
    assert_eq!(pec.tipo, Tipo::Proposicao);
    assert!(pec.texto.contains("Ana e mais 2"), "{}", pec.texto);
    assert!(pec.entidades.iter().any(|e| e.url == "/deputado/55"));
    let mpv = ev
        .iter()
        .find(|e| e.texto.contains("MPV 1397/2026"))
        .unwrap();
    assert!(
        mpv.texto.contains("(autoria: Poder Executivo)"),
        "{}",
        mpv.texto
    );
    assert!(pec.relevancia > mpv.relevancia);
}

#[test]
fn camara_agenda_proximos_dias() {
    let fx = Fx(vec![
        (
            "/eventos/83110/pauta",
            json!({"dados":[
                {"ordem":1,"proposicao_":{"id":1,"siglaTipo":"REQ","numero":1,"ano":2026,"ementa":"x"},"proposicaoRelacionada_":{"id":7,"siglaTipo":"PL","numero":"5649","ano":"2026","ementa":"y"}},
                {"ordem":2,"proposicao_":{"id":8,"siglaTipo":"PEC","numero":18,"ano":2026,"ementa":"Altera o art. 166."}},
                {"ordem":3,"proposicao_":{"id":9,"siglaTipo":"PL","numero":5239,"ano":2025,"ementa":"Saúde."}},
            ]}),
        ),
        (
            "/eventos?",
            json!({"dados":[
                {"id":83110,"dataHoraInicio":"2026-10-29T13:55","descricaoTipo":"Sessão Deliberativa","situacao":"Convocada","descricao":"Sessão Deliberativa Extraordinária"},
                {"id":83076,"dataHoraInicio":"2026-11-04T09:00","descricaoTipo":"Sessão Não Deliberativa Solene","situacao":"Agendada","descricao":"Homenagem"},
                {"id":83098,"dataHoraInicio":"2026-10-27T14:14","descricaoTipo":"Sessão Deliberativa","situacao":"Encerrada","descricao":"passada"},
            ]}),
        ),
    ]);
    let ev = fontes::camara_agenda(&fx, &janela()).unwrap();
    ev.iter().for_each(valida);
    assert_eq!(ev.len(), 1, "{ev:#?}");
    let a = &ev[0];
    assert_eq!(a.tipo, Tipo::Agenda);
    assert!(
        a.texto
            .starts_with("📅 Amanhã (29/10) o Plenário da Câmara vota"),
        "{}",
        a.texto
    );
    assert!(
        a.texto.contains("PEC 18/2026")
            && a.texto.contains("PL 5239/2025")
            && a.texto.contains("PL 5649/2026"),
        "{}",
        a.texto
    );
    assert!(!a.texto.contains("REQ"));
    assert!(a.relevancia > fontes_agenda_sem_pec_relevancia());
}

fn fontes_agenda_sem_pec_relevancia() -> u8 {
    relevancia::agenda(&["PL"])
}

#[test]
fn senado_votacoes_nominais() {
    let votos: Vec<Value> = (0..75)
        .map(|_| json!({"siglaVotoParlamentar":"Sim"}))
        .chain([json!({"siglaVotoParlamentar":"Não"})])
        .collect();
    let fx = Fx(vec![(
        "/votacao?",
        json!([{"codigoMateria":174386,"codigoSessaoVotacao":7106,"dataSessao":"2026-10-14","sigla":"PEC","numero":"221","ano":2019,
            "descricaoVotacao":"Votação nominal da Proposta de Emenda à Constituição nº 221, de 2019, em primeiro turno.",
            "ementa":"Altera o art. 7º da Constituição Federal para reduzir a duração máxima semanal do trabalho.",
            "resultadoVotacao":"A","votos":votos}]),
    )]);
    let ev = fontes::senado_votacoes(&fx, &janela()).unwrap();
    ev.iter().for_each(valida);
    assert_eq!(ev.len(), 1);
    assert!(
        ev[0].texto.starts_with("🗳️ Senado aprovou PEC 221/2019"),
        "{}",
        ev[0].texto
    );
    assert!(
        ev[0].texto.contains("75 × 1") && ev[0].texto.contains("primeiro turno"),
        "{}",
        ev[0].texto
    );
    assert!(ev[0].fonte[0].contains("materia/174386"));
}

#[test]
fn senado_leis_sancionadas_e_promulgadas() {
    let lista = |docs: Value| json!({"ListaDocumento":{"documentos":{"documento":docs}}});
    let fx = Fx(vec![
        (
            "tipo=LEI",
            lista(json!([
                {"id":"44095919","tipo":"LEI-n","numero":"15526","normaNome":"Lei nº 15.526 de 29/09/2026","ementa":"Aperfeiçoa o marco legal do seguro rural.","dataassinatura":"29/09/2026"},
                {"id":"1","tipo":"LEI-n","numero":"15000","normaNome":"Lei antiga","ementa":"x","dataassinatura":"02/01/2026"}
            ])),
        ),
        // objeto único (não array) também é aceito
        (
            "tipo=EMC",
            lista(
                json!({"id":"44184944","tipo":"EMC-n","numero":"141","ementa":"Reduz a jornada semanal.","dataassinatura":"16/10/2026"}),
            ),
        ),
        ("tipo=LCP", lista(json!([]))),
    ]);
    let j = fontes::Janela {
        desde: "2026-09-15".into(),
        ..janela()
    };
    let ev = fontes::senado_leis(&fx, &j).unwrap();
    ev.iter().for_each(valida);
    assert_eq!(ev.len(), 2, "{ev:#?}");
    let lei = ev.iter().find(|e| e.texto.contains("15.526")).unwrap();
    assert!(
        lei.texto
            .starts_with("📜 Lei nº 15.526/2026 sancionada em 29/09"),
        "{}",
        lei.texto
    );
    assert_eq!(lei.data, "2026-09-29T00:00:00-03:00");
    let ec = ev.iter().find(|e| e.texto.contains("141")).unwrap();
    assert!(
        ec.texto
            .contains("Emenda Constitucional nº 141/2026 promulgada"),
        "{}",
        ec.texto
    );
    assert!(ec.relevancia > lei.relevancia);
}

#[test]
fn falha_de_api_vira_erro_tratavel() {
    let fx = Fx(vec![]);
    assert!(fontes::camara_votacoes(&fx, &janela()).is_err());
}

// ---------- mescla, limite e escrita ----------

fn ev(id: &str, data: &str, texto: &str) -> Evento {
    Evento {
        id: id.into(),
        tipo: Tipo::Lei,
        data: data.into(),
        titulo: "t".into(),
        texto: texto.into(),
        entidades: vec![],
        numeros: vec![],
        fonte: vec!["https://x".into()],
        relevancia: 50,
    }
}

#[test]
fn mesclar_deduplica_mantem_primeira_data_e_conteudo_novo() {
    let antigos = vec![
        ev("a", "2026-10-01T00:00:00Z", "velho"),
        ev("b", "2026-10-02T00:00:00Z", "b"),
    ];
    let novos = vec![
        ev("a", "2026-10-05T00:00:00Z", "novo"),
        ev("c", "2026-09-30T00:00:00Z", "c"),
    ];
    let m = mesclar(antigos, novos);
    assert_eq!(
        m.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
        ["b", "a", "c"]
    );
    let a = m.iter().find(|e| e.id == "a").unwrap();
    assert_eq!(
        (a.data.as_str(), a.texto.as_str()),
        ("2026-10-01T00:00:00Z", "novo")
    );
}

#[test]
fn escrever_rolling_500_e_arquivo_mensal() {
    let out = tmp("out");
    let evs: Vec<Evento> = (0..620)
        .map(|i| {
            let mes = if i < 300 { "09" } else { "10" };
            ev(
                &format!("e{i:04}"),
                &format!("2026-{mes}-{:02}T{:02}:00:00Z", 1 + i % 28, i % 24),
                "x",
            )
        })
        .collect();
    novidades::escrever(&out, &mesclar(vec![], evs), "2026-10-28T09:30:00Z").unwrap();
    let r = read(out.join("v1/novidades.json"));
    assert_eq!(r["itens"].as_array().unwrap().len(), 500);
    assert_eq!(r["geradoEm"], "2026-10-28T09:30:00Z");
    assert_eq!(
        r["meses"],
        json!([{"mes":202610,"n":320},{"mes":202609,"n":300}])
    );
    let datas: Vec<&str> = r["itens"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["data"].as_str().unwrap())
        .collect();
    assert!(datas.windows(2).all(|w| w[0] >= w[1]), "mais novo primeiro");
    let set = read(out.join("v1/novidades/202609.json"));
    assert_eq!(set["mes"], 202609);
    assert_eq!(set["itens"].as_array().unwrap().len(), 300);
    // contrato JSON
    let e = &r["itens"][0];
    for k in [
        "id",
        "tipo",
        "data",
        "titulo",
        "texto",
        "entidades",
        "fonte",
        "relevancia",
    ] {
        assert!(e.get(k).is_some(), "{k}");
    }
    assert!(e.get("numeros").is_none(), "numeros vazio é omitido");
    // relê o que escreveu (persistência entre execuções)
    assert_eq!(novidades::ler_existentes(&out).len(), 620);
}

#[test]
fn run_offline_com_prev_mescla_arquivos_anteriores() {
    let prev = snapshot_prev();
    novidades::escrever(
        &prev,
        &[ev("antigo", "2026-08-01T00:00:00Z", "x")],
        "2026-08-01T00:00:00Z",
    )
    .unwrap();
    let cur = snapshot_cur();
    let r = novidades::run(
        &novidades::Opts {
            prev: Some(prev),
            cur: cur.clone(),
            out: cur.clone(),
            agora: AGORA.into(),
            dias: 3,
        },
        &Fx(vec![]), // APIs fora do ar: só diff + arquivo anterior
    )
    .unwrap();
    assert!(r.erros > 0);
    let n = read(cur.join("v1/novidades.json"));
    let ids: Vec<&str> = n["itens"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["id"].as_str().unwrap())
        .collect();
    assert!(ids.contains(&"antigo"));
    assert!(n["itens"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e["tipo"] == "partido"));
    assert!(cur.join("v1/novidades/202608.json").exists());
}
