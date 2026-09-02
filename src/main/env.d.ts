/* Vite ?raw imports used by the export modules to inline stylesheets. */
declare module '*?raw' {
  const content: string
  export default content
}

/* Baked in by electron.vite.config.ts (main and preload): which update
 * channel this build carries. */
declare const __FOOLSCAP_EDITION__: 'direct' | 'store'
