#!/usr/bin/env python
"""Deprecated thin shim. Use add_aggregator_endpoint.py kilo [flags] directly.

Kept for backward compat with cron jobs / setup.py / docs that still invoke
this filename literally. Forwards caller argv (sys.argv[1:]) so flags like
--model and --endpoint-id are not silently stripped.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from add_aggregator_endpoint import main  # noqa: E402

sys.exit(main(["kilo"] + sys.argv[1:]))
