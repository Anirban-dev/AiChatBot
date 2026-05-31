# =============================================================================
# ── LITELLM ROUTER INTEGRATION ───────────────────────────────────────────────
# =============================================================================
import litellm
from litellm import Router
import os

os.environ['LITELLM_LOG'] = 'DEBUG'
def _make_router():
    from lib.llm_admin_logger import AdminCallbackHandler
    from litellm_models import LITELLM_ROUTER_MODELS
    litellm.callbacks = [AdminCallbackHandler()]  # ← module-level, not Router param
    return Router(**LITELLM_ROUTER_MODELS)

router = _make_router()


async def async_chat_completion(tier_name: str, messages: list, **kwargs) -> str:
    """Asynchronously streams or returns text across summaryllm, lowllm, or highllm."""
    try:
        response = await router.acompletion(
            model=tier_name,
            messages=messages,
            **kwargs
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Failover pool exhausted for tier {tier_name}. Error: {str(e)}"

async def async_embedding_call(text_list: list) -> list:
    """Asynchronously generates 1024-dimension vector listings."""
    try:
        response = await router.aembedding(
            model="free-embed",
            input=text_list
        )
        return [item["embedding"] for item in response.data]
    except Exception as e:
        print(f"Async embedding route mapping dropped: {e}")
        return []
    
# ────────── BACKWARD COMPATIBILITY CLIENT ADAPTER ──────────────────────────────────
class CompatibilityClient:
    class Chat:
        class Completions:
            async def create(self, model, messages, **kwargs):
                # Intercepts old models and maps them onto our new system tiers automatically!
                if model == "summaryllm":
                    target_tier = "summaryllm"
                elif model == "visionllm":
                    target_tier = "visionllm"
                else:
                    target_tier = "lowllm"

                # Drop-in execution to the router
                response = await router.acompletion(model=target_tier, messages=messages, **kwargs)
                return response

        def __init__(self):
            self.completions = self.Completions()

    def __init__(self):
        self.chat = self.Chat()