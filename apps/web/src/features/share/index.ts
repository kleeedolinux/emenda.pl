// Compartilhamento viral. Páginas importam só daqui (botões leves); diálogo, canvas, GIF e vídeo vêm sob demanda.
// ShareBar inline: importe de "@/features/share/ShareBar" (fica fora do chunk comum das páginas).
export { ShareButton, type ShareButtonProps } from "./ShareButton";
export { VotoDestaque, ShareVoto } from "./VotoDestaque";
export { votoShare } from "./voto";
export { type ShareData, type ShareKind, type ShareMetric } from "./links";
