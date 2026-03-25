"use strict";

const http = require("http");
const https = require("https");
const { URL } = require("url");

function startProxyServer(registry, port) {
  const server = http.createServer((req, res) => {
    handleRequest(registry, req, res);
  });

  server.listen(port, () => {
    console.log(`Navix proxy listening on http://127.0.0.1:${port}`);
    for (const project of registry.listWebProjects()) {
      console.log(`  /${project.webPath}/ -> ${project.webTarget}`);
    }
  });

  return server;
}

function handleRequest(registry, req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length === 0) {
    respondWithRouteIndex(registry, res);
    return;
  }

  const webPath = pathParts[0].toLowerCase();
  const project = registry.listWebProjects().find((entry) => entry.webPath === webPath);
  if (!project) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Unknown route '${webPath}'.`);
    return;
  }

  if (url.pathname === `/${project.webPath}`) {
    res.writeHead(302, { Location: `/${project.webPath}/` });
    res.end();
    return;
  }

  const targetUrl = new URL(project.webTarget);
  const rewrittenPath = `/${pathParts.slice(1).join("/")}`;
  const targetPath = rewrittenPath === "/" ? "/" : rewrittenPath;
  const requestHeaders = {
    ...req.headers,
    host: targetUrl.host,
    "x-forwarded-host": req.headers.host || "",
    "x-forwarded-prefix": `/${project.webPath}`,
  };
  delete requestHeaders["accept-encoding"];

  const client = targetUrl.protocol === "https:" ? https : http;
  const proxyRequest = client.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      method: req.method,
      path: `${targetPath}${url.search}`,
      headers: requestHeaders,
    },
    (proxyResponse) => {
      const contentType = String(proxyResponse.headers["content-type"] || "");
      const isHtml = contentType.includes("text/html");
      const isJavaScript = contentType.includes("javascript");
      const isEventStream = contentType.includes("text/event-stream");
      const responseHeaders = rewriteResponseHeaders(proxyResponse.headers, project, targetUrl);

      if ((!isHtml && !isJavaScript) || isEventStream) {
        res.writeHead(proxyResponse.statusCode || 502, responseHeaders);
        proxyResponse.pipe(res);
        return;
      }

      const chunks = [];
      proxyResponse.on("data", (chunk) => chunks.push(chunk));
      proxyResponse.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const rewrittenBody = isHtml
          ? injectRouteBase(rewriteHtmlRootPaths(body, project.webPath), project.webPath)
          : rewriteJavaScriptRootPaths(body, project.webPath);
        responseHeaders["content-length"] = Buffer.byteLength(rewrittenBody);
        res.writeHead(proxyResponse.statusCode || 502, responseHeaders);
        res.end(rewrittenBody);
      });
    }
  );

  proxyRequest.on("error", (error) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Bad gateway for /${project.webPath}/ -> ${project.webTarget}: ${error.message}`);
  });

  req.pipe(proxyRequest);
}

function rewriteResponseHeaders(headers, project, targetUrl) {
  const nextHeaders = { ...headers };
  delete nextHeaders["content-length"];

  if (nextHeaders.location) {
    nextHeaders.location = rewriteLocation(String(nextHeaders.location), project, targetUrl);
  }

  return nextHeaders;
}

function rewriteLocation(location, project, targetUrl) {
  if (location.startsWith("/")) {
    return `/${project.webPath}${location}`;
  }

  try {
    const parsed = new URL(location);
    if (parsed.origin === targetUrl.origin) {
      return `/${project.webPath}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return location;
  }

  return location;
}

function rewriteHtmlRootPaths(html, webPath) {
  return html.replace(/(\s(?:src|href|action)=["'])\/(?!\/|https?:|#)/gi, `$1/${webPath}/`);
}

function rewriteJavaScriptRootPaths(source, webPath) {
  const escapedPrefix = `/${webPath}/`;

  return source
    .replace(/((?:\bimport\s*\(\s*|\bimport\s+|\bfrom\s+|new\s+URL\s*\(\s*)["'])\/(?!\/|https?:)/g, (match, prefix) => {
      if (match.includes(escapedPrefix)) {
        return match;
      }

      return `${prefix}/${webPath}/`;
    })
    .replace(/(["'`])\/(node_modules|src|@vite)\//g, (match, quote, segment) => {
      if (match.includes(escapedPrefix)) {
        return match;
      }

      return `${quote}/${webPath}/${segment}/`;
    });
}

function injectRouteBase(html, webPath) {
  const injection = [
    `<base href="/${webPath}/">`,
    "<script>",
    "(function(){",
    `var prefix='/${webPath}';`,
    "function rewrite(url){",
    " if(typeof url!=='string') return url;",
    " if(url.startsWith('//')) return url;",
    " if(url === '/') return prefix + '/';",
    " if(url.startsWith(prefix + '/')) return url;",
    " if(url.startsWith('/')) return prefix + url;",
    " return url;",
    "}",
    "var originalFetch = window.fetch;",
    "window.fetch = function(input, init){",
    " if(typeof input === 'string'){ return originalFetch.call(this, rewrite(input), init); }",
    " if(input && typeof input.url === 'string'){ return originalFetch.call(this, new Request(rewrite(input.url), input), init); }",
    " return originalFetch.call(this, input, init);",
    "};",
    "var originalOpen = XMLHttpRequest.prototype.open;",
    "XMLHttpRequest.prototype.open = function(method, url){",
    " arguments[1] = rewrite(url);",
    " return originalOpen.apply(this, arguments);",
    "};",
    "if(window.EventSource){",
    " var OriginalEventSource = window.EventSource;",
    " window.EventSource = function(url, config){ return new OriginalEventSource(rewrite(url), config); };",
    "}",
    "})();",
    "</script>",
  ].join("");

  if (html.includes("</head>")) {
    return html.replace("</head>", `${injection}</head>`);
  }

  return `${injection}${html}`;
}

function respondWithRouteIndex(registry, res) {
  const projects = registry.listWebProjects();
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(renderRouteIndex(projects));
}

function renderRouteIndex(projects) {
  const cards = projects.length === 0 ? renderEmptyState() : projects.map(renderProjectCard).join("");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Navix</title>",
    '<style>',
    "body{margin:0;font-family:Georgia,\"Times New Roman\",serif;background:linear-gradient(180deg,#f3efe5 0%,#e6dfd2 100%);color:#1d1a16;}",
    ".page{min-height:100vh;position:relative;overflow:hidden;}",
    ".page:before,.page:after{content:\"\";position:absolute;border-radius:999px;filter:blur(20px);opacity:.35;pointer-events:none;}",
    ".page:before{width:28rem;height:28rem;background:#cf6f45;top:-10rem;right:-8rem;}",
    ".page:after{width:24rem;height:24rem;background:#7d8f69;left:-8rem;bottom:-10rem;}",
    ".shell{position:relative;z-index:1;max-width:1180px;margin:0 auto;padding:56px 24px 72px;}",
    ".hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:24px;align-items:end;margin-bottom:28px;}",
    ".eyebrow{margin:0 0 12px;font:700 12px/1.2 Arial,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#7d4d39;}",
    "h1{margin:0;font-size:clamp(3rem,7vw,6rem);line-height:.92;font-weight:700;letter-spacing:-.04em;}",
    ".intro{max-width:42rem;margin:18px 0 0;font:500 18px/1.6 Arial,sans-serif;color:#4b433c;}",
    ".hero-card{background:rgba(255,250,243,.78);border:1px solid rgba(60,42,24,.12);border-radius:28px;padding:24px;backdrop-filter:blur(8px);box-shadow:0 20px 60px rgba(54,40,24,.08);}",
    ".hero-stat{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid rgba(60,42,24,.1);font:600 14px/1.5 Arial,sans-serif;color:#5d534a;}",
    ".hero-stat:last-child{border-bottom:none;padding-bottom:0;}",
    ".hero-stat:first-child{padding-top:0;}",
    ".hero-stat strong{font-size:28px;line-height:1;color:#181410;}",
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;}",
    ".card{position:relative;display:flex;flex-direction:column;gap:18px;padding:24px;border-radius:24px;text-decoration:none;color:inherit;background:rgba(255,252,247,.92);border:1px solid rgba(60,42,24,.12);box-shadow:0 20px 50px rgba(54,40,24,.08);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;}",
    ".card:hover{transform:translateY(-4px);box-shadow:0 26px 60px rgba(54,40,24,.14);border-color:rgba(125,77,57,.28);}",
    ".card-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;}",
    ".route-chip{display:inline-flex;align-items:center;padding:8px 12px;border-radius:999px;background:#1d1a16;color:#f8f2e9;font:700 12px/1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;}",
    ".target-chip{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;background:#ece3d4;color:#6a5b4d;font:700 11px/1.1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;}",
    ".card h2{margin:0;font-size:32px;line-height:1;letter-spacing:-.04em;}",
    ".meta{display:grid;gap:10px;font:500 14px/1.5 Arial,sans-serif;color:#544a42;}",
    ".meta-label{display:block;margin-bottom:2px;font:700 11px/1.2 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8a7769;}",
    ".actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:auto;}",
    ".button{display:inline-flex;align-items:center;justify-content:center;padding:12px 16px;border-radius:14px;font:700 14px/1 Arial,sans-serif;text-decoration:none;transition:filter .18s ease,transform .18s ease;}",
    ".button:hover{filter:brightness(.98);transform:translateY(-1px);}",
    ".button-primary{background:#c96d47;color:#fff8f3;}",
    ".button-secondary{background:#ebe1d3;color:#332922;}",
    ".footer{margin-top:28px;font:500 13px/1.7 Arial,sans-serif;color:#675b51;}",
    ".empty{padding:30px;border-radius:24px;background:rgba(255,252,247,.78);border:1px dashed rgba(60,42,24,.18);font:500 16px/1.7 Arial,sans-serif;color:#5c534c;}",
    "@media (max-width:820px){.hero{grid-template-columns:1fr;}h1{font-size:clamp(2.8rem,16vw,4.4rem);}.card h2{font-size:28px;}}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="page">',
    '<div class="shell">',
    '<section class="hero">',
    "<div>",
    '<p class="eyebrow">Local Project Router</p>',
    "<h1>Navix</h1>",
    '<p class="intro">Jedno místo pro lokální nástroje, dev servery a rychlé přepínání mezi projekty. Otevři route přes proxy, nebo skoč rovnou na cílový port.</p>',
    "</div>",
    '<aside class="hero-card">',
    `<div class="hero-stat"><span>Active routes</span><strong>${projects.length}</strong></div>`,
    '<div class="hero-stat"><span>Proxy mode</span><strong>Local</strong></div>',
    '<div class="hero-stat"><span>Entry point</span><strong>/</strong></div>',
    "</aside>",
    "</section>",
    `<section class="grid">${cards}</section>`,
    '<p class="footer">Tip: primární tlačítko otevírá route přes Navix proxy. Sekundární odkaz vede přímo na cílový lokální server.</p>',
    "</div>",
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function renderProjectCard(project) {
  return [
    '<article class="card">',
    '<div class="card-top">',
    `<span class="route-chip">/${escapeHtml(project.webPath)}/</span>`,
    '<span class="target-chip">Live target</span>',
    "</div>",
    `<h2>${escapeHtml(project.alias)}</h2>`,
    '<div class="meta">',
    `<div><span class="meta-label">Proxy Route</span><strong>/${escapeHtml(project.webPath)}/</strong></div>`,
    `<div><span class="meta-label">Target URL</span><span>${escapeHtml(project.webTarget)}</span></div>`,
    project.path
      ? `<div><span class="meta-label">Local Path</span><span>${escapeHtml(project.path)}</span></div>`
      : "",
    "</div>",
    '<div class="actions">',
    `<a class="button button-primary" href="/${encodeURIComponent(project.webPath)}/">Open Through Navix</a>`,
    `<a class="button button-secondary" href="${escapeAttribute(project.webTarget)}">Open Direct</a>`,
    "</div>",
    "</article>",
  ].join("");
}

function renderEmptyState() {
  return '<div class="empty">No web routes configured yet. Add projects with <code>navix add-web</code> or update <code>./.navix/projects.json</code>.</div>';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

module.exports = {
  startProxyServer,
};
