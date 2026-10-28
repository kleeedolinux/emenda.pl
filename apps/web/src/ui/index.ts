// UI kit do emenda.pl — importe sempre de "@/ui".
export { AppShell, NAV } from "./AppShell";
export { SearchDialog, openSearch } from "./SearchDialog";
export {
  PageHeader, Card, Section, Stat, StatGrid, Badge, PartyBadge, VoteBadge, Avatar, Skeleton, Spinner,
  ErrorState, EmptyState, KeyValue, ExternalLink, Timeline, ButtonLink, MaybeTip, NextSteps,
  type Crumb, type Tone, type TipProp,
} from "./primitives";
export { Money, NumberFmt } from "./Money";
export { Tip, Term, tipOf, GLOSSARIO } from "./Tip";
export { termo } from "./glossario";
export { DataTable, type Column, type DataTableProps } from "./DataTable";
export { Tabs, type TabDef } from "./Tabs";
export { Bars, type BarDatum } from "./charts/Bars";
export { Donut, type DonutDatum } from "./charts/Donut";
export { LineArea, type XY } from "./charts/LineArea";
export { Hemicycle, hemicycleLayout, type Seat } from "./charts/Hemicycle";
export { Sankey, type SankeyNode, type SankeyLink } from "./charts/Sankey";
export { Choropleth, type ChoroplethProps } from "@/features/geo/Choropleth";
export {
  Reveal, Stagger, RevealText, fadeUp, stagger, CountUp, NumberRoll, Magnetic, Parallax, ScrollProgress, Tilt,
  pressable, liftable, RouteTransition, TransitionLink, sharedTitleProps, Toaster, toast, useActive,
  duration, easing, spring, staggerStep, staggerDelay, cssEase, cubicBezier, pickMotion,
} from "./motion";
export { useTheme } from "./theme";
export { useApi, useCamara, camara, fetchJson, HttpError, ibge, externo, useMunicipiosIbge, useMalha } from "@/lib/data";
export { formatCNPJ, formatDocumento, formatNumber, formatPct, formatDate, toCSV } from "@/lib/format";
export { partyColor } from "@/lib/colors";
export { AvisoPrivacidade, ConsentBanner, PrivacidadeControle, OnlinePill, usePageHits } from "./Analytics";
export { Audiencia } from "./Audiencia";
export { useStats, sendHit, shouldTrack, type Aviso, type Stats } from "@/lib/analytics";
