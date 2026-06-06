import os

DOCKER_RUNNER_BASE = "http://localhost:12434/v1"

LITELLM_ROUTER_MODELS = {
    "model_list": [
        # ----------------------------------------------------------------------
        # 1. SMALL LLM
        # ----------------------------------------------------------------------
        # --- Local Docker Model Runner ---
        {"model_name": "small", "litellm_params": {
            "model": "ai/qwen3-vl:2B-UD-Q4_K_XL", 
            "custom_llm_provider": "openai", 
            "api_base": DOCKER_RUNNER_BASE,
            "api_key": "not-needed",
            "timeout": 500
        }},
        # --- Lightning Cloud (OpenAI-compatible) ---
        {"model_name": "small", "litellm_params": {
            "model": "openai/gemma3:12b",
            "api_base": "https://11434-01kj2f7bpvc2nx7szdgh908j3d.cloudspaces.litng.ai/v1",
            "api_key": os.getenv("LIGHTNING_API_KEY"),
        }},
        # --- Groq (current valid IDs as of 2025) ---
        # {"model_name": "small", "litellm_params": {"model": "groq/llama-3.1-8b-instant",     "api_key": os.getenv("GROQ_API_KEY")}},
        # {"model_name": "small", "litellm_params": {"model": "groq/qwen/qwen3-32b",            "api_key": os.getenv("GROQ_API_KEY")}},
        # # --- OpenRouter smart free router (auto-picks a working free model) ---
        # {"model_name": "small", "litellm_params": {"model": "openrouter/openrouter/free",     "api_key": os.getenv("OPENROUTER_API_KEY")}},
        # # --- OpenRouter specific free models (confirmed available June 2025) ---
        # {"model_name": "small", "litellm_params": {"model": "openrouter/google/gemma-4-31b-it:free",         "api_key": os.getenv("OPENROUTER_API_KEY")}},
        # {"model_name": "small", "litellm_params": {"model": "openrouter/nvidia/nemotron-3-nano-30b-a3b:free","api_key": os.getenv("OPENROUTER_API_KEY")}},
        # # --- HuggingFace ---
        # {"model_name": "small", "litellm_params": {"model": "huggingface/Qwen/Qwen2.5-7B-Instruct",         "api_key": os.getenv("HUGGINGFACE_API_KEY")}},

        # ----------------------------------------------------------------------
        # 2. LARGE LLM
        # ----------------------------------------------------------------------
        # --- Groq ---
        {"model_name": "large", "litellm_params": {"model": "groq/llama-3.3-70b-versatile",                          "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "groq/meta-llama/llama-4-maverick-17b-128e-instruct",    "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "groq/moonshotai/kimi-k2-instruct",                      "api_key": os.getenv("GROQ_API_KEY")}},
        # --- OpenRouter (confirmed free June 2025) ---
        {"model_name": "large", "litellm_params": {"model": "openrouter/openai/gpt-oss-120b:free",  "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "openrouter/qwen/qwen3-235b-a22b:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "openrouter/nvidia/nemotron-3-super-120b-a12b:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},

        # ----------------------------------------------------------------------
        # 3. THINKING LLM
        # ----------------------------------------------------------------------
        {"model_name": "thinking", "litellm_params": {"model": "openrouter/deepseek/deepseek-r1:free",      "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "thinking", "litellm_params": {"model": "openrouter/deepseek/deepseek-r1-0528:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "thinking", "litellm_params": {"model": "groq/qwen/qwen3-32b",                       "api_key": os.getenv("GROQ_API_KEY")}},

        # ----------------------------------------------------------------------
        # 4. CRITIQ LLM
        # ----------------------------------------------------------------------
        {"model_name": "critiq", "litellm_params": {"model": "groq/llama-3.3-70b-versatile",             "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "critiq", "litellm_params": {"model": "openrouter/openai/gpt-oss-120b:free",       "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "critiq", "litellm_params": {"model": "openrouter/qwen/qwen3-235b-a22b:free",      "api_key": os.getenv("OPENROUTER_API_KEY")}},

        # ----------------------------------------------------------------------
        # 5. SUMMARY LLM
        # ----------------------------------------------------------------------
        {"model_name": "summaryllm", "litellm_params": {"model": "groq/llama-3.1-8b-instant",                       "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "groq/qwen/qwen3-32b",                             "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/google/gemma-4-31b-it:free",           "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/nvidia/nemotron-3-nano-30b-a3b:free",  "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "huggingface/Qwen/Qwen2.5-7B-Instruct",           "api_key": os.getenv("HUGGINGFACE_API_KEY")}},

        # ----------------------------------------------------------------------
        # 6. VISION LLM
        # ----------------------------------------------------------------------
        # --- Local Docker Model Runner (your confirmed working model) ---
        {"model_name": "visionllm", "litellm_params": {
            "model": "ai/qwen3-vl:2B-UD-Q4_K_XL", 
            "custom_llm_provider": "openai", 
            "api_base": DOCKER_RUNNER_BASE,
            "api_key": "not-needed",
            "timeout": 500
        }},
        # --- Lightning Cloud fallback ---
        {"model_name": "visionllm", "litellm_params": {
            "model": "openai/gemma3:12b",
            "api_base": "https://11434-01kj2f7bpvc2nx7szdgh908j3d.cloudspaces.litng.ai/v1",
            "api_key": os.getenv("LIGHTNING_API_KEY"),
        }},
        # --- Groq (vision-capable, correct full model ID) ---
        # {"model_name": "visionllm", "litellm_params": {"model": "groq/meta-llama/llama-4-scout-17b-16e-instruct",  "api_key": os.getenv("GROQ_API_KEY")}},
        # --- OpenRouter (vision-capable free model, confirmed June 2025) ---
        # {"model_name": "visionllm", "litellm_params": {"model": "openrouter/google/gemma-4-31b-it:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},

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