import * as D from "@radix-ui/react-dialog";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Banknote, ChevronDown, FileText, Home as HomeIcon, Menu, Moon, Search, Sun, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigation } from "react-router";
import { Logo } from "@/ui/brand/Logo";
import { SEARCH_EVENT, SearchDialog } from "./SearchDialog";
import { AvisoPrivacidade, OnlinePill, usePageHits } from "./Analytics";
import { useTheme } from "./theme";
import { RouteTransition, ScrollProgress, Toaster, spring } from "./motion";

/** Navegação principal. `mais: true` vai para o menu "Mais" no desktop (no móvel, tudo fica no menu lateral). */
export const NAV = [
  { to: "/", label: "Início", end: true },
  { to: "/emendas", label: "Emendas" },
  { to: "/pix", label: "Emenda Pix" },
  { to: "/ultimas", label: "Últimas" },
  { to: "/dinheiro", label: "Dinheiro" },
  { to: "/deputados", label: "Deputados" },
  { to: "/senadores", label: "Senadores" },
  { to: "/proposicoes", label: "Proposições" },
  { to: "/estaduais", label: "Estaduais", mais: true },
  { to: "/partidos", label: "Partidos", mais: true },
  { to: "/agenda", label: "Agenda", mais: true },
  { to: "/entenda", label: "Entenda", mais: true },
  { to: "/sobre", label: "Sobre", mais: true },
] as const;
const NAV_MAIN = NAV.filter((n) => !("mais" in n));
const NAV_MAIS = NAV.filter((n) => "mais" in n);

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function AppShell() {
  const [search, setSearch] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const navigation = useNavigation();
  const reduce = useReducedMotion();
  usePageHits();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((s) => !s); }
      else if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setSearch(true); }
    };
    const onOpen = (e: Event) => { setInitialQuery((e as CustomEvent<string>).detail ?? ""); setSearch(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener(SEARCH_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(SEARCH_EVENT, onOpen); };
  }, []);
  useEffect(() => setDrawer(false), [loc.pathname]);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip pb-16 lg:pb-0">
      <a href="#conteudo" className="sr-only z-[200] rounded-lg bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Pular para o conteúdo</a>
      <div className="h-1 bandeira" aria-hidden />
      <ScrollProgress />
      <AnimatePresence>
        {navigation.state !== "idle" && (
          <motion.div
            key="progress"
            className="fixed inset-x-0 top-0 z-[120] h-0.5 origin-left bg-amarelo"
            initial={{ scaleX: 0 }} animate={{ scaleX: 0.8 }} exit={{ scaleX: 1, opacity: 0 }}
            transition={{ duration: 0.8 }}
            role="progressbar" aria-label="Carregando página"
          />
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-50 border-b border-line glass">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center rounded-lg" aria-label="emenda.pl — página inicial">
            <Logo variant="full" className="h-8 w-auto" />
          </Link>
          <nav aria-label="Principal" className="ml-4 hidden flex-1 items-center gap-0.5 xl:flex">
            {NAV_MAIN.map((n) => (
              <NavLink key={n.to} to={n.to} end={"end" in n} className={({ isActive }) => clsx("relative rounded-lg px-2.5 py-1.5 text-sm font-medium transition", isActive ? "text-fg" : "text-muted hover:text-fg")}>
                {({ isActive }) => (
                  <>
                    {n.label}
                    {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-lg bg-verde/12" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                  </>
                )}
              </NavLink>
            ))}
            <MaisMenu />
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden 2xl:block"><OnlinePill /></span>
            <button type="button" onClick={() => setSearch(true)} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-muted hover:text-fg" aria-label="Buscar (Ctrl+K)">
              <Search className="size-4" aria-hidden />
              <span className="hidden sm:inline">Buscar</span>
              <kbd className="hidden rounded border border-line px-1 text-[10px] font-semibold md:inline">{isMac ? "⌘" : "Ctrl"} K</kbd>
            </button>
            <button type="button" onClick={toggle} className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <D.Root open={drawer} onOpenChange={setDrawer}>
              <D.Trigger className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg xl:hidden" aria-label="Abrir menu"><Menu className="size-5" /></D.Trigger>
              <D.Portal>
                <D.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" />
                <D.Content aria-describedby={undefined} className="fixed inset-y-0 right-0 z-[85] flex w-72 max-w-[85vw] flex-col border-l border-line bg-surface p-4 shadow-2xl">
                  <div className="mb-4 flex items-center justify-between">
                    <D.Title className="font-display text-lg font-bold">Menu</D.Title>
                    <D.Close className="rounded-lg p-1.5 hover:bg-surface-2" aria-label="Fechar menu"><X className="size-5" /></D.Close>
                  </div>
                  <nav aria-label="Principal (móvel)" className="-mx-1 flex flex-col gap-1 overflow-y-auto px-1">
                    {NAV.map((n, i) => (
                      <motion.div key={n.to} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                        <NavLink to={n.to} end={"end" in n} className={({ isActive }) => clsx("block rounded-xl px-3 py-2.5 font-medium", isActive ? "bg-verde/12 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}>
                          {n.label}
                        </NavLink>
                      </motion.div>
                    ))}
                  </nav>
                </D.Content>
              </D.Portal>
            </D.Root>
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <RouteTransition routeKey={loc.pathname}>
          <Outlet />
        </RouteTransition>
      </main>

      <Footer />
      <nav aria-label="Atalhos (móvel)" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line glass pb-[env(safe-area-inset-bottom)] lg:hidden">
        {[
          { to: "/", label: "Início", icon: HomeIcon, end: true },
          { to: "/emendas", label: "Emendas", icon: FileText },
          { to: "/dinheiro", label: "Dinheiro", icon: Banknote },
          { to: "/deputados", label: "Deputados", icon: Users },
        ].map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive ? "text-accent" : "text-muted")}>
            <n.icon className="size-5" aria-hidden />{n.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setSearch(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted">
          <Search className="size-5" aria-hidden />Buscar
        </button>
      </nav>
      <SearchDialog open={search} onOpenChange={(o) => { setSearch(o); if (!o) setInitialQuery(""); }} initialQuery={initialQuery} />
      <AvisoPrivacidade />
      <Toaster />
      <ScrollRestoration getKey={(l) => l.pathname} />
    </div>
  );
}

/** "Mais" (desktop): disclosure simples; fecha com Esc, clique fora ou troca de rota. */
function MaisMenu() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const ativo = NAV_MAIS.some((n) => loc.pathname.startsWith(n.to));
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-controls="nav-mais" onClick={() => setOpen((o) => !o)} className={clsx("press inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium", ativo || open ? "text-fg" : "text-muted hover:text-fg")}>
        Mais <ChevronDown className={clsx("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            id="nav-mais"
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={spring.snappy}
            className="absolute left-0 top-full z-50 mt-2 min-w-44 origin-top-left rounded-xl border border-line bg-surface p-1 shadow-xl"
          >
            {NAV_MAIS.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} className={({ isActive }) => clsx("block rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-verde/12 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}>{n.label}</NavLink>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function Footer() {
  const ext = "link text-muted hover:text-fg";
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo variant="full" className="h-8 w-auto" />
          <p className="mt-3 max-w-sm text-sm text-muted">
            O maior site de transparência do Brasil sobre emendas parlamentares: quem indicou, para onde foi e quanto foi pago.
          </p>
          <p className="mt-4 text-sm">
            Feito por <a className="link font-semibold" href="https://x.com/klee00z" target="_blank" rel="noopener noreferrer">Júlia Klee · @klee00z</a>
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Fontes oficiais</h2>
          <ul className="space-y-1 text-sm">
            <li><a className={ext} href="https://portaldatransparencia.gov.br/emendas" target="_blank" rel="noopener noreferrer">Portal da Transparência</a></li>
            <li><a className={ext} href="https://dadosabertos.camara.leg.br" target="_blank" rel="noopener noreferrer">Câmara dos Deputados</a></li>
            <li><a className={ext} href="https://legis.senado.leg.br/dadosabertos" target="_blank" rel="noopener noreferrer">Senado Federal</a></li>
            <li><a className={ext} href="https://servicodados.ibge.gov.br" target="_blank" rel="noopener noreferrer">IBGE</a></li>
            <li><a className={ext} href="https://dadosabertos.tse.jus.br" target="_blank" rel="noopener noreferrer">TSE</a></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Código aberto</h2>
          <ul className="space-y-1 text-sm">
            <li><a className={ext} href="https://github.com/kleeedolinux/emenda.pl" target="_blank" rel="noopener noreferrer">github.com/kleeedolinux/emenda.pl</a></li>
            <li><a className={ext} href="https://github.com/kleeedolinux/emenda-pl-data" target="_blank" rel="noopener noreferrer">Dados: emenda-pl-data</a></li>
            <li><a className={ext} href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer">Licença GPL-3.0</a></li>
            <li><Link className={ext} to="/sobre">Metodologia e limitações</Link></li>
            <li><Link className={ext} to="/api">API de dados</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-muted">
        <OnlinePill className="mb-2" />
        <p>emenda.pl · GPL-3.0 · Dados públicos · Não é um site oficial do governo · <Link className="link" to="/sobre#audiencia">Audiência</Link></p>
      </div>
    </footer>
  );
}
