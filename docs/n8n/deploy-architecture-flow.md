# Deploy architecture (app → Supabase → n8n → Hostinger)

**Rendered diagram:** open [`deploy-architecture-flow.html`](./deploy-architecture-flow.html) in your **browser** (double-click the file in your file manager, or right-click → Open with). The `.md` file below keeps the same chart as Mermaid source for GitHub and editors that preview Mermaid.

High-level flow: superadmin configures data in the app (Postgres); **deploy-bot** Edge reads the DB and POSTs a small payload to **n8n**; n8n fetches full **compose YAML** from **deploy-webhook-compose**; n8n POSTs **inline** compose + env text to **Hostinger**’s Docker API.

```mermaid
flowchart TB
  subgraph Users["People"]
    SA["Superadmin user"]
  end

  subgraph App["Web app"]
    UI["Deploy / bot UI\n(stack template, provider API,\ndeployments, env)"]
    Svc["Services / hooks\ncall Edge Functions"]
  end

  subgraph Supabase["Supabase"]
    DB[("Postgres\n- bot_deployments\n- bot_deployment_infra\n- deployment_env\n- deploy_compose_template\n- deploy_provider_settings")]
    EB["Edge: deploy-bot\n(superadmin JWT)\nreads DB, builds payload"]
    EC["Edge: deploy-webhook-compose\n(shared secret in JSON)\nreads template + deployment id"]
    EOther["Other edges\ne.g. deploy-bot-callback,\ndeploy-post-openclaw"]
  end

  subgraph N8N["n8n"]
    WH["Webhook\nreceives JSON from deploy-bot"]
    MAP["Map payload\nbotDeploymentId, env,\ncomposeFetchUrl, provider, infra…"]
    FETCH["HTTP POST\ncomposeFetchUrl\nbody: secret + botDeploymentId"]
    MERGE["Merge composeYaml\ninto item"]
    BUILD["Code: build Hostinger body\nproject_name, content, environment"]
    HAPI["HTTP POST Hostinger\n…/virtual-machines/{id}/docker"]
  end

  subgraph Hostinger["Hostinger VPS API"]
    VPS["Docker project API\nreceives inline YAML + env string"]
    VM[("VM runs stack")]
  end

  SA --> UI
  UI --> DB
  UI --> Svc
  Svc -->|"HTTPS + auth"| EB
  EB --> DB
  EB -->|"POST small JSON\n(composeFetchUrl, env, …)"| WH
  WH --> MAP --> FETCH
  FETCH -->|"HTTPS"| EC
  EC --> DB
  EC -->|"JSON { composeYaml }"| MERGE
  MERGE --> BUILD --> HAPI
  HAPI --> VPS --> VM

  VM -.->|"optional callbacks / post-deploy"| EOther
  EOther -.-> DB
```

For step-by-step n8n nodes and secrets, see [DEPLOY_WORKFLOW.md](./DEPLOY_WORKFLOW.md).
