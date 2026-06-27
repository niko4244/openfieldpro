#!/usr/bin/env python3
"""drawio-preview MCP server (stdio / SSE).

Generates a viewable artifact from any DrawIO XML, complementing the
@drawio/mcp server's open_* tools (those open the diagram in the
app.diagrams.net editor; this one provides a read-only preview directly).

Run:
    python mcp_drawio_preview.py            # stdio (default - what Claude/Odysseus use)
    python mcp_drawio_preview.py --sse      # SSE on :8768

Tools:
    preview_drawio(xml, format='url'|'html', title=...) -> str
        format='url':  app.diagrams.net?lightbox=1#R<base64> URL (open in any browser)
        format='html': self-contained <iframe> HTML page (save to .html, open locally)
"""
from __future__ import annotations

import argparse
import base64
import logging
import sys

logger = logging.getLogger("drawio.preview.mcp")


def _preview_url(xml: str) -> str:
    """Return app.diagrams.net lightbox URL with the diagram embedded as base64.
    nav=0 + toolbar=0 strips the page tabs and editor toolbar for a clean read-only view."""
    encoded = base64.urlsafe_b64encode(xml.encode("utf-8")).decode("ascii").rstrip("=")
    return f"https://app.diagrams.net/?lightbox=1&dark=auto&nav=0&toolbar=0#R{encoded}"


def _preview_html(xml: str, title: str = "DrawIO Diagram") -> str:
    """Return self-contained HTML page with the diagram embedded via lightbox iframe."""
    safe_title = (title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    url = _preview_url(xml)
    return (
        f'<!DOCTYPE html>\n<html lang="en">\n<head>\n'
        f'<meta charset="utf-8">\n<title>{safe_title}</title>\n'
        f'<style>html,body{{margin:0;height:100%;background:#fff}}'
        f'iframe{{border:0;width:100%;height:100%}}</style>\n'
        f'</head>\n<body>\n<iframe src="{url}"></iframe>\n</body>\n</html>\n'
    )


def create_server():
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP(
        "drawio-preview",
        instructions=(
            "Render a DrawIO XML diagram into a viewable artifact. "
            "format='url' returns an app.diagrams.net lightbox URL (browser-loadable). "
            "format='html' returns a self-contained HTML page that embeds the URL in an iframe "
            "(save to .html and open locally; works offline once cached)."
        ),
    )

    @mcp.tool()
    def preview_drawio(xml: str, format: str = "url", title: str = "DrawIO Diagram") -> str:
        """Render a DrawIO XML diagram into a viewable artifact.

        Args:
            xml: The DrawIO mxGraphModel XML (raw <mxfile>...</mxfile> string).
            format: 'url' returns an app.diagrams.net lightbox URL (default);
                    'html' returns a self-contained HTML page that embeds the URL in an iframe.
            title: Only used when format='html'; the <title> tag in the output.
        """
        # ponytail: cap XML before base64 expansion. ~200 KB raw -> ~270 KB base64,
        # which is near the URL-fragment length ceiling for app.diagrams.net's
        # lightbox. Larger diagrams should render server-side then embed (PNG/SVG).
        n_bytes = len(xml.encode("utf-8"))
        if n_bytes > 200_000:
            return f"ERROR: xml is {n_bytes:,} bytes (cap 200,000) - render server-side then embed"

        fmt = (format or "url").strip().lower()
        if fmt == "url":
            return _preview_url(xml)
        if fmt == "html":
            return _preview_html(xml, title)
        return f"ERROR: unsupported format {format!r} (expected 'url' or 'html')"

    return mcp


def main():
    parser = argparse.ArgumentParser(description="drawio-preview MCP server (stdio/SSE)")
    parser.add_argument("--sse", action="store_true",
                        help="Use SSE transport instead of stdio")
    parser.add_argument("--port", type=int, default=8768,
                        help="Port for SSE (default 8768)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    mcp = create_server()

    if args.sse:
        logger.info("Starting drawio-preview MCP on SSE :%d", args.port)
        mcp.run(transport="sse", port=args.port)
    else:
        logger.info("Starting drawio-preview MCP on stdio")
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
