// Glifos simplificados das redes (sem dependência de pacote de marcas).
import type { ShareTargetId } from "./links";

const P = { width: 18, height: 18, viewBox: "0 0 24 24", "aria-hidden": true } as const;

export function NetIcon({ id }: { id: ShareTargetId }) {
  switch (id) {
    case "whatsapp":
      return (
        <svg {...P} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z" />
          <path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "x":
      return <svg {...P} fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" /></svg>;
    case "telegram":
      return <svg {...P} fill="currentColor"><path d="M21.5 3.6 2.9 10.8c-1 .4-1 1.6.1 1.9l4.7 1.5 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.4 4.9 3.6c.6.4 1.4.1 1.6-.6l3.2-15.6c.2-1-.7-1.9-1.9-1.6zM9.6 14l8.2-7.2-6.5 8.4-.3 3z" /></svg>;
    case "facebook":
      return <svg {...P} fill="currentColor"><path d="M14 8.5V6.8c0-.8.5-1.3 1.3-1.3H17V2.3h-2.6C11.6 2.3 10.5 4 10.5 6.4v2.1H8v3.3h2.5V22H14v-10.2h2.6l.4-3.3z" /></svg>;
    case "linkedin":
      return <svg {...P} fill="currentColor"><path d="M4.5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 9h3v12H3zm6 0h2.9v1.7c.5-.9 1.7-2 3.6-2 3.6 0 4.5 2.3 4.5 5.4V21h-3v-6.2c0-1.5-.3-3-2.1-3s-2.4 1.4-2.4 2.9V21H9z" /></svg>;
    case "bluesky":
      return <svg {...P} fill="currentColor"><path d="M12 10.8C10.9 8.6 7.9 4.6 5.1 2.6 2.4.7 1.4 1.3.7 1.6 0 2 0 3.2 0 3.9c0 .7.4 5.6.6 6.4.9 2.8 3.9 3.8 6.6 3.5-4 .6-7.5 2-2.9 7.2 5.1 5.2 7-1.1 7.7-4.4.7 3.3 1.5 9.5 7.6 4.4 4.6-4.4 1.3-6.6-2.8-7.2 2.8.3 5.7-.6 6.6-3.5.3-.8.6-5.7.6-6.4 0-.7 0-1.9-.7-2.3-.7-.3-1.7-.9-4.4 1-2.8 2-5.8 6-6.9 8.2z" /></svg>;
  }
}
