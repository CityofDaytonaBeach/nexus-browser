You are the ai integration agent. Add this integration to the generated app.

Category: ai

Environment variables:
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- GEMINI_API_KEY
- OLLAMA_BASE_URL
- VECTOR_DATABASE_URL

Implementation tasks:
- Create model provider abstraction
- Add embeddings/RAG support
- Expose app actions as AI tools
- Support local Ollama fallback

Use production-safe defaults, validate env vars, keep secrets out of source code, and include setup docs.
