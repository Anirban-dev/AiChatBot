# AiCalls/litellm_config.py
import os

LITELLM_ROUTER_CONFIG = {
    "model_list": [
        # ----------------------------------------------------------------------
        # 1. SUMMARY LLM
        # ----------------------------------------------------------------------
        # --- GROQ POOL ---
        {"model_name": "summaryllm", "litellm_params": {"model": "groq/llama-3.1-8b-instant", "api_key": os.getenv("GROQ_API_KEY")}},
        
        # --- OPENROUTER POOL ---
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/openai/gpt-oss-120b", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/deepseek/deepseek-v4-flash:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/qwen/qwen3-32b", "api_key": os.getenv("OPENROUTER_API_KEY")}},


        # ----------------------------------------------------------------------
        # 2. LOW LLM (Standard Conversational Tier)
        # ----------------------------------------------------------------------
        # --- GROQ POOL ---
        {"model_name": "lowllm", "litellm_params": {"model": "groq/llama-3.1-8b-instant", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "lowllm", "litellm_params": {"model": "groq/llama-3.3-70b-versatile", "api_key": os.getenv("GROQ_API_KEY")}},

        # --- SAMBANOVA POOL ---
        {"model_name": "lowllm", "litellm_params": {"model": "sambanova/Meta-Llama-3.3-70B-Instruct", "api_key": os.getenv("SAMBANOVA_API_KEY")}},

        # --- OPENROUTER POOL ---
        # {"model_name": "lowllm", "litellm_params": {"model": "openrouter/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B", "api_key": os.getenv("OPENROUTER_API_KEY")}},


        # ----------------------------------------------------------------------
        # 3. HIGH LLM / THINKING LLM (Deep Reasoning Tier)
        # ----------------------------------------------------------------------
        # --- SAMBANOVA POOL (Confirmed Working in logs) ---
        {"model_name": "highllm", "litellm_params": {"model": "sambanova/DeepSeek-V3.1", "api_key": os.getenv("SAMBANOVA_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "sambanova/Meta-Llama-3.3-70B-Instruct", "api_key": os.getenv("SAMBANOVA_API_KEY")}},

        # --- GROQ POOL (Confirmed Working in logs) ---
        {"model_name": "highllm", "litellm_params": {"model": "groq/llama-3.3-70b-versatile", "api_key": os.getenv("GROQ_API_KEY")}},
        
        # --- DEEPINFRA POOL ---
        {"model_name": "highllm", "litellm_params": {"model": "deepinfra/deepseek-ai/DeepSeek-R1", "api_key": os.getenv("DEEPINFRA_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "deepinfra/meta-llama/Llama-3.3-70B-Instruct", "api_key": os.getenv("DEEPINFRA_API_KEY")}},

        # --- OPENROUTER POOL ---
        {"model_name": "highllm", "litellm_params": {"model": "openrouter/deepseek/deepseek-v4-flash:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},


        # ----------------------------------------------------------------------
        # 4. VISION LLM (Image Processing)
        # ----------------------------------------------------------------------
        {"model_name": "visionllm", "litellm_params": {"model": "deepinfra/meta-llama/Llama-3.2-90B-Vision-Instruct", "api_key": os.getenv("DEEPINFRA_API_KEY")}},


        # ----------------------------------------------------------------------
        # 5. SPEECH LLM (Audio Transcriptions)
        # ----------------------------------------------------------------------
        {"model_name": "speechllm", "litellm_params": {"model": "groq/llama-3.1-8b-instant", "api_key": os.getenv("GROQ_API_KEY")}},


        # ----------------------------------------------------------------------
        # 6. GEOMETRY EMBEDDINGS
        # ----------------------------------------------------------------------
        {"model_name": "free-embed", "litellm_params": {"model": "deepinfra/Qwen/Qwen3-Embedding-4B", "api_key": os.getenv("DEEPINFRA_API_KEY")}},
    ],
    "routing_strategy": "simple-shuffle",
    "allowed_fails": 1
}