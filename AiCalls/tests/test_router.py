# C:\Users\KIIT\Documents\Visual Studio 2022\Projects\AiChatBot\AiCalls\tests\test_router.py
import logging
import sys

# Suppress internal startup warnings completely
logging.basicConfig(level=logging.CRITICAL)
logging.getLogger("litellm").setLevel(logging.CRITICAL)

import asyncio
import time
import litellm
from litellm import Router
from litellm_models import LITELLM_ROUTER_MODELS

router = Router(**LITELLM_ROUTER_MODELS)

async def test_single_model(tier: str, model_string: str):
    print(f"Pinging Tier [{tier}] -> Endpoint: {model_string}... ", end="", flush=True)
    start_time = time.time()
    try:
        if tier == "free-embed":
            # Pass a fast timeout limit parameter to stop freeze hangs
            await asyncio.wait_for(
                router.aembedding(model="free-embed", input=["ping"]),
                timeout=10.0
            )
        else:
            await asyncio.wait_for(
                router.acompletion(
                    model=model_string,
                    messages=[{"role": "user", "content": "ping"}],
                    max_tokens=1
                ),
                timeout=10.0
            )
        latency = time.time() - start_time
        print(f"✅ ONLINE ({latency:.2f}s)")
    except asyncio.TimeoutError:
        print("❌ OFFLINE (Reason: Connection Timed Out after 10s)")
    except Exception as e:
        err_msg = str(e).split('\n')[0][:60]
        print(f"❌ OFFLINE (Reason: {err_msg})")

async def test_all_routes():
    print("🔮 Starting Automated Free Tier API End-to-End Diagnostics...\n")
    
    for item in LITELLM_ROUTER_MODELS["model_list"]:
        tier = item["model_name"]
        model_string = item["litellm_params"]["model"]
        
        await test_single_model(tier, model_string)
        await asyncio.sleep(0.5)

if __name__ == "__main__":
    if len(sys.argv) == 3:
        tier = sys.argv[1]
        model_string = sys.argv[2]
        asyncio.run(test_single_model(tier, model_string))
    else:
        asyncio.run(test_all_routes())