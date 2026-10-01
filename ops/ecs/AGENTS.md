# AGENTS.md — Jiuchen ECS production guardrails

This file is intended to live at `/opt/jiuchen-api/AGENTS.md` and governs any Codex/AI terminal work on the shared Alibaba Cloud ECS.

## Prime directive

The ECS already hosts production company assets. Preserve existing services first. Jiuchen API work must be isolated, reversible, observable, and limited to its own runtime.

## Allowed working area

By default, write only under:
- `/opt/jiuchen-api/**`

Read-only inspection is allowed when needed for diagnosis.

The only application service this agent may manage is:
- `jiuchen-api.service`

Creating or replacing that unit requires an explicit deployment task. All other systemd units are read-only.

## Protected production assets — DO NOT MODIFY

Never modify, stop, restart, delete, reconfigure, join networks, or prune:
- Nginx Proxy Manager / `nginx-app`;
- Harbor;
- Portainer;
- Docker daemon or Docker networks;
- the existing `jiuchenedu.com` Proxy Host;
- host nginx website configuration;
- host website listener `:8088`;
- `/www/wwwroot/jiuchen-current/**`;
- existing listeners on `:80` or `:443`.

Do not bind Jiuchen API directly to 80/443/8088. Its private application port is 3100 unless the human explicitly approves a change.

## Forbidden host-level actions without explicit human approval

Do not run or perform:
- `rm -rf` on broad/system paths;
- `docker system prune`, image/container/network pruning, or destructive Docker cleanup;
- firewall / iptables / nftables changes;
- Alibaba Cloud security-group changes;
- reboot, shutdown, kernel/sysctl changes;
- SSH/user/authorized_keys changes;
- global Node/npm replacement;
- system Python upgrade/removal;
- `npm install -g`;
- `curl ... | bash` or equivalent remote-script execution;
- package-manager upgrades of unrelated system packages;
- changes to DNS or Nginx Proxy Manager unless the human explicitly assigns that step.

## Secrets

Never print or echo secret values. This includes:
- database credentials;
- Tencent CAM SecretId/SecretKey;
- WeChat secrets;
- AI API keys;
- SSH keys/passphrases.

Environment files must be root-readable only (`chmod 600`). Diagnostics may show key names, boolean presence, or redacted values only.

## Database safety

Default database operations are read-only health/diagnostic queries.

Never:
- drop/truncate tables;
- mass update/delete production rows;
- run schema migrations against production;
- import bulk production data;

unless the human explicitly approves the exact migration/action after a dry-run or reviewed plan.

## Deployment contract

Production layout should use immutable releases:

```text
/opt/jiuchen-api/
  AGENTS.md
  releases/<commit>/
  current -> releases/<commit>
  shared/
```

Deployment sequence:
1. preflight existing website/NPM/API state;
2. create a new release directory; never mutate the previous release in place;
3. install/build/test inside the new release;
4. verify env-file permissions without printing values;
5. start/check the candidate on the Jiuchen API port;
6. only after success, switch `current`;
7. restart only `jiuchen-api.service`;
8. verify `/health/live` and `/health`;
9. keep the previous release for immediate rollback.

If any post-switch health check fails, roll back to the prior release and report.

## Resource boundaries

Unless explicitly changed by the human:
- `MemoryMax=256M`
- `CPUQuota=50%`
- Node heap about 160–192 MiB
- application bind: private host interface, port 3100

Do not relax limits merely to hide a leak or failure.

## Change discipline

Before every write operation:
- state what will change;
- keep the change scoped to Jiuchen API;
- prefer reversible commands;
- avoid chaining unrelated destructive commands.

If a command's effect on the shared host is uncertain, stop and report instead of experimenting.

## Handoff

At the end of a server task report:
- commands/actions performed;
- files/unit changed;
- active release commit;
- health results;
- resource status;
- rollback target;
- unresolved risks.

Never report a migration as complete until HTTPS, WeChat legal-domain configuration, and real mini-program acceptance testing are finished.
