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
      const isEventStream = contentType.includes("text/event-stream");
      const responseHeaders = rewriteResponseHeaders(proxyResponse.headers, project, targetUrl);

      if (!isHtml || isEventStream) {
        res.writeHead(proxyResponse.statusCode || 502, responseHeaders);
        proxyResponse.pipe(res);
        return;
      }

      const chunks = [];
      proxyResponse.on("data", (chunk) => chunks.push(chunk));
      proxyResponse.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const rewrittenBody = injectRouteBase(body, project.webPath);
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
  res.end(
    [
      "<h1>Navix Routes</h1>",
      projects.length === 0
        ? "<p>No web routes configured.</p>"
        : `<ul>${projects
            .map(
              (project) =>
                `<li><a href="/${project.webPath}/">/${project.webPath}/</a> -> ${project.alias} (<a href="${project.webTarget}">${project.webTarget}</a>)</li>`
            )
            .join("")}</ul>`,
    ].join("")
  );
}

module.exports = {
  startProxyServer,
};
