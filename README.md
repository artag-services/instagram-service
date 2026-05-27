# Instagram Service

> Integración con Meta Instagram Graph API — DMs salientes/entrantes vía IGSIDs, con manejo de AI responses.

## Qué hace

Microservicio para mensajería de **Instagram Direct Messages** vía Meta Graph API. Maneja:

1. **Outbound**: envío de DMs a IGSIDs (Instagram Scoped User IDs)
2. **Inbound**: 8 tipos de eventos del webhook de Meta (mensaje, comentario, reacción, seen, referral, optin, handover)
3. **Listing de conversaciones**: expone qué IGSIDs han hablado con tu cuenta Business
4. **AI response handling** con chunking + retry (similar al servicio de WhatsApp)

## Stack

| Pieza | Valor |
|---|---|
| Framework | NestJS 10 |
| Lenguaje | TypeScript 5 |
| DB | PostgreSQL (`instagram_db`) |
| Mensajería | RabbitMQ — exchange `channels` + `@golevelup/nestjs-rabbitmq` |
| Provider externo | Meta Instagram Graph API (v21.0) |
| Puerto | `3004` |

## Routing keys

### Outbound
| Routing key | Descripción |
|---|---|
| `channels.instagram.send` | Enviar DM (texto + opcional `mediaUrl`) |

### Inbound (8 tipos de eventos)
- `channels.instagram.events.message` — DM recibido (resuelve identidad, dispara AI si está habilitado)
- `channels.instagram.events.comment` — comentario en post (stub)
- `channels.instagram.events.reaction` — reacción a story/post (stub)
- `channels.instagram.events.seen` — mensaje/story visto (stub)
- `channels.instagram.events.referral` — click en referral link (stub)
- `channels.instagram.events.optin` — usuario habilita DMs (stub)
- `channels.instagram.events.handover` — handover de control (stub)

### AI response loop (igual que WhatsApp)
- `channels.instagram.ai-response` — AI respondió, mandar al usuario en chunks
- `channels.instagram.ai-response-chunk-failed` — retry
- `channels.instagram.ai-response-dlq` — fallo definitivo

## Payload típico — enviar DM

```json
{
  "messageId": "uuid-from-gateway",
  "recipients": ["17841472713425441"],
  "message": "Hola desde el sistema",
  "mediaUrl": "https://example.com/imagen.jpg"
}
```

`recipients` son **IGSIDs**: identificadores numéricos largos (no usernames `@fulano`). Los obtenés de webhooks o del endpoint de conversations.

## Endpoints HTTP (vía gateway) — Instagram tiene rutas dedicadas además de la genérica

| Método | Path | Patrón |
|---|---|---|
| GET | `/api/v1/messages/instagram/conversations` | Lista IGSIDs con los que tu cuenta ha hablado |
| POST | `/api/v1/messages/instagram/:igsid` | Atajo para enviar DM a un IGSID específico |
| POST | `/api/v1/messages/send` con `channel: "instagram"` | Genérico (igual que otros canales) |

Ver [../docs/api/channels/instagram.md](../docs/api/channels/instagram.md).

## Configuración (`.env`)

```env
INSTAGRAM_PORT=3004
INSTAGRAM_DATABASE_URL=postgresql://postgres:postgres123@postgres:5432/instagram_db
RABBITMQ_URL=...

INSTAGRAM_PAGE_TOKEN=IGAA...                       # token Bearer (formato User/App)
INSTAGRAM_PAGE_ID=970925329432465
INSTAGRAM_BUSINESS_ACCOUNT_ID=17841472713425441    # para fetch de conversaciones
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=...
INSTAGRAM_API_VERSION=v25.0
```

## ⚠️ Limitaciones de la plataforma

- **Solo respondés**: no podés iniciar conversaciones. Meta solo te permite mandar DM a IGSIDs que te hayan escrito primero.
- **IGSIDs son scoped por App**: el mismo humano tiene IGSIDs distintos en diferentes apps. Si cambiás de app, los IGSIDs viejos dejan de servir.
- **Token expirable**: el `INSTAGRAM_PAGE_TOKEN` se renueva (con flow de refresh) — manejá la rotación.

## Cómo correrlo

```bash
docker-compose up -d instagram
```

Dev local:
```bash
cd instagram
pnpm install
pnpm prisma:generate
pnpm start:dev
```

## Ver también

- **[../docs/api/channels/instagram.md](../docs/api/channels/instagram.md)** — API reference (incluye los endpoints dedicados)
- **[../AGENTS.md](../AGENTS.md)** — flujos generales
