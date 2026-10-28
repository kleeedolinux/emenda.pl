//! schema.org JSON-LD builders. Pure; values are `serde_json::Value`.
use super::{abs, Doc, GITHUB, LICENSE_URL, ORIGIN, SITE, X_PROFILE};
use serde_json::{json, Map, Value};

pub const ORG_ID: &str = "https://emenda.online/#org";
pub const SITE_ID: &str = "https://emenda.online/#website";

pub fn organization() -> Value {
    json!({
        "@type": "Organization",
        "@id": ORG_ID,
        "name": SITE,
        "url": format!("{ORIGIN}/"),
        "logo": format!("{ORIGIN}/brand/icon-512.png"),
        "description": "Transparência sobre emendas parlamentares, votações e gastos do Congresso Nacional.",
        "founder": {
            "@type": "Person",
            "name": "Júlia Klee",
            "url": X_PROFILE,
            "sameAs": [X_PROFILE]
        },
        "sameAs": [X_PROFILE, GITHUB]
    })
}

pub fn website() -> Value {
    json!({
        "@type": "WebSite",
        "@id": SITE_ID,
        "name": SITE,
        "url": format!("{ORIGIN}/"),
        "inLanguage": "pt-BR",
        "publisher": { "@id": ORG_ID },
        "potentialAction": {
            "@type": "SearchAction",
            "target": {
                "@type": "EntryPoint",
                "urlTemplate": format!("{ORIGIN}/deputados?q={{search_term_string}}")
            },
            "query-input": "required name=search_term_string"
        }
    })
}

pub fn breadcrumbs(crumbs: &[(String, String)], origin: &str) -> Value {
    let items: Vec<Value> = crumbs
        .iter()
        .enumerate()
        .map(|(i, (name, path))| {
            json!({ "@type": "ListItem", "position": i + 1, "name": name, "item": abs(origin, path) })
        })
        .collect();
    json!({ "@type": "BreadcrumbList", "itemListElement": items })
}

fn webpage(d: &Doc, origin: &str) -> Value {
    let url = abs(origin, &d.path);
    let mut v = json!({
        "@type": "WebPage",
        "@id": format!("{url}#page"),
        "url": url,
        "name": d.title,
        "description": d.description,
        "inLanguage": "pt-BR",
        "isPartOf": { "@id": SITE_ID },
        "publisher": { "@id": ORG_ID },
    });
    if let Some(u) = &d.updated {
        v["dateModified"] = json!(u);
    }
    if let Some(i) = &d.image {
        v["primaryImageOfPage"] = json!({ "@type": "ImageObject", "url": abs(origin, i) });
    }
    v
}

/// Full graph for a page: Organization, WebSite, WebPage, BreadcrumbList and the page entities.
pub fn graph(d: &Doc, origin: &str) -> Value {
    let mut nodes = vec![organization(), website(), webpage(d, origin)];
    if d.breadcrumbs.len() > 1 {
        nodes.push(breadcrumbs(&d.breadcrumbs, origin));
    }
    nodes.extend(d.entities.iter().cloned());
    json!({ "@context": "https://schema.org", "@graph": nodes })
}

/// Serialized JSON safe inside `<script>`: `<`, `>`, `&`, U+2028/2029 escaped.
pub fn to_script_json(v: &Value) -> String {
    let s = v.to_string();
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '<' => o.push_str("\\u003c"),
            '>' => o.push_str("\\u003e"),
            '&' => o.push_str("\\u0026"),
            '\u{2028}' => o.push_str("\\u2028"),
            '\u{2029}' => o.push_str("\\u2029"),
            c => o.push(c),
        }
    }
    o
}

pub fn script_tag(v: &Value) -> String {
    format!(
        "<script type=\"application/ld+json\">{}</script>",
        to_script_json(v)
    )
}

fn set(v: &mut Value, k: &str, x: Option<impl Into<Value>>) {
    if let (Some(x), Some(m)) = (x, v.as_object_mut()) {
        m.insert(k.into(), x.into());
    }
}

pub struct PersonIn<'a> {
    pub name: &'a str,
    pub url: &'a str,
    pub image: Option<&'a str>,
    /// "Deputado(a) federal" / "Senador(a)"
    pub job_title: &'a str,
    pub partido: Option<&'a str>,
    pub uf: Option<&'a str>,
    /// "Câmara dos Deputados" / "Senado Federal"
    pub casa: &'a str,
    pub same_as: Vec<String>,
}

pub fn person(p: &PersonIn) -> Value {
    let casa_url = if p.casa.starts_with("Senado") {
        "https://www.senado.leg.br"
    } else {
        "https://www.camara.leg.br"
    };
    let mut member =
        vec![json!({ "@type": "GovernmentOrganization", "name": p.casa, "url": casa_url })];
    if let Some(sg) = p.partido.filter(|s| !s.is_empty()) {
        member.push(json!({ "@type": "PoliticalParty", "name": sg, "url": format!("{ORIGIN}/partido/{sg}") }));
    }
    let mut v = json!({
        "@type": "Person",
        "@id": format!("{}#person", p.url),
        "name": p.name,
        "url": p.url,
        "jobTitle": p.job_title,
        "memberOf": member,
        "nationality": { "@type": "Country", "name": "Brasil" },
    });
    set(&mut v, "image", p.image);
    if let Some(uf) = p.uf.and_then(super::catalog::uf_nome) {
        v["workLocation"] = json!({ "@type": "AdministrativeArea", "name": uf });
    }
    if !p.same_as.is_empty() {
        v["sameAs"] = json!(p.same_as);
    }
    v
}

pub fn uf_area(uf: &str, nome: &str, origin: &str) -> Value {
    json!({
        "@type": "AdministrativeArea",
        "@id": format!("{}#place", abs(origin, &format!("/uf/{uf}"))),
        "name": nome,
        "alternateName": uf,
        "url": abs(origin, &format!("/uf/{uf}")),
        "containedInPlace": { "@type": "Country", "name": "Brasil" }
    })
}

/// Município: City (containedInPlace UF) + its prefeitura (GovernmentOrganization).
pub fn municipio(
    ibge: &str,
    nome: &str,
    uf: &str,
    prefeito: Option<(&str, Option<&str>)>,
    origin: &str,
) -> Vec<Value> {
    let url = abs(origin, &format!("/municipio/{ibge}"));
    let uf_nome = super::catalog::uf_nome(uf).unwrap_or(uf);
    let city = json!({
        "@type": "City",
        "@id": format!("{url}#place"),
        "name": nome,
        "url": url,
        "identifier": { "@type": "PropertyValue", "propertyID": "IBGE", "value": ibge },
        "containedInPlace": {
            "@type": "AdministrativeArea", "name": uf_nome, "alternateName": uf,
            "url": abs(origin, &format!("/uf/{uf}"))
        }
    });
    let mut gov = json!({
        "@type": "GovernmentOrganization",
        "name": format!("Prefeitura de {nome} ({uf})"),
        "areaServed": { "@id": format!("{url}#place") },
    });
    if let Some((p, partido)) = prefeito {
        let mut person = json!({ "@type": "Person", "name": p, "jobTitle": "Prefeito(a)" });
        set(
            &mut person,
            "memberOf",
            partido.map(|s| json!({ "@type": "PoliticalParty", "name": s })),
        );
        gov["employee"] = person;
    }
    vec![city, gov]
}

pub struct LegislationIn<'a> {
    pub url: &'a str,
    pub name: &'a str,
    pub identifier: &'a str,
    pub ementa: Option<&'a str>,
    pub date: Option<&'a str>,
    /// Situação atual (e.g. "Pronta para Pauta").
    pub situacao: Option<&'a str>,
    /// Câmara/Senado source URL.
    pub source: &'a str,
    pub authors: Vec<String>,
    pub text_url: Option<&'a str>,
}

pub fn legislation(l: &LegislationIn) -> Value {
    // Only enacted norms are "InForce"; bills in progress are "NotInForce".
    let in_force = l.situacao.is_some_and(|s| {
        let s = s.to_lowercase();
        s.contains("transformad") && (s.contains("norma") || s.contains("lei"))
    });
    let mut v = json!({
        "@type": "Legislation",
        "@id": format!("{}#legislation", l.url),
        "name": l.name,
        "legislationIdentifier": l.identifier,
        "url": l.url,
        "inLanguage": "pt-BR",
        "legislationJurisdiction": { "@type": "Country", "name": "Brasil" },
        "legislationPassedBy": { "@type": "GovernmentOrganization", "name": "Congresso Nacional" },
        "legislationLegalForce": if in_force { "https://schema.org/InForce" } else { "https://schema.org/NotInForce" },
        "isBasedOn": l.source,
    });
    set(&mut v, "description", l.ementa);
    set(&mut v, "abstract", l.ementa);
    set(
        &mut v,
        "legislationDate",
        l.date.map(|d| d.get(..10).unwrap_or(d).to_string()),
    );
    set(&mut v, "creativeWorkStatus", l.situacao);
    if !l.authors.is_empty() {
        let a: Vec<Value> = l
            .authors
            .iter()
            .map(|n| json!({ "@type": "Person", "name": n }))
            .collect();
        v["author"] = json!(a);
    }
    if let Some(t) = l.text_url {
        v["workExample"] = json!({ "@type": "Legislation", "encoding": { "@type": "MediaObject", "contentUrl": t } });
    }
    v
}

pub struct DatasetIn<'a> {
    pub url: &'a str,
    pub name: &'a str,
    pub description: &'a str,
    /// (name/format label, url, MIME)
    pub distribution: Vec<(String, String, &'a str)>,
    pub temporal: Option<String>,
    pub keywords: Vec<&'a str>,
    pub modified: Option<&'a str>,
    pub spatial: Option<String>,
}

pub fn dataset(d: &DatasetIn) -> Value {
    let dist: Vec<Value> = d
        .distribution
        .iter()
        .map(|(n, u, f)| json!({ "@type": "DataDownload", "name": n, "contentUrl": u, "encodingFormat": f }))
        .collect();
    let mut v = json!({
        "@type": "Dataset",
        "@id": format!("{}#dataset", d.url),
        "name": d.name,
        "description": d.description,
        "url": d.url,
        "inLanguage": "pt-BR",
        "isAccessibleForFree": true,
        "license": LICENSE_URL,
        "creator": { "@id": ORG_ID },
        "publisher": { "@id": ORG_ID },
        "isBasedOn": super::PORTAL,
        "distribution": dist,
    });
    set(&mut v, "temporalCoverage", d.temporal.clone());
    set(&mut v, "dateModified", d.modified);
    if !d.keywords.is_empty() {
        v["keywords"] = json!(d.keywords);
    }
    set(
        &mut v,
        "spatialCoverage",
        d.spatial
            .clone()
            .map(|s| json!({ "@type": "Place", "name": s })),
    );
    v
}

pub fn faq(qas: &[(String, String)]) -> Value {
    let items: Vec<Value> = qas
        .iter()
        .map(|(q, a)| json!({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } }))
        .collect();
    json!({ "@type": "FAQPage", "mainEntity": items })
}

pub struct EventIn<'a> {
    pub name: &'a str,
    pub start: &'a str,
    pub end: Option<&'a str>,
    pub location: &'a str,
    pub url: &'a str,
    pub cancelled: bool,
    pub description: Option<&'a str>,
}

pub fn event(e: &EventIn) -> Value {
    let mut v = json!({
        "@type": "Event",
        "name": e.name,
        "startDate": e.start,
        "url": e.url,
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "eventStatus": if e.cancelled { "https://schema.org/EventCancelled" } else { "https://schema.org/EventScheduled" },
        "location": { "@type": "Place", "name": e.location, "address": { "@type": "PostalAddress", "addressLocality": "Brasília", "addressRegion": "DF", "addressCountry": "BR" } },
        "organizer": { "@type": "GovernmentOrganization", "name": "Câmara dos Deputados", "url": "https://www.camara.leg.br" },
    });
    set(&mut v, "endDate", e.end);
    set(&mut v, "description", e.description);
    v
}

/// ItemList of links (top lists on listing pages).
pub fn item_list(name: &str, items: &[(String, String)], origin: &str) -> Value {
    let els: Vec<Value> = items
        .iter()
        .enumerate()
        .map(|(i, (n, p))| json!({ "@type": "ListItem", "position": i + 1, "name": n, "url": abs(origin, p) }))
        .collect();
    let mut m = Map::new();
    m.insert("@type".into(), json!("ItemList"));
    m.insert("name".into(), json!(name));
    m.insert("numberOfItems".into(), json!(items.len()));
    m.insert("itemListElement".into(), json!(els));
    Value::Object(m)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc() -> Doc {
        Doc {
            path: "/municipio/2914406".into(),
            title: "Iraquara (BA) </script><b>".into(),
            description: "d".into(),
            breadcrumbs: vec![
                ("Início".into(), "/".into()),
                ("BA".into(), "/uf/BA".into()),
            ],
            ..Default::default()
        }
    }

    #[test]
    fn graph_is_valid_json_and_script_safe() {
        let g = graph(&doc(), ORIGIN);
        let tag = script_tag(&g);
        assert!(!tag[..tag.len() - 9].contains("</script"), "{tag}");
        assert!(!tag[35..tag.len() - 9].contains('<'));
        let inner =
            &tag["<script type=\"application/ld+json\">".len()..tag.len() - "</script>".len()];
        let back: Value = serde_json::from_str(inner).unwrap();
        assert_eq!(back, g);
        let types: Vec<&str> = g["@graph"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|n| n["@type"].as_str())
            .collect();
        assert_eq!(
            types,
            ["Organization", "WebSite", "WebPage", "BreadcrumbList"]
        );
        assert_eq!(
            g["@graph"][3]["itemListElement"][1]["item"],
            "https://emenda.online/uf/BA"
        );
    }

    #[test]
    fn org_and_search_action() {
        let o = organization();
        assert_eq!(o["founder"]["name"], "Júlia Klee");
        assert!(o["sameAs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s == X_PROFILE));
        let w = website();
        assert_eq!(
            w["potentialAction"]["query-input"],
            "required name=search_term_string"
        );
        assert!(w["potentialAction"]["target"]["urlTemplate"]
            .as_str()
            .unwrap()
            .contains("{search_term_string}"));
    }

    #[test]
    fn person_has_party_and_casa() {
        let p = person(&PersonIn {
            name: "Fulana",
            url: "https://emenda.online/deputado/1",
            image: Some("https://x/1.jpg"),
            job_title: "Deputada federal",
            partido: Some("PL"),
            uf: Some("SP"),
            casa: "Câmara dos Deputados",
            same_as: vec!["https://www.camara.leg.br/deputados/1".into()],
        });
        assert_eq!(p["@type"], "Person");
        assert_eq!(p["memberOf"][0]["name"], "Câmara dos Deputados");
        assert_eq!(p["memberOf"][1]["@type"], "PoliticalParty");
        assert_eq!(p["workLocation"]["name"], "São Paulo");
        assert_eq!(p["image"], "https://x/1.jpg");
    }

    #[test]
    fn municipio_contained_in_uf() {
        let v = municipio(
            "2914406",
            "Iraquara",
            "BA",
            Some(("NINO", Some("PSD"))),
            ORIGIN,
        );
        assert_eq!(v[0]["@type"], "City");
        assert_eq!(v[0]["containedInPlace"]["name"], "Bahia");
        assert_eq!(v[1]["employee"]["memberOf"]["name"], "PSD");
    }

    #[test]
    fn legislation_force_and_dates() {
        let l = legislation(&LegislationIn {
            url: "https://emenda.online/proposicao/1",
            name: "PL 1/2020",
            identifier: "PL 1/2020",
            ementa: Some("Ementa"),
            date: Some("2020-07-03T16:28"),
            situacao: Some("Pronta para Pauta"),
            source: "https://www.camara.leg.br/propostas-legislativas/1",
            authors: vec!["A".into()],
            text_url: None,
        });
        assert_eq!(l["legislationDate"], "2020-07-03");
        assert_eq!(l["legislationLegalForce"], "https://schema.org/NotInForce");
        assert_eq!(
            l["isBasedOn"],
            "https://www.camara.leg.br/propostas-legislativas/1"
        );
        let l2 = legislation(&LegislationIn {
            situacao: Some("Transformado em Norma Jurídica"),
            ..LegislationIn {
                url: "u",
                name: "n",
                identifier: "i",
                ementa: None,
                date: None,
                situacao: None,
                source: "s",
                authors: vec![],
                text_url: None,
            }
        });
        assert_eq!(l2["legislationLegalForce"], "https://schema.org/InForce");
    }

    #[test]
    fn dataset_faq_event() {
        let d = dataset(&DatasetIn {
            url: "https://emenda.online/uf/BA",
            name: "n",
            description: "d",
            distribution: vec![(
                "JSON".into(),
                "https://emenda.online/data/v1/uf/BA.json".into(),
                "application/json",
            )],
            temporal: Some("2014/2026".into()),
            keywords: vec!["emendas"],
            modified: Some("2026-10-28"),
            spatial: Some("Bahia".into()),
        });
        assert_eq!(d["distribution"][0]["encodingFormat"], "application/json");
        assert_eq!(d["temporalCoverage"], "2014/2026");
        assert_eq!(d["creator"]["@id"], ORG_ID);
        let f = faq(&[("Q?".into(), "A.".into())]);
        assert_eq!(f["mainEntity"][0]["acceptedAnswer"]["text"], "A.");
        let e = event(&EventIn {
            name: "Sessão",
            start: "2026-10-28T09:30",
            end: None,
            location: "Plenário",
            url: "u",
            cancelled: true,
            description: None,
        });
        assert_eq!(e["eventStatus"], "https://schema.org/EventCancelled");
        assert!(e.get("endDate").is_none());
    }
}
