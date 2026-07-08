# jc-proxy

A lightweight OpenAI & Anthropic compatible API gateway with intelligent provider routing, automatic failover, tool calling support, and streaming. Specifically optimized for n8n AI Agents and Claude Code.

## Features

- **OpenAI-Compatible Endpoint:** `/v1/chat/completions`
- **Anthropic-Compatible Endpoint:** `/v1/messages` (enables seamless use with tools like Claude Code)
- **Multi-Provider Support:** Groq, Gemini, OpenRouter, Cloudflare Workers AI, and any OpenAI-compatible backend (e.g. Ollama/vLLM)
- **Intelligent Routing & Failover:** Automatically switches to fallback models when a provider rate-limits (429) or fails
- **Admin Dashboard:** Access config management, provider statuses, and routing logs in real-time
- **Streaming & Tool Calling:** Full support for real-time text output generation and function calling
- **Docker Deployment:** Ready-to-go environment with built-in SearXNG search integration

### Why jc-proxy?

I built `jc-proxy` out of personal necessity. As someone deeply enthusiastic about AI agents (like `n8n` and `Hermes`), I spent a lot of time exploring free LLM tiers—Google, OpenRouter, Groq, Vercel, and more. 

The major hurdle? **Rate limits.** 

While paid services like OpenRouter are great for production, they can be costly for hobbyists and students just starting their journey. I looked for existing API proxies, but most were either overly complex (designed for startups and large-scale enterprise use) or difficult to deploy as a solo user. 

I wanted a simple, lightweight API proxy that:
*   **Handles automatic failover:** So when one free-tier provider hits a rate limit, the gateway seamlessly switches to the next one without breaking my agent workflow.
*   **Supports Claude Code:** It needed to be compatible with tools like Claude Code right out of the box.
*   **Is easy to run:** Designed for individuals, hobbyists, and students—no Kubernetes or complex infrastructure required.

`jc-proxy` started as a personal project to solve my own rate-limiting frustrations, and it’s now a stable part of my daily automation stack. I’m open-sourcing it in the hope that it helps other students and AI hobbyists keep building without the "rate limit" headache.

---

## Getting Started

### 1. Installation

```bash
npm install
npm run dev
```

On the first launch, the gateway will automatically copy `config/config.example.yaml` to `config/config.yaml`.

### 2. Docker Setup

To run jcXproxy with a bundled SearXNG local search instance:
```bash
docker compose up -d
```
This mounts the `./config` directory to the container. If `config/config.yaml` is missing, it will be automatically created inside the directory.

---

## Configuration

All configuration is done in `config/config.yaml` (which is ignored by Git to keep your credentials secure). 

Example configuration template structure:

```yaml
listen:
  port: 3000
  host: 0.0.0.0

security:
  apiKeys:
    - key: sk-your-app-api-key-1
      allowedModels: []
  adminKey: your_admin_dashboard_password_here

routing:
  mode: priority # priority | round-robin | random
  providers:
    - id: 'gemini-primary'
      type: gemini
      apiKey: AIzaSy_YOUR_GEMINI_API_KEY_HERE
    - id: 'groq-backup'
      type: groq
      apiKey: gsk_YOUR_GROQ_API_KEY_HERE

webSearch:
  tavilyApiKey: tvly_YOUR_TAVILY_API_KEY_HERE
  searxngUrl: http://searxng:8080

claudeCode:
  enabled: true
  target: gemini-3.1-flash-lite-preview
  fallbacks:
    - gemini-2.5-flash
```

---

## Admin Dashboard

Once running, navigate to `http://localhost:3000/admin` in your browser. 
- Authenticate using the `security.adminKey` defined in your configuration.
- Manage provider API keys, fallback chains, and model aliases in real-time.
- View detailed routing logs, status codes, and latency metrics.

---

## Supported Clients

- **n8n AI Agent**
- **Claude Code** (Configure to point to the gateway's Anthropic endpoint)
- **Hermes Agent**
- **LangChain** / **LlamaIndex**
- **OpenAI / Anthropic SDKs**
- **Cline** / **Roo Code** / **Continue**

---

## ⚠️ Security Note
This proxy acts as a gateway for your private API keys. **Never expose this gateway to the public internet** without proper authentication. Always change the default `adminKey`, use strong API keys, and run behind a firewall or VPN if possible.

---

## Contributing
I welcome contributions! If you have a fix or a new provider idea, please open an issue first, then submit a PR. Please ensure `npm test` passes before submitting.

---

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

- **Claude Code** (Configure to point to the gateway's Anthropic endpoint)
- **Hermes Agent**
- **LangChain** / **LlamaIndex**
- **OpenAI / Anthropic SDKs**

- **Cline** / **Roo Code** / **Continue**

---

## API Endpoints

- `GET /health` - Health and provider status check
- `GET /v1/models` - List all resolved and configured models
- `POST /v1/chat/completions` - OpenAI chat completions
- `POST /v1/messages` - Anthropic messages endpoint
