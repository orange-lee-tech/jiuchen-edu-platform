# API import fix release candidate — 2026-10-07

Production base: `5fc3dd15e48435df242734cc506b25155e7e7020`

Scope:
- remove guessed Tencent MultimodalDocParse PageRange after production returned InternalError while API Explorer succeeded with a valid short range;
- preserve Tencent RequestId in server diagnostics for future OCR triage;
- classify Tencent InternalError separately;
- include the approved pre-junior-summer holiday rule: English + competition.

No schema writes. No News, Payment or UI Blueprint changes.
