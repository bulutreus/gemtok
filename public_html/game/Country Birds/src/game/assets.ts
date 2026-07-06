/** `public/` → `dist/`; `import.meta.env.BASE_URL` ile `file://` ve `./` tabanlı dağıtım uyumlu */
const B = import.meta.env.BASE_URL;

export function publicUrl(path: string): string {
  const p = path.replace(/^\//, "");
  return B.endsWith("/") ? `${B}${p}` : `${B}/${p}`;
}

export const BIRD_URLS = [
  publicUrl("assets/1.PNG"),
  publicUrl("assets/2.PNG"),
  publicUrl("assets/3.PNG"),
  publicUrl("assets/4.PNG"),
  publicUrl("assets/5.PNG"),
  publicUrl("assets/6.PNG"),
];

/** Hedef domuzlar; `public/assets/pig.png` */
export const PIG_URL = publicUrl("assets/pig.png");

export const BACKGROUND_URLS = [
  publicUrl("assets/backg1.PNG"),
  publicUrl("assets/backg2.PNG"),
  publicUrl("assets/backg3.PNG"),
  publicUrl("assets/backg4.PNG"),
  publicUrl("assets/backg5.PNG"),
  publicUrl("assets/backg6.PNG"),
  publicUrl("assets/backg7.PNG"),
  publicUrl("assets/backg8.PNG"),
];

export const TEAM_COUNT = BIRD_URLS.length;
