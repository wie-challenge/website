"""Disposable-only fake provider for broker-backed HTTP failure qualification."""

import asyncio
import socket

from nasj_ai.assistant_v1 import worker
from nasj_ai.assistant_v1.providers import FakeProvider


class SyntheticFaults(FakeProvider):
    async def stream(self, request):
        marker = request.chat.messages[-1].content
        if marker == "synthetic-fail-before":
            raise RuntimeError("synthetic")
        if marker == "synthetic-timeout":
            await asyncio.sleep(2)
        if marker in ("synthetic-fail-after", "synthetic-cancel"):
            yield "Synthetic partial reply"
            if marker == "synthetic-cancel":
                await asyncio.sleep(.6)
            raise RuntimeError("synthetic")
        async for fragment in super().stream(request):
            yield fragment


if __name__ == "__main__":
    if socket.gethostname() != "nasj-staging":
        raise SystemExit("Only run this fixture on the disposable NASJ guest")
    worker.make_provider = lambda _: SyntheticFaults()
    worker.main()
