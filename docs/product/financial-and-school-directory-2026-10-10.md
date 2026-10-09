# Financial truth & source-verified school directory — 2026-10-10

## Financial boundary (product clarification)

Consumer purchases assessment **usage credits** from 九辰教育 as the seller. Payment is collected into the company's legally configured merchant/finance account. It is **not** a direct remittance to an external model/API supplier, and there must be no mechanism in the client that allows a student to trigger an AI provider prepayment.

Ledger separation:
- **A. Commercial cash/order ledger:** merchant receipt, paid amount fen, refunds, invoice / finance reconciliation by company finance. Only independently verified payment notifications can grant purchased assessment credits. Label used in consumer payment description: `小程序AI评估费用`.
- **B. Consumer entitlement ledger:** free grant/paid credit grants, reservations, successful assessment debits, releases. Each successful assessment consumes one application credit regardless of actual model token usage; display remaining *evaluation count* to avoid confusing vendor tokens with a monetary deposit.
- **C. AI supplier prepaid balance and metered usage:** operated and topped-up periodically by company operations, using supplier console and internal cost reporting. Never expose supplier API keys, real token balances or model unit cost to consumer users. A provider's balance shortage cannot be solved by directly charging the consumer within the AI API call.
- **D. Internal reconciliation:** customer cash inflows versus refundable liabilities/credit obligations and model operational expense must be reported separately; prepaid vendor balance is **not** a consumer liability ledger, and cost or margin is **not** calculated as number of evaluations × a guessed cost.

This clarification does not, by itself, classify an evaluation credit for WeChat merchant eligibility. Follow separate 2026 virtual payment policy and official merchant review; ordinary JSAPI purchase route stays blocked pending a compliant adapter and human sign-off. Refund, receipts/invoicing, credit expiry, negative balances and outstanding credit accounting need finance/operator decisions before production rollout.

## School library facts established in GitHub

Earlier `pages/library/library` was a combined product/article search **not** a university directory. This version adds:
- dedicated Opportunity entry and offline mini-program `packages/schools` subpackage;
- exactly 39 Ministry of Education historical 985-construction-list records, Chinese name, city/province, romanized search aliases;
- nine verified C9 members, informative filters (C9 vs other 985) and province search; no duplicated meaningless 985/211/double-first dropdown;
- source-aware detail page with a bold school identity, location, concise school provenance, copyable genuine source URL and richer school-specific intros/verified addresses only when independently sourced;
- school-specific majors/projects left unclaimed rather than fabricated; no invented academy counts, admissions odds, follows, scraped photographic assets or pretend Tencent map.

**Authoritative sources**:
- Education Ministry 985 list (2006): https://www.moe.gov.cn/srcsite/A22/s7065/200612/t20061206_128833.html
- C9 (Beijing Institute of Technology education research): https://cge.bit.edu.cn/sjxx/yjsjyjcpt/ynxx/b150573.htm
- Ministry 2026 national school census/list: https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/202606/t20260618_1441074.html
- Nanjing University official intro: https://www.nju.edu.cn/ndgk/ndjj.htm
- Nanjing University official charter/campus address: https://history.nju.edu.cn/e7/e9/c28610a452585/page.htm
- Peking University official intro: https://www.pku.edu.cn/about.html
- Central South University site: https://www.csu.edu.cn/index.htm

This is an **initial sourced subset**, not a complete 211 university directory, Double-First-Class campus roster, full 2026 Chinese university list or 39 verified per-school programs. In this first release only schools whose `introSource` and `website` are verified display those facts. General presence in Ministry list alone does not justify official campus maps, current department totals or year-specific graduate recruiting assertions.

## Scalability next gate

For full 2026 school list (Ministry reports 3196 institutions incl. adult; non-HK/Macau/Taiwan): implement a dedicated offline import pipeline for Ministry source XLS/XLSX -> strict canonical school IDs with alias reconciliation + annual version + province/city; use compact versioned *paginated* publicly cacheable files from approved CloudBase Storage/CDN, **not** huge all-in-memory arrays on ECS or per-request crawlers. Public institution facts may be cached with dated source provenance; personalized favorites/targets, if later approved, belong to MySQL under authenticated owner identity and cannot be smuggled into a public static file.

For verified per-school detail expansion: school-owned licenses for images and official logos, dated authoritative college/program list, prospective student official postgraduate admissions links, official addresses, optional approved Tencent map SDK/location APIs; do not scrape or reuse another commercial app's proprietary imagery. Avoid unnecessary resident Node workers and new databases. Dataset updates must pass automated name/ID duplicate and citation checks. User device screenshots still require real WeChat Developer Tools and phone pass, CI alone cannot establish visual quality.

## Latest human UI acceptance notes

Repeated internal view/text row centering, full-width white dead space on Home and My, pastel dominance, and overly narrow vertical stage sidebar on Plan were reported with screenshots. This batch replaces nested native button stacks by full-width view rows, visibly higher contrast palette, two-column service access, horizontal semester filter row preserving content width, and removes repeated Profile assessment/identity menu actions. It does not assert a visual PASS absent renewed device screenshots.
