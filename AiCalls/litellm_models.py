import os

LITELLM_ROUTER_MODELS = {
    "model_list": [
        # ----------------------------------------------------------------------
        # 1. SMALL LLM
        # ----------------------------------------------------------------------
        # --- Lightning Cloud (OpenAI-compatible) ---
        {"model_name": "small", "litellm_params": {"model": "openai/gemma4:latest", "api_base": "https://11434-01kj2f7bpvc2nx7szdgh908j3d.cloudspaces.litng.ai/v1", "api_key": os.getenv("LIGHTNING_API_KEY"),}},
        # --- Groq (current valid IDs as of 2025) ---
        {"model_name": "small", "litellm_params": {"model": "groq/llama-3.1-8b-instant",     "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "small", "litellm_params": {"model": "groq/qwen/qwen3-32b",            "api_key": os.getenv("GROQ_API_KEY")}},
        # # --- OpenRouter smart free router ---
        {"model_name": "small", "litellm_params": {"model": "openrouter/openrouter/free",     "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "small", "litellm_params": {"model": "openrouter/liquid/lfm-2.5-1.2b-instruct:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "small", "litellm_params": {"model": "openrouter/liquid/lfm-2.5-1.2b-thinking:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "small", "litellm_params": {"model": "openrouter/tencent/hy3:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        
        {"model_name": "small", "litellm_params": {"model": "openrouter/openai/gpt-oss-20b:free",         "api_key": os.getenv("OPENROUTER_API_KEY")}},
        # # --- HuggingFace ---
        {"model_name": "small", "litellm_params": {"model": "huggingface/Qwen/Qwen2.5-7B-Instruct",         "api_key": os.getenv("HUGGINGFACE_API_KEY")}},

        # ----------------------------------------------------------------------
        # 2. LARGE LLM
        # ----------------------------------------------------------------------
        # --- Lightning Cloud (OpenAI-compatible) ---
        {"model_name": "small", "litellm_params": {"model": "openai/gemma4:26b", "api_base": "https://11434-01kj2f7bpvc2nx7szdgh908j3d.cloudspaces.litng.ai/v1", "api_key": os.getenv("LIGHTNING_API_KEY"),}},
        # --- Groq ---
        {"model_name": "large", "litellm_params": {"model": "groq/llama-3.3-70b-versatile",                          "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "groq/meta-llama/llama-4-maverick-17b-128e-instruct",    "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "groq/moonshotai/kimi-k2-instruct",                      "api_key": os.getenv("GROQ_API_KEY")}},
        # --- OpenRouter (confirmed free June 2025) ---
        {"model_name": "large", "litellm_params": {"model": "openrouter/google/gemma-4-31b-it:free",  "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "openrouter/openrouter/free",  "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "openrouter/cohere/north-mini-code:free",  "api_key": os.getenv("OPENROUTER_API_KEY")}},
        

        # ----------------------------------------------------------------------
        # 3. THINKING LLM
        # ----------------------------------------------------------------------
        {"model_name": "thinking", "litellm_params": {"model": "groq/qwen/qwen3-32b",           "api_key": os.getenv("GROQ_API_KEY")}},

        # ----------------------------------------------------------------------
        # 4. CRITIQ LLM
        # ----------------------------------------------------------------------
        {"model_name": "critiq", "litellm_params": {"model": "openrouter/google/gemma-4-26b-a4b-it:free",      "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "critiq", "litellm_params": {"model": "openrouter/google/gemma-4-31b-it:free",      "api_key": os.getenv("OPENROUTER_API_KEY")}},

        # ----------------------------------------------------------------------
        # 5. SUMMARY LLM
        # ----------------------------------------------------------------------
        {"model_name": "summaryllm", "litellm_params": {"model": "groq/llama-3.1-8b-instant",                       "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "groq/qwen/qwen3-32b",                             "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "huggingface/Qwen/Qwen2.5-7B-Instruct",           "api_key": os.getenv("HUGGINGFACE_API_KEY")}},

        # ----------------------------------------------------------------------
        # 6. VISION LLM
        # ----------------------------------------------------------------------
        {"model_name": "visionllm", "litellm_params": {"model": "groq/meta-llama/llama-4-scout-17b-16e-instruct",  "api_key": os.getenv("GROQ_API_KEY")}},
        # --- Lightning Cloud fallback ---
        {"model_name": "visionllm", "litellm_params": {
            "model": "openai/gemma4:latest",
            "api_base": "https://11434-01kj2f7bpvc2nx7szdgh908j3d.cloudspaces.litng.ai/v1",
            "api_key": os.getenv("LIGHTNING_API_KEY"),
        }},
        # --- OpenRouter (vision-capable free model, confirmed June 2025) ---
        {"model_name": "visionllm", "litellm_params": {"model": "openrouter/google/gemma-4-31b-it:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},

        # ----------------------------------------------------------------------
        # 7. SPEECH LLM
        # ----------------------------------------------------------------------
        {"model_name": "speechllm", "litellm_params": {"model": "groq/whisper-large-v3-turbo", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "speechllm", "litellm_params": {"model": "groq/whisper-large-v3",       "api_key": os.getenv("GROQ_API_KEY")}},

        # ----------------------------------------------------------------------
        # 8. EMBEDDING
        # ----------------------------------------------------------------------
        {"model_name": "free-embed", "litellm_params": {"model": "huggingface/sentence-transformers/all-MiniLM-L6-v2", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},
        {"model_name": "free-embed", "litellm_params": {"model": "openai/text-embedding-3-small", "api_key": os.getenv("OPENAI_API_KEY", "not-needed")}},
    ],

    # --------------------------------------------------------------------------
    # ROUTING BEHAVIOR
    # --------------------------------------------------------------------------
    "routing_strategy": "latency-based-routing",
    "num_retries": 3,
    "allowed_fails": 2,
    "cooldown_time": 60,
}