# AiCalls/litellm_config.py
import os

LITELLM_ROUTER_MODELS = {
    "model_list": [
        # ----------------------------------------------------------------------
        # 1. SMALL LLM (Standard Conversational Tier - Fast & Reliable)
        # ----------------------------------------------------------------------
        {"model_name": "small", "litellm_params": {"model": "openai/ai/gemma4:E2B", "api_base": "http://localhost:12434/v1", "api_key": "not-needed"}},
        {"model_name": "small", "litellm_params": {"model": "openai/gemma3:12b", "api_base": "https://11434-01kj2f7bpvc2nx7szdgh908j3d.cloudspaces.litng.ai/v1", "api_key": os.getenv("LIGHTNING_API_KEY")}},
        # --- Groq ---
        {"model_name": "small", "litellm_params": {"model": "groq/llama-3.1-8b-instant", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "small", "litellm_params": {"model": "groq/groq/compound-mini", "api_key": os.getenv("GROQ_API_KEY")}},
        
        # --- OpenRouter ---
        {"model_name": "small", "litellm_params": {"model": "openrouter/google/gemma-4-26b-a4b-it:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "small", "litellm_params": {"model": "openrouter/openrouter/free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        
        # --- HuggingFace ---
        {"model_name": "small", "litellm_params": {"model": "huggingface/Qwen/Qwen2.5-7B-Instruct", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},
        {"model_name": "small", "litellm_params": {"model": "huggingface/meta-llama/Llama-3.1-8B-Instruct", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},
        {"model_name": "small", "litellm_params": {"model": "huggingface/deepseek-ai/DeepSeek-V4-Flash", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},

        # ----------------------------------------------------------------------
        # 2. LARGE LLM (High Parameter Dense/MoE Conversational Models Tier)
        # ----------------------------------------------------------------------
        # --- Groq ---
        {"model_name": "large", "litellm_params": {"model": "groq/llama-3.3-70b-versatile", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "groq/openai/gpt-oss-120b", "api_key": os.getenv("GROQ_API_KEY")}},
        
        # --- OpenRouter ---
        {"model_name": "large", "litellm_params": {"model": "openrouter/google/gemma-4-31b-it:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "openrouter/z-ai/glm-4.5-air:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        
        # --- HuggingFace ---
        {"model_name": "large", "litellm_params": {"model": "huggingface/Qwen/Qwen3.5-122B-A10B", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "huggingface/meta-llama/Llama-3.3-70B-Instruct", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},
        {"model_name": "large", "litellm_params": {"model": "huggingface/zai-org/GLM-5.1", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},

        # ----------------------------------------------------------------------
        # 3. THINKING LLM (Strict Native Reasoning & Long Thought Chain Models)
        # ----------------------------------------------------------------------
        # --- OpenRouter ---
        {"model_name": "thinking", "litellm_params": {"model": "openrouter/arcee-ai/trinity-large-thinking:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "thinking", "litellm_params": {"model": "huggingface/deepseek-ai/DeepSeek-V4-Pro", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},
        {"model_name": "thinking", "litellm_params": {"model": "huggingface/moonshotai/Kimi-K2.6", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},

        # ----------------------------------------------------------------------
        # 4. CRITIQ LLM (Multi-Agent Orchestration Root Entry Points)
        # ----------------------------------------------------------------------
        {"model_name": "critiq", "litellm_params": {"model": "groq/llama-3.3-70b-versatile", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "critiq", "litellm_params": {"model": "huggingface/deepseek-ai/DeepSeek-V4-Pro", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},

        # ----------------------------------------------------------------------
        # 5. SUMMARY LLM (Fast, cost-effective/free models for summaries)
        # ----------------------------------------------------------------------
        {"model_name": "summaryllm", "litellm_params": {"model": "groq/llama-3.1-8b-instant", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/google/gemma-4-26b-a4b-it:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "huggingface/meta-llama/Llama-3.2-1B-Instruct", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/openrouter/free", "api_key": os.getenv("OPENROUTER_API_KEY")}},

        # ----------------------------------------------------------------------
        # 6. VISION LLM (Image & Agentic Processing capabilities)
        # ----------------------------------------------------------------------
        {"model_name": "visionllm", "litellm_params": {"model": "openai/qwen3-vl:2B-UD-Q4_K_XL", "api_base": "http://localhost:12434/", "api_key": "not-needed"}},
        {"model_name": "visionllm", "litellm_params": {"model": "openai/gemma3:12b", "api_base": "https://11434-01kj2f7bpvc2nx7szdgh908j3d.cloudspaces.litng.ai/v1", "api_key": os.getenv("LIGHTNING_API_KEY")}},
        {"model_name": "visionllm", "litellm_params": {"model": "groq/meta-llama/llama-4-scout-17b-16e-instruct", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "visionllm", "litellm_params": {"model": "openrouter/openrouter/free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "visionllm", "litellm_params": {"model": "huggingface/google/gemma-4-26B-A4B-it", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},

        # ----------------------------------------------------------------------
        # 7. SPEECH LLM / AUDIO TRANSCRIPTION (Whisper Models & Audio fallbacks)
        # ----------------------------------------------------------------------
        {"model_name": "speechllm", "litellm_params": {"model": "openai/gemma3:12b", "api_base": "https://11434-01kj2f7bpvc2nx7szdgh908j3d.cloudspaces.litng.ai/v1", "api_key": os.getenv("LIGHTNING_API_KEY")}},
        {"model_name": "speechllm", "litellm_params": {"model": "groq/whisper-large-v3-turbo", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "speechllm", "litellm_params": {"model": "groq/whisper-large-v3", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "speechllm", "litellm_params": {"model": "groq/llama-3.1-8b-instant", "api_key": os.getenv("GROQ_API_KEY")}},

        # ----------------------------------------------------------------------
        # 8. CODER LLM (Optional specialized tier for development/code tasks)
        # ----------------------------------------------------------------------
        {"model_name": "coderllm", "litellm_params": {"model": "huggingface/Qwen/Qwen3-Coder-Next", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},
        {"model_name": "coderllm", "litellm_params": {"model": "huggingface/Qwen/Qwen3-Coder-30B-A3B-Instruct", "api_key": os.getenv("HUGGINGFACE_API_KEY")}},
    ],
    "routing_strategy": "simple-shuffle",
    "allowed_fails": 3
}