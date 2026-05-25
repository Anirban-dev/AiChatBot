import os
from litellm import Router

LITELLM_ROUTER_CONFIG = {
    "model_list": [
        # ----------------------------------------------------------------------
        # 1. SUMMARY LLM (Highly compact, fast processing, low footprint models)
        # ----------------------------------------------------------------------
        # --- GROQ POOL ---
        {"model_name": "summaryllm", "litellm_params": {"model": "groq/llama3-8b-8192", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "groq/gemma2-9b-it", "api_key": os.getenv("GROQ_API_KEY")}},
        
        # --- TOGETHER AI POOL ---
        {"model_name": "summaryllm", "litellm_params": {"model": "together_ai/meta-llama/Llama-3.2-3B-Instruct", "api_key": os.getenv("TOGETHER_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "together_ai/meta-llama/Meta-Llama-3-8B-Instruct-Lite", "api_key": os.getenv("TOGETHER_API_KEY")}},
        
        # --- OPENROUTER POOL ---
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/google/gemma-2-9b-it:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/meta-llama/llama-3-8b-instruct:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "openrouter/qwen/qwen-2.5-7b-instruct:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},

        # --- HUGGING FACE POOL ---
        {"model_name": "summaryllm", "litellm_params": {"model": "huggingface/meta-llama/Llama-3.2-3B-Instruct", "api_key": os.getenv("HF_TOKEN")}},
        {"model_name": "summaryllm", "litellm_params": {"model": "huggingface/google/gemma-2-2b-it", "api_key": os.getenv("HF_TOKEN")}},


        # ----------------------------------------------------------------------
        # 2. LOW LLM (Standard Conversational Tier - Maximum Model Variety)
        # ----------------------------------------------------------------------
        # --- SAMBANOVA POOL ---
        {"model_name": "lowllm", "litellm_params": {"model": "sambanova/Meta-Llama-3.1-8B-Instruct", "api_key": os.getenv("SAMBANOVA_API_KEY")}},
        {"model_name": "lowllm", "litellm_params": {"model": "sambanova/Meta-Llama-3.2-3B-Instruct", "api_key": os.getenv("SAMBANOVA_API_KEY")}},
        {"model_name": "lowllm", "litellm_params": {"model": "sambanova/Meta-Llama-3.2-1B-Instruct", "api_key": os.getenv("SAMBANOVA_API_KEY")}},

        # --- GROQ POOL ---
        {"model_name": "lowllm", "litellm_params": {"model": "groq/llama-3.3-70b-specdec", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "lowllm", "litellm_params": {"model": "groq/llama3-8b-8192", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "lowllm", "litellm_params": {"model": "groq/gemma2-9b-it", "api_key": os.getenv("GROQ_API_KEY")}},

        # --- TOGETHER AI POOL ---
        {"model_name": "lowllm", "litellm_params": {"model": "together_ai/meta-llama/Llama-3.3-Nemotron-Super-49B-V1.5", "api_key": os.getenv("TOGETHER_API_KEY")}},
        {"model_name": "lowllm", "litellm_params": {"model": "together_ai/meta-llama/Llama-3.2-3B-Instruct", "api_key": os.getenv("TOGETHER_API_KEY")}},

        # --- OPENROUTER POOL ---
        {"model_name": "lowllm", "litellm_params": {"model": "openrouter/meta-llama/llama-3.1-8b-instruct:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "lowllm", "litellm_params": {"model": "openrouter/microsoft/phi-3-medium-128k-instruct:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},


        # ----------------------------------------------------------------------
        # 3. HIGH LLM / THINKING LLM (Deep Reasoning / Complex Coding Tasks)
        # ----------------------------------------------------------------------
        # --- SAMBANOVA POOL ---
        {"model_name": "highllm", "litellm_params": {"model": "sambanova/DeepSeek-R1", "api_key": os.getenv("SAMBANOVA_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "sambanova/DeepSeek-V3.1", "api_key": os.getenv("SAMBANOVA_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "sambanova/Meta-Llama-3.3-70B-Instruct", "api_key": os.getenv("SAMBANOVA_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "sambanova/Qwen3-32B", "api_key": os.getenv("SAMBANOVA_API_KEY")}},

        # --- GROQ POOL ---
        {"model_name": "highllm", "litellm_params": {"model": "groq/deepseek-r1-distill-llama-70b", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "groq/llama-3.3-70b-versatile", "api_key": os.getenv("GROQ_API_KEY")}},

        # --- DEEPINFRA POOL ---
        {"model_name": "highllm", "litellm_params": {"model": "deepinfra/deepseek-ai/DeepSeek-R1", "api_key": os.getenv("DEEPINFRA_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "deepinfra/deepseek-ai/DeepSeek-R1-Distill-Llama-70B", "api_key": os.getenv("DEEPINFRA_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "deepinfra/meta-llama/Llama-3.3-70B-Instruct", "api_key": os.getenv("DEEPINFRA_API_KEY")}},

        # --- TOGETHER AI POOL ---
        {"model_name": "highllm", "litellm_params": {"model": "together_ai/deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free", "api_key": os.getenv("TOGETHER_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", "api_key": os.getenv("TOGETHER_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "together_ai/deepseek-ai/R1-Distill-Qwen-7B", "api_key": os.getenv("TOGETHER_API_KEY")}},

        # --- OPENROUTER POOL ---
        {"model_name": "highllm", "litellm_params": {"model": "openrouter/deepseek/deepseek-v4-flash:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},
        {"model_name": "highllm", "litellm_params": {"model": "openrouter/meta-llama/llama-3.3-70b-instruct:free", "api_key": os.getenv("OPENROUTER_API_KEY")}},


        # ----------------------------------------------------------------------
        # 4. VISION LLM (Multimodal text + image decoding capabilities)
        # ----------------------------------------------------------------------
        {"model_name": "visionllm", "litellm_params": {"model": "groq/llama-3.2-11b-vision-preview", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "visionllm", "litellm_params": {"model": "sambanova/Llama-3.2-11B-Vision-Instruct", "api_key": os.getenv("SAMBANOVA_API_KEY")}},
        {"model_name": "visionllm", "litellm_params": {"model": "together_ai/meta-llama/Llama-Vision-Free", "api_key": os.getenv("TOGETHER_API_KEY")}},
        {"model_name": "visionllm", "litellm_params": {"model": "deepinfra/meta-llama/Llama-3.2-90B-Vision-Instruct", "api_key": os.getenv("DEEPINFRA_API_KEY")}},


        # ----------------------------------------------------------------------
        # 5. SPEECH LLM (High-fidelity audio transcribing processing nodes)
        # ----------------------------------------------------------------------
        {"model_name": "speechllm", "litellm_params": {"model": "groq/whisper-large-v3", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "speechllm", "litellm_params": {"model": "groq/whisper-large-v3-32k", "api_key": os.getenv("GROQ_API_KEY")}},
        {"model_name": "speechllm", "litellm_params": {"model": "deepinfra/openai/whisper-large-v3", "api_key": os.getenv("DEEPINFRA_API_KEY")}},


        # ----------------------------------------------------------------------
        # 6. FIXED GEOMETRY EMBEDDINGS (1024 Dimension locked open-source)
        # ----------------------------------------------------------------------
        {"model_name": "free-embed", "litellm_params": {"model": "huggingface/BAAI/bge-large-en-v1.5", "api_key": os.getenv("HF_TOKEN")}},
        {"model_name": "free-embed", "litellm_params": {"model": "cloudflare/@cf/baai/bge-large-en-v1.5", "api_key": os.getenv("CLOUDFLARE_API_KEY"), "cloudflare_account_id": os.getenv("CLOUDFLARE_ACCOUNT_ID")}}
    ],
    "router_settings": {
        "routing_strategy": "failover",
        "allowed_fails": 1
    }
}