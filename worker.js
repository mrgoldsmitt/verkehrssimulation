export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Verhindere Zugriff auf sensible System- und Entwicklungsdateien
    if (
      url.pathname.startsWith('/.') ||
      url.pathname.startsWith('/dist') ||
      url.pathname === '/deploy_release.sh' ||
      url.pathname === '/wrangler.toml' ||
      url.pathname === '/worker.js'
    ) {
      return new Response('Not Found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  }
};
